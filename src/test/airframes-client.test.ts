import { afterEach, describe, expect, it } from "vitest";
import {
  AIRFRAMES_BASE_URL,
  AIRFRAMES_CACHE_MS,
  AIRFRAMES_LIMIT,
  AIRFRAMES_MIN_GAP_MS,
  buildMessagesUrl,
  fetchAircraftMessages,
  resetAirframesState,
  type AirframesDeps,
} from "@/lib/airframes-client";

afterEach(() => {
  resetAirframesState();
});

/* All message data here is INVENTED. No real network request is made: fetch, clock and sleep are injected. */
const item = (id: number) => ({
  id,
  timestamp: "2026-01-02T03:04:05.000Z",
  tail: "N000XX",
  flightNumber: "TST123",
  label: "H1",
  text: "TEST " + id,
});

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) },
    ...init,
  });
}

function hang(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort);
  });
}

/** Fake time: sleep() parks the caller until flush() moves the clock forward. */
function fakeTime(start = 1_000_000) {
  let t = start;
  const waiting: { at: number; resolve: () => void }[] = [];
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => (t += ms),
    sleeps,
    sleep: (ms: number) => {
      sleeps.push(ms);
      return new Promise<void>((resolve) => waiting.push({ at: t + ms, resolve }));
    },
    async flush() {
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setImmediate(r));
        const next = waiting.sort((a, b) => a.at - b.at).shift();
        if (!next) return;
        t = Math.max(t, next.at);
        next.resolve();
      }
    },
  };
}

function setup(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const time = fakeTime();
  const calls: { url: string; init?: RequestInit; at: number }[] = [];
  const deps: AirframesDeps = {
    now: time.now,
    sleep: time.sleep,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), ...(init ? { init } : {}), at: time.now() });
      return handler(String(url), init);
    },
  };
  return { time, calls, deps };
}

describe("buildMessagesUrl", () => {
  it("builds the request for a valid hex, lower-cased", () => {
    expect(buildMessagesUrl("ABC123")).toBe(
      `${AIRFRAMES_BASE_URL}/messages?icao=abc123&limit=${AIRFRAMES_LIMIT}`,
    );
  });

  it("rejects anything that is not exactly six hex digits (the API accepts wildcard patterns)", () => {
    const bad = [
      "",
      "mock-1",
      "12345",
      "1234567",
      "ZZZZZZ",
      "abc12%",
      "abc_12",
      "%%%%%%",
      "abc12/",
    ];
    for (const b of bad) expect(buildMessagesUrl(b)).toBeNull();
  });
});

