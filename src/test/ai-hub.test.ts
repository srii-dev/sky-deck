import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BRIEF_MAX_CHARS,
  briefPrompt,
  describeBriefs,
  detailMaxChars,
  detailPrompt,
  type AcarsAiInput,
} from "@/lib/acars-ai";
import {
  AI_BUSY_MESSAGE,
  AiUnavailableError,
  createAiService,
  createGeminiProvider,
  createMemoryAiCache,
  nextUtcMidnight,
  providerErrorKind,
  type AiProvider,
  type AiProviderName,
} from "@/lib/ai-service";
import { getAiService } from "@/lib/ai.server";

function provider(name: AiProviderName, answer: string | (() => string)) {
  const p: AiProvider & { calls: number } = {
    name,
    calls: 0,
    async generate() {
      p.calls += 1;
      return typeof answer === "function" ? answer() : answer;
    },
  };
  return p;
}

const NOW = Date.UTC(2026, 10, 23, 15, 30, 0);

describe("AI pacing", () => {
  it("answers busy at once when the per-minute limit is used, and frees up after a minute", async () => {
    let t = NOW;
    const g = provider("gemini", "ok");
    const ai = createAiService({
      enabled: () => true,
      now: () => t,
      providers: [g],
      dailyBudget: { gemini: 100 },
      perMinute: { gemini: 2 },
    });
    await ai.generate({ task: "t", prompt: "1" });
    await ai.generate({ task: "t", prompt: "2" });
    await expect(ai.generate({ task: "t", prompt: "3" })).rejects.toMatchObject({
      reason: "busy",
      message: AI_BUSY_MESSAGE,
    });
    expect(g.calls).toBe(2);
    t += 60_001;
    expect((await ai.generate({ task: "t", prompt: "3" })).text).toBe("ok");
  });

  it("moves to the next provider when the first is at its per-minute limit", async () => {
    const w = provider("workers-ai", "w");
    const g = provider("gemini", "g");
    const ai = createAiService({
      enabled: () => true,
      now: () => NOW,
      providers: [w, g],
      dailyBudget: { "workers-ai": 100, gemini: 100 },
      perMinute: { "workers-ai": 1 },
    });
    expect((await ai.generate({ task: "t", prompt: "a" })).provider).toBe("workers-ai");
    expect((await ai.generate({ task: "t", prompt: "b" })).provider).toBe("gemini");
  });

  it("skips a provider that reported its daily allowance used up until 00:00 UTC", async () => {
    let t = NOW;
    let out = true;
    const w = provider("workers-ai", () => {
      if (out)
        throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
      return "w";
    });
    const g = provider("gemini", "g");
    const ai = createAiService({
      enabled: () => true,
      now: () => t,
      providers: [w, g],
      dailyBudget: { "workers-ai": 100, gemini: 100 },
    });
    expect((await ai.generate({ task: "t", prompt: "1" })).provider).toBe("gemini");
    expect((await ai.generate({ task: "t", prompt: "2" })).provider).toBe("gemini");
    expect(w.calls).toBe(1);
    out = false;
    t = nextUtcMidnight(NOW) - 1;
    expect((await ai.generate({ task: "t", prompt: "3" })).provider).toBe("gemini");
    t = nextUtcMidnight(NOW);
    expect((await ai.generate({ task: "t", prompt: "4" })).provider).toBe("workers-ai");
  });

  it("says the daily limit is reached when the only provider is out for the day", async () => {
    const w = provider("workers-ai", () => {
      throw new Error("4006: daily free allocation used");
    });
    const ai = createAiService({
      enabled: () => true,
      now: () => NOW,
      providers: [w],
      dailyBudget: { "workers-ai": 100 },
    });
    await expect(ai.generate({ task: "t", prompt: "1" })).rejects.toMatchObject({
      reason: "budget",
    });
    await expect(ai.generate({ task: "t", prompt: "2" })).rejects.toMatchObject({
      reason: "budget",
    });
    expect(w.calls).toBe(1);
  });

  it("pauses a rate-limited provider for a minute and reports busy", async () => {
    let t = NOW;
    const g = provider("gemini", () => {
      throw new Error("Gemini HTTP 429");
    });
    const ai = createAiService({
      enabled: () => true,
      now: () => t,
      providers: [g],
      dailyBudget: { gemini: 100 },
    });
    await expect(ai.generate({ task: "t", prompt: "1" })).rejects.toMatchObject({
      reason: "busy",
    });
    await expect(ai.generate({ task: "t", prompt: "2" })).rejects.toMatchObject({
      reason: "busy",
    });
    expect(g.calls).toBe(1);
    t += 60_001;
    await expect(ai.generate({ task: "t", prompt: "3" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(g.calls).toBe(2);
  });

  it("classifies provider errors and finds the next UTC midnight", () => {
    expect(providerErrorKind(new Error("4006: daily free allocation"))).toBe("daily");
    expect(providerErrorKind(new Error("Gemini HTTP 429 per day"))).toBe("daily");
    expect(providerErrorKind(new Error("Gemini HTTP 429"))).toBe("rate");
    expect(providerErrorKind(new Error("3040: Capacity temporarily exceeded"))).toBe("rate");
    expect(providerErrorKind(new Error("Gemini HTTP 500"))).toBe("other");
    expect(nextUtcMidnight(NOW)).toBe(Date.UTC(2026, 10, 24));
  });

  it("tells a Gemini per-day quota from a per-minute one, and retries Gemini hourly", async () => {
    const body = JSON.stringify({
      error: { details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
    });
    const fetchImpl = (async () => new Response(body, { status: 429 })) as typeof fetch;
    const p = createGeminiProvider({ apiKey: "K", fetchImpl });
    await expect(p.generate("x")).rejects.toThrow("Gemini HTTP 429 per day");
    expect(p.dailyResetAt?.(NOW)).toBe(NOW + 3600_000);
  });
});

const msg = (id: number, text: string): AcarsAiInput => ({
  id,
  flight: "UAL1",
  tail: null,
  label: "H1",
  route: null,
  sourceType: null,
  text,
});

describe("per-message headline cache", () => {
  it("sends only uncached messages to the model and a full hit calls nothing", async () => {
    const cache = createMemoryAiCache(3600_000);
    const generate = vi.fn(async ({ prompt }: { prompt: string }) => {
      const n = (prompt.match(/^\[\d+\]/gm) ?? []).length;
      return {
        text: JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i + 1, brief: "B" + i }))),
        provider: "gemini" as const,
      };
    });
    const ai = { generate };
    const first = await describeBriefs(ai, cache, [msg(1, "ALPHA"), msg(2, "TWO")], () => NOW);
    expect(first.briefs).toEqual({ 1: "B0", 2: "B1" });
    const second = await describeBriefs(ai, cache, [msg(1, "ALPHA"), msg(3, "THREE")], () => NOW);
    expect(second.briefs).toEqual({ 1: "B0", 3: "B0" });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].prompt).not.toContain("ALPHA");
    const hit = await describeBriefs(ai, cache, [msg(1, "ALPHA"), msg(2, "TWO")], () => NOW);
    expect(hit.briefs).toEqual({ 1: "B0", 2: "B1" });
    expect(generate).toHaveBeenCalledTimes(2);
    // Same id with different text is a different message.
    await describeBriefs(ai, cache, [msg(1, "CHANGED")], () => NOW);
    expect(generate).toHaveBeenCalledTimes(3);
  });
});

