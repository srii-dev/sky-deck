import { describe, expect, it, vi } from "vitest";
import { createKeyedLimiter, visitorKey } from "@/lib/rate-limit";
import {
  authErrorMessage,
  emailError,
  formError,
  MAX_PASSWORD_BYTES,
  normalizeEmail,
  passwordError,
  signUpLooksRegistered,
} from "@/lib/auth-forms";
import {
  AI_LABEL,
  AiUnavailableError,
  cacheKey,
  createAiService,
  createGeminiProvider,
  createMemoryAiCache,
  createMemoryBudgetStore,
  createWorkersAiProvider,
  extractGeminiText,
  MAX_PROMPT_CHARS,
  utcDay,
  type AiProvider,
  type AiProviderName,
} from "@/lib/ai-service";

describe("keyed rate limiter", () => {
  it("allows up to max per window per visitor and tells when to retry", () => {
    const l = createKeyedLimiter({ max: 2, windowMs: 1000 });
    expect(l.allow("a", 0).ok).toBe(true);
    expect(l.allow("a", 100).ok).toBe(true);
    const third = l.allow("a", 200);
    expect(third.ok).toBe(false);
    expect(third.retryAfterMs).toBe(800);
    // Another visitor is not affected.
    expect(l.allow("b", 200).ok).toBe(true);
    // The window slides.
    expect(l.allow("a", 1001).ok).toBe(true);
  });

  it("does not count refused attempts", () => {
    const l = createKeyedLimiter({ max: 1, windowMs: 1000 });
    l.allow("a", 0);
    for (let t = 1; t < 900; t += 100) expect(l.allow("a", t).ok).toBe(false);
    expect(l.allow("a", 1000).ok).toBe(true);
  });

  it("keeps memory bounded", () => {
    const l = createKeyedLimiter({ max: 1, windowMs: 60_000, maxKeys: 3 });
    for (let i = 0; i < 10; i++) l.allow("v" + i, i);
    expect(l.size()).toBeLessThanOrEqual(3);
  });

  it("picks the visitor key from headers", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n];
    expect(visitorKey(h({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe(
      "1.2.3.4",
    );
    expect(visitorKey(h({ "x-forwarded-for": " 5.6.7.8 , 10.0.0.1" }))).toBe("5.6.7.8");
    expect(visitorKey(h({ "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
    expect(visitorKey(h({}))).toBe("unknown");
  });
});

describe("sign-in form rules", () => {
  it("checks the email", () => {
    expect(emailError("")).toMatch(/Enter/);
    expect(emailError("a b@c.de")).toMatch(/spaces/);
    expect(emailError("no-at.example.com")).not.toBeNull();
    expect(emailError("a@b")).not.toBeNull();
    expect(emailError("a@b..c")).not.toBeNull();
    expect(emailError("a@b.c.")).not.toBeNull();
    expect(emailError("@b.com")).not.toBeNull();
    expect(emailError("  Pat@Example.COM ")).toBeNull();
    expect(normalizeEmail("  Pat@Example.COM ")).toBe("pat@example.com");
    expect(emailError("a".repeat(250) + "@b.co")).toMatch(/too long/);
  });

  it("checks the password length in characters and bytes", () => {
    expect(passwordError("short")).toMatch(/at least 8/);
    expect(passwordError("longenough")).toBeNull();
    expect(passwordError("é".repeat(MAX_PASSWORD_BYTES / 2 + 1))).toMatch(/too long/);
  });

  it("only demands a password on sign-in", () => {
    expect(formError("sign-in", "a@b.co", "x")).toBeNull();
    expect(formError("sign-in", "a@b.co", "")).toMatch(/password/);
    expect(formError("sign-up", "a@b.co", "x")).toMatch(/at least 8/);
    expect(formError("sign-up", "bad", "longenough")).not.toBeNull();
  });

  it("maps Supabase errors to friendly text without showing raw messages", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toMatch(/do not match/);
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirm your email/);
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/already has an account/);
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/Too many/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many/);
    const unknown = authErrorMessage({ code: "weird", message: "secret internal detail" });
    expect(unknown).not.toContain("secret");
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
  });

  it("recognises the hidden already-registered answer", () => {
    expect(signUpLooksRegistered({ identities: [] })).toBe(true);
    expect(signUpLooksRegistered({ identities: [{}] })).toBe(false);
    expect(signUpLooksRegistered(null)).toBe(false);
  });
});

describe("AI service", () => {
  function provider(name: AiProviderName, answer: string | Error): AiProvider & { calls: number } {
    const p = {
      name,
      calls: 0,
      async generate() {
        p.calls += 1;
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
    return p;
  }
  const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
  const base = { enabled: () => true, now: () => NOW, dailyBudget: { gemini: 2, "workers-ai": 2 } };

  it("answers from the first provider, labels it and caches the answer", async () => {
    const g = provider("gemini", "  Hello  ");
    const w = provider("workers-ai", "other");
    const ai = createAiService({ ...base, providers: [g, w] });
    const first = await ai.generate({ task: "brief", prompt: "Say hi" });
    expect(first).toMatchObject({
      text: "Hello",
      provider: "gemini",
      cached: false,
      label: AI_LABEL,
    });
    const second = await ai.generate({ task: "brief", prompt: "Say hi" });
    expect(second).toMatchObject({ text: "Hello", provider: "gemini", cached: true });
    expect(g.calls).toBe(1);
    expect(w.calls).toBe(0);
  });

  it("caches the same prompt separately per task", async () => {
    const g = provider("gemini", "x");
    const ai = createAiService({ ...base, providers: [g] });
    await ai.generate({ task: "a", prompt: "same" });
    await ai.generate({ task: "b", prompt: "same" });
    expect(g.calls).toBe(2);
  });

  it("falls back when the first provider fails", async () => {
    const g = provider("gemini", new Error("boom"));
    const w = provider("workers-ai", "from workers");
    const ai = createAiService({ ...base, providers: [g, w] });
    const r = await ai.generate({ task: "t", prompt: "p" });
    expect(r.provider).toBe("workers-ai");
    expect(g.calls).toBe(1);
  });

  it("skips a provider that used its daily budget, and resets next day", async () => {
    const g = provider("gemini", "g");
    const w = provider("workers-ai", "w");
    let t = NOW;
    const ai = createAiService({
      ...base,
      now: () => t,
      dailyBudget: { gemini: 1, "workers-ai": 5 },
      providers: [g, w],
    });
    expect((await ai.generate({ task: "t", prompt: "one" })).provider).toBe("gemini");
    expect((await ai.generate({ task: "t", prompt: "two" })).provider).toBe("workers-ai");
    t += 24 * 3600 * 1000;
    expect((await ai.generate({ task: "t", prompt: "three" })).provider).toBe("gemini");
  });

  it("counts failed attempts against the budget", async () => {
    const g = provider("gemini", new Error("down"));
    const ai = createAiService({ ...base, dailyBudget: { gemini: 2 }, providers: [g] });
    await expect(ai.generate({ task: "t", prompt: "1" })).rejects.toMatchObject({
      reason: "all-failed",
    });
    await expect(ai.generate({ task: "t", prompt: "2" })).rejects.toMatchObject({
      reason: "all-failed",
    });
    await expect(ai.generate({ task: "t", prompt: "3" })).rejects.toMatchObject({
      reason: "budget",
    });
    expect(g.calls).toBe(2);
  });

  it("does nothing when the kill switch is off", async () => {
    const g = provider("gemini", "x");
    const ai = createAiService({ ...base, enabled: () => false, providers: [g] });
    await expect(ai.generate({ task: "t", prompt: "p" })).rejects.toMatchObject({
      reason: "disabled",
    });
    expect(g.calls).toBe(0);
  });

  it("refuses empty or oversized prompts and trims long answers", async () => {
    const g = provider("gemini", "x".repeat(50));
    const ai = createAiService({ ...base, providers: [g] });
    await expect(ai.generate({ task: "t", prompt: "   " })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(
      ai.generate({ task: "t", prompt: "y".repeat(MAX_PROMPT_CHARS + 1) }),
    ).rejects.toMatchObject({ reason: "invalid-request" });
    const r = await ai.generate({ task: "t", prompt: "ok", maxOutputChars: 10 });
    expect(r.text).toHaveLength(10);
  });

  it("treats an empty answer as a failure and tries the next provider", async () => {
    const g = provider("gemini", "   ");
    const w = provider("workers-ai", "real");
    const ai = createAiService({ ...base, providers: [g, w] });
    expect((await ai.generate({ task: "t", prompt: "p" })).provider).toBe("workers-ai");
  });

  it("gives up on a provider that hangs", async () => {
    vi.useFakeTimers();
    try {
      const hang: AiProvider = {
        name: "gemini",
        generate: (_p, signal) =>
          new Promise((_res, rej) =>
            signal?.addEventListener("abort", () => rej(new Error("aborted"))),
          ),
      };
      const w = provider("workers-ai", "ok");
      const ai = createAiService({ ...base, timeoutMs: 1000, providers: [hang, w] });
      const pending = ai.generate({ task: "t", prompt: "p" });
      await vi.advanceTimersByTimeAsync(1100);
      expect((await pending).provider).toBe("workers-ai");
    } finally {
      vi.useRealTimers();
    }
  });

  it("has helpers that behave", () => {
    expect(utcDay(Date.UTC(2026, 10, 9, 23, 59))).toBe("2026-11-09");
    expect(cacheKey("a", "b")).toBe(cacheKey("a", "b"));
    expect(cacheKey("a", "b")).not.toBe(cacheKey("a", "c"));
    const b = createMemoryBudgetStore();
    b.add("gemini", "d", 2);
    expect(b.used("gemini", "d")).toBe(2);
    const c = createMemoryAiCache(1000);
    c.set("k", { text: "t", provider: "gemini", generatedAt: 0 }, 0);
    expect(c.get("k", 500)?.text).toBe("t");
    expect(c.get("k", 1500)).toBeUndefined();
  });
});

describe("AI provider adapters (no network)", () => {
  it("calls Gemini with the key in a header and reads the text", async () => {
    let seen: { url: string; init: RequestInit | undefined } | null = null;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Hi " }, { text: "there" }] } }],
        }),
      );
    }) as typeof fetch;
    const p = createGeminiProvider({ apiKey: "KEY123", fetchImpl });
    expect(await p.generate("hello")).toBe("Hi there");
    const s = seen as unknown as { url: string; init: RequestInit };
    expect(s.url).not.toContain("KEY123");
    expect((s.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY123");
  });

  it("fails on an HTTP error without leaking the key", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 429 })) as typeof fetch;
    const p = createGeminiProvider({ apiKey: "KEY123", fetchImpl });
    await expect(p.generate("x")).rejects.toThrow("Gemini HTTP 429");
  });

  it("reads Gemini answers defensively", () => {
    expect(extractGeminiText(null)).toBe("");
    expect(extractGeminiText({ candidates: [] })).toBe("");
    expect(extractGeminiText({ candidates: [{ content: { parts: [{ text: 5 }] } }] })).toBe("");
  });

  it("wraps a Workers AI binding", async () => {
    const run = vi.fn(async () => ({ response: "from cf" }));
    const p = createWorkersAiProvider({ run });
    expect(await p.generate("q")).toBe("from cf");
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3.1-8b-instruct", { prompt: "q" });
    const empty = createWorkersAiProvider({ run: async () => ({}) });
    expect(await empty.generate("q")).toBe("");
  });
});
