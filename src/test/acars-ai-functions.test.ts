import { beforeEach, describe, expect, it, vi } from "vitest";

import { DETAIL_MAX_CHARS, MAX_BATCH, ROUTINE_DETAIL_MAX_CHARS } from "@/lib/acars-ai";
import { describeAcarsBatch, explainAcars } from "@/lib/acars-ai.functions";
import { AI_BUSY_MESSAGE, AiUnavailableError } from "@/lib/ai-service";

/* The server functions behind the ACARS descriptions: input limits, per-visitor rate limits, and outcomes. */

const server = vi.hoisted(() => ({
  ip: "",
  headers: [] as [string, string][],
  ai: null as null | { acarsBriefs: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> },
}));

// A server function becomes a plain function that validates its input and runs the handler.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (d: unknown) => d;
    const builder = {
      validator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (o: { data: unknown }) => unknown) {
        return async (o: { data: unknown }) => h({ data: validate(o.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => (name === "cf-connecting-ip" ? server.ip : undefined),
  setResponseHeader: (name: string, value: string) => server.headers.push([name, value]),
}));
vi.mock("@/lib/ai.server", () => ({ getAiService: () => server.ai }));

const msg = {
  id: 7,
  flight: "UA1",
  tail: null,
  label: "H1",
  route: null,
  sourceType: "vdl",
  text: "POS N40 W073",
};

let visitor = 0;
beforeEach(() => {
  // A new visitor each time, so one test's calls do not use up another's rate limit.
  server.ip = "203.0.113." + ++visitor;
  server.headers = [];
  server.ai = {
    acarsBriefs: vi.fn(async () => ({ briefs: { 7: "Position" }, provider: "workers-ai" })),
    generate: vi.fn(async () => ({ text: "**" + "x".repeat(2000), provider: "gemini" })),
  };
});

describe("describeAcarsBatch", () => {
  const call = (messages: unknown) => describeAcarsBatch({ data: { messages } as never });

  it("returns the headlines and forbids caching the response", async () => {
    expect(await call([msg])).toEqual({
      ok: true,
      value: { 7: "Position" },
      provider: "workers-ai",
    });
    expect(server.headers).toContainEqual(["Cache-Control", "no-store"]);
  });

  it("refuses empty, oversized and malformed batches before any AI work", async () => {
    await expect(call([])).rejects.toThrow();
    await expect(call(Array(MAX_BATCH + 1).fill(msg))).rejects.toThrow();
    await expect(call([{ ...msg, text: "x".repeat(1101) }])).rejects.toThrow();
    await expect(call([{ ...msg, flight: "x".repeat(17) }])).rejects.toThrow();
    await expect(call([{ ...msg, id: -1 }])).rejects.toThrow();
    expect(server.ai!.acarsBriefs).not.toHaveBeenCalled();
  });

  it("answers busy once a visitor passes 12 calls a minute", async () => {
    for (let i = 0; i < 12; i++) expect((await call([msg])).ok).toBe(true);
    expect(await call([msg])).toMatchObject({ ok: false, busy: true });
    expect(server.ai!.acarsBriefs).toHaveBeenCalledTimes(12);
    server.ip = "198.51.100.1";
    expect((await call([msg])).ok).toBe(true);
  });

  it("says when AI is not set up", async () => {
    server.ai = null;
    expect(await call([msg])).toEqual({ ok: false, error: "AI is not set up on this server." });
  });

  it("passes on the AI service's messages, marking busy, and hides other errors", async () => {
    const fail = (e: Error) => server.ai!.acarsBriefs.mockRejectedValueOnce(e);
    fail(new AiUnavailableError("busy", AI_BUSY_MESSAGE));
    expect(await call([msg])).toEqual({ ok: false, error: AI_BUSY_MESSAGE, busy: true });
    fail(new AiUnavailableError("budget", "Daily limit."));
    expect(await call([msg])).toEqual({ ok: false, error: "Daily limit." });
    fail(new Error("secret provider detail"));
    expect(await call([msg])).toEqual({ ok: false, error: "AI description unavailable." });
  });
});

describe("explainAcars", () => {
  const call = (extra: object = {}) => explainAcars({ data: { ...msg, ...extra } as never });
  const asked = () => server.ai!.generate.mock.calls.at(-1)![0] as { maxOutputChars: number };

  it("gives a routine message a short, cleaned and capped answer", async () => {
    const res = await call();
    expect(asked()).toMatchObject({
      task: "acars-detail",
      maxOutputChars: ROUTINE_DETAIL_MAX_CHARS + 200,
    });
    expect(res).toMatchObject({ ok: true, provider: "gemini" });
    const value = (res as { value: string }).value;
    expect(value).toHaveLength(ROUTINE_DETAIL_MAX_CHARS);
    expect(value.startsWith("x")).toBe(true);
  });

  it("gives more room when the text or the browser's alert level makes it notable", async () => {
    await call({ text: "MAYDAY MAYDAY" });
    expect(asked().maxOutputChars).toBe(DETAIL_MAX_CHARS + 200);
    await call({ alert: "emergency" });
    expect(asked().maxOutputChars).toBe(DETAIL_MAX_CHARS + 200);
    await call({ alert: "position" });
    expect(asked().maxOutputChars).toBe(ROUTINE_DETAIL_MAX_CHARS + 200);
    await expect(call({ alert: "huge" })).rejects.toThrow();
  });

  it("has its own limit of 10 calls a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await call()).ok).toBe(true);
    expect(await call()).toMatchObject({ ok: false, busy: true });
    expect((await describeAcarsBatch({ data: { messages: [msg] } })).ok).toBe(true);
  });

  it("reports a missing or failing AI service", async () => {
    server.ai!.generate.mockRejectedValueOnce(new AiUnavailableError("disabled", "Off."));
    expect(await call()).toEqual({ ok: false, error: "Off." });
    server.ai = null;
    expect(await call()).toEqual({ ok: false, error: "AI is not set up on this server." });
  });
});