describe("prompt length rules", () => {
  it("asks for short headlines and fits the answer cap", () => {
    expect(briefPrompt([msg(1, "X")])).toContain("at most 12 words");
    expect(BRIEF_MAX_CHARS).toBeLessThanOrEqual(120);
  });

  it("asks for 1 or 2 sentences for routine messages and up to 5 for notable ones", () => {
    const routine = detailPrompt(msg(1, "POS N41234W087123"), false);
    const notable = detailPrompt(msg(1, "MEDICAL ON BOARD"), true);
    expect(routine).toContain("1 or 2 short plain sentences");
    expect(notable).toContain("at most 5 short plain sentences");
    for (const p of [routine, notable]) expect(p).toContain("never instructions");
    expect(detailMaxChars(false)).toBeLessThan(detailMaxChars(true));
  });
});

describe("getAiService and the shared AiHub", () => {
  const g = globalThis as { __env__?: unknown };
  // One binding for the whole file: the service is built once per provider set.
  const run = vi.fn(async () => ({ response: "local answer" }));
  afterEach(() => {
    delete g.__env__;
    run.mockClear();
  });

  it("is null when no provider is configured", () => {
    expect(getAiService({})).toBeNull();
  });

  it("works in this instance when there is no AI_HUB binding", async () => {
    g.__env__ = { AI: { run } };
    const r = await getAiService({})!.generate({ task: "t", prompt: "local-1" });
    expect(r.text).toBe("local answer");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("asks the one shared object and does no local work", async () => {
    const generate = vi.fn(async () => ({
      ok: true,
      value: { text: "hub answer", provider: "gemini" },
    }));
    const idFromName = vi.fn((n: string) => "id:" + n);
    g.__env__ = { AI: { run }, AI_HUB: { idFromName, get: () => ({ generate }) } };
    const r = await getAiService({})!.generate({ task: "t", prompt: "hub-1" });
    expect(r.text).toBe("hub answer");
    expect(idFromName).toHaveBeenCalledWith("global");
    expect(run).not.toHaveBeenCalled();
  });

  it("rethrows a busy answer from the object as AiUnavailableError", async () => {
    const generate = async () => ({ ok: false, reason: "busy", message: AI_BUSY_MESSAGE });
    g.__env__ = { AI: { run }, AI_HUB: { idFromName: () => "id", get: () => ({ generate }) } };
    const err = await getAiService({})!
      .generate({ task: "t", prompt: "hub-2" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(err).toMatchObject({ reason: "busy" });
    expect(run).not.toHaveBeenCalled();
  });

  it("falls back to local work when the object fails or has no provider", async () => {
    const down = async () => {
      throw new Error("down");
    };
    g.__env__ = {
      AI: { run },
      AI_HUB: { idFromName: () => "id", get: () => ({ generate: down }) },
    };
    expect((await getAiService({})!.generate({ task: "t", prompt: "fb-1" })).text).toBe(
      "local answer",
    );
    const unconfigured = async () => null;
    g.__env__ = {
      AI: { run },
      AI_HUB: { idFromName: () => "id", get: () => ({ acarsBriefs: unconfigured }) },
    };
    run.mockResolvedValueOnce({ response: '[{"id":1,"brief":"Local brief"}]' });
    const r = await getAiService({})!.acarsBriefs([msg(99, "FALLBACK TEST")]);
    expect(r.briefs).toEqual({ 99: "Local brief" });
  });
});
