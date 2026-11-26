import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAiService,
  createGeminiProvider,
  createMemoryAiCache,
  createMemoryBudgetStore,
  createWorkersAiProvider,
  extractWorkersAiText,
  providerErrorKind,
  type AiProvider,
} from "@/lib/ai-service";

/* The cases ai-hub.test.ts and backend-foundation.test.ts leave out. */

afterEach(() => {
  vi.useRealTimers();
});

const base = { dailyBudget: { gemini: 5, "workers-ai": 5 }, enabled: () => true };
const answers = (name: AiProvider["name"], text: string): AiProvider => ({
  name,
  generate: async () => text,
});

describe("a provider that ignores the abort signal", () => {
  it("is given up on after the timeout (the Workers AI binding takes no signal)", async () => {
    vi.useFakeTimers();
    const stuck = createWorkersAiProvider({ run: () => new Promise(() => {}) });
    const ai = createAiService({
      ...base,
      timeoutMs: 1000,
      providers: [stuck, answers("gemini", "ok")],
    });
    const pending = ai.generate({ task: "t", prompt: "p" });
    // The cache key (SHA-256 in Web Crypto) resolves outside the fake clock: wait until the timeout is set.
    await vi.waitFor(() => {
      if (vi.getTimerCount() === 0) throw new Error("timeout not set yet");
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ provider: "gemini", text: "ok" });
  });
});

describe("daily reset", () => {
  it("uses the provider's own reset time when it has one", async () => {
    let t = Date.UTC(2026, 10, 25, 12);
    let calls = 0;
    const gemini: AiProvider = {
      name: "gemini",
      generate: async () => {
        calls += 1;
        if (calls === 1) throw new Error("Gemini HTTP 429 per day");
        return "back";
      },
      dailyResetAt: (now) => now + 3_600_000,
    };
    const ai = createAiService({ ...base, providers: [gemini], now: () => t });
    const req = { task: "t", prompt: "p" };
    await expect(ai.generate(req)).rejects.toMatchObject({ reason: "budget" });
    t += 3_599_999;
    await expect(ai.generate(req)).rejects.toMatchObject({ reason: "budget" });
    expect(calls).toBe(1);
    t += 1;
    expect((await ai.generate(req)).text).toBe("back");
  });
});

describe("memory stores", () => {
  it("forgets an answer after its lifetime and the oldest one when full", () => {
    const c = createMemoryAiCache(1000, 2);
    const v = { text: "a", provider: "gemini" as const, generatedAt: 0 };
    c.set("a", v, 0);
    expect(c.get("a", 1000)).toEqual(v);
    expect(c.get("a", 1001)).toBeUndefined();
    c.set("a", v, 0);
    c.set("b", v, 0);
    c.set("c", v, 0);
    expect([c.get("a", 0), c.get("b", 0), c.get("c", 0)]).toEqual([undefined, v, v]);
    c.reset();
    expect(c.get("c", 0)).toBeUndefined();
  });

  it("drops old days' counters but never today's", () => {
    const b = createMemoryBudgetStore();
    for (let d = 0; d < 50; d++) b.add("gemini", "old" + d, 1);
    b.add("workers-ai", "today", 3);
    b.add("gemini", "today", 2);
    expect(b.used("workers-ai", "today")).toBe(3);
    expect(b.used("gemini", "today")).toBe(2);
    expect(b.snapshot().length).toBeLessThanOrEqual(11);
  });
});

describe("provider answers and errors", () => {
  it("reads every Workers AI answer shape", () => {
    expect(extractWorkersAiText({ response: "a" })).toBe("a");
    expect(extractWorkersAiText({ response: [{ id: 1 }] })).toBe('[{"id":1}]');
    expect(extractWorkersAiText({ choices: [{ message: { content: "c" } }] })).toBe("c");
    expect(extractWorkersAiText({ choices: [{ message: { content: 4 } }] })).toBe("");
    expect(extractWorkersAiText(null)).toBe("");
  });

  it("tells daily, rate and other errors apart, also for non-Error throws", () => {
    expect(providerErrorKind("error 4006: daily free allocation used")).toBe("daily");
    expect(providerErrorKind(new Error("3040: capacity temporarily exceeded"))).toBe("rate");
    expect(providerErrorKind("RESOURCE_EXHAUSTED")).toBe("rate");
    expect(providerErrorKind(undefined)).toBe("other");
  });

  it("marks a Gemini 429 as per-day only when the body says so", async () => {
    const failing = (body: string) =>
      createGeminiProvider({
        apiKey: "test-key",
        fetchImpl: async () => new Response(body, { status: 429 }),
      }).generate("p");
    await expect(failing('{"quotaId":"RequestsPerDay"}')).rejects.toThrow(/per day/);
    await expect(failing('{"quotaId":"RequestsPerMinute"}')).rejects.toThrow(/429$/);
  });
});