describe("fetchAircraftMessages", () => {
  it("fetches, normalises and sends only an Accept header", async () => {
    const { calls, deps } = setup(() => json([item(2), item(1)]));
    const r = await fetchAircraftMessages("abc123", deps);
    expect(r).toMatchObject({ ok: true, cached: false });
    if (r.ok) expect(r.messages.map((m) => m.id)).toEqual([2, 1]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("icao=abc123");
    expect(calls[0]!.init?.headers).toEqual({ Accept: "application/json" });
  });

  it("does not call the network for an invalid address", async () => {
    const { calls, deps } = setup(() => json([]));
    expect(await fetchAircraftMessages("mock-1", deps)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("reuses a fresh result and refetches after the cache time", async () => {
    const { calls, deps, time } = setup(() => json([item(1)]));
    await fetchAircraftMessages("abc123", deps);
    time.advance(AIRFRAMES_CACHE_MS - 1000);
    const again = await fetchAircraftMessages("abc123", deps);
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
    time.advance(2000);
    await fetchAircraftMessages("abc123", deps);
    expect(calls).toHaveLength(2);
  });

  it("shares one request between simultaneous calls for the same aircraft", async () => {
    const { calls, deps } = setup(() => json([item(1)]));
    const [a, b] = await Promise.all([
      fetchAircraftMessages("abc123", deps),
      fetchAircraftMessages("ABC123", deps),
    ]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it("spaces requests for different aircraft by the minimum gap", async () => {
    const { calls, deps, time } = setup(() => json([item(1)]));
    const t0 = time.now();
    const both = [fetchAircraftMessages("aaaaaa", deps), fetchAircraftMessages("bbbbbb", deps)];
    await time.flush();
    await Promise.all(both);
    expect(calls.map((c) => c.at - t0)).toEqual([0, AIRFRAMES_MIN_GAP_MS]);
  });

  it("pauses after a 429 with Retry-After, without calling the network, then resumes", async () => {
    let limited = true;
    const { calls, deps, time } = setup(() =>
      limited ? json({}, { status: 429, headers: { "retry-after": "7" } }) : json([item(1)]),
    );
    const first = await fetchAircraftMessages("abc123", deps);
    expect(first).toMatchObject({ ok: false, retryAfterMs: 7000 });
    expect(calls).toHaveLength(1);

    time.advance(3000);
    const during = await fetchAircraftMessages("def456", deps);
    expect(during).toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);

    limited = false;
    time.advance(5000);
    expect(await fetchAircraftMessages("def456", deps)).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("pauses for a default time after a 429 without Retry-After", async () => {
    const { deps, time } = setup(() => json({}, { status: 429 }));
    const r = await fetchAircraftMessages("abc123", deps);
    expect(r).toMatchObject({ ok: false, retryAfterMs: 60_000 });
    time.advance(30_000);
    expect(await fetchAircraftMessages("abc123", deps)).toMatchObject({ ok: false });
  });

  it("returns the data but pauses when the response says the budget is used up", async () => {
    const time0 = 1_000_000;
    const { calls, deps, time } = setup(() =>
      json([item(1)], {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor((time0 + 20_000) / 1000)),
        },
      }),
    );
    expect(await fetchAircraftMessages("abc123", deps)).toMatchObject({ ok: true });
    const next = await fetchAircraftMessages("def456", deps);
    expect(next).toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);
    time.advance(25_000);
    expect(await fetchAircraftMessages("def456", deps)).toMatchObject({ ok: true });
  });

  it("gives clear errors for 401, server errors, network failure and odd bodies", async () => {
    let mode: "401" | "500" | "net" | "text" | "obj" = "401";
    const { deps, time } = setup(() => {
      if (mode === "401") return json({}, { status: 401 });
      if (mode === "500") return json({}, { status: 500 });
      if (mode === "net") throw new Error("offline");
      if (mode === "text") return new Response("not json", { status: 200 });
      return json({ error: "x" });
    });
    const run = async (m: typeof mode) => {
      mode = m;
      time.advance(AIRFRAMES_CACHE_MS * 2);
      return fetchAircraftMessages("abc123", deps);
    };
    expect(await run("401")).toMatchObject({
      ok: false,
      error: expect.stringContaining("requires access"),
    });
    expect(await run("500")).toMatchObject({ ok: false, error: "Airframes returned HTTP 500" });
    expect(await run("net")).toMatchObject({ ok: false, error: "Could not reach Airframes" });
    expect(await run("text")).toMatchObject({
      ok: false,
      error: "Unexpected response from Airframes",
    });
    expect(await run("obj")).toMatchObject({
      ok: false,
      error: "Unexpected response from Airframes",
    });
  });

  it("gives up on a request that never answers and recovers on the next call", async () => {
    let hanging = true;
    const { calls, deps, time } = setup((_url, init) => (hanging ? hang(init) : json([item(1)])));
    const r = await fetchAircraftMessages("abc123", { ...deps, timeoutMs: 30 });
    expect(r).toMatchObject({ ok: false, error: "Could not reach Airframes" });
    hanging = false;
    time.advance(AIRFRAMES_CACHE_MS);
    expect(await fetchAircraftMessages("abc123", deps)).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("never puts message text into an error", async () => {
    const { deps } = setup(() => json([{ ...item(1), text: "SECRET-TEXT" }], { status: 500 }));
    const r = await fetchAircraftMessages("abc123", deps);
    expect(JSON.stringify(r)).not.toContain("SECRET-TEXT");
  });
});
