import { afterEach, describe, expect, it } from "vitest";
import { DATA_BUSY_MESSAGE } from "@/lib/aircraft";
import { loadFeedCached, resetAdsbSourceState, type SourceDeps } from "@/lib/adsb-sources";

afterEach(() => {
  resetAdsbSourceState();
});

const ac = { hex: "abc123", flight: "TST1", lat: 40.7, lon: -74, alt_baro: 1000, seen_pos: 1 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hang(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort);
  });
}

const fast: Pick<SourceDeps, "readsbTimeoutMs" | "openSkyTimeoutMs" | "deadlineMs"> = {
  readsbTimeoutMs: 40,
  openSkyTimeoutMs: 40,
  deadlineMs: 500,
};

/** Fake clock so cache TTL and cool-downs can be crossed without waiting. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("feed coalescing", () => {
  it("makes ONE upstream call for two simultaneous identical requests", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const deps: SourceDeps = {
      ...fast,
      fetchImpl: async () => {
        calls++;
        await gate;
        return json({ ac: [ac] });
      },
    };
    const a = loadFeedCached(40.7, -74, 25, deps);
    const b = loadFeedCached(40.7, -74, 25, deps);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(ra.aircraft).toHaveLength(1);
    expect(rb).toEqual(ra);
    expect(rb).not.toBe(ra);
  });

  it("does not merge different keys", async () => {
    let calls = 0;
    const deps: SourceDeps = {
      ...fast,
      fetchImpl: async () => {
        calls++;
        return json({ ac: [ac] });
      },
    };
    await Promise.all([loadFeedCached(40.7, -74, 25, deps), loadFeedCached(41.7, -74, 25, deps)]);
    expect(calls).toBe(2);
  });

  it("serves a fresh cache hit without any upstream call", async () => {
    let calls = 0;
    const c = clock();
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: async () => {
        calls++;
        return json({ ac: [ac] });
      },
    };
    await loadFeedCached(40.7, -74, 25, deps);
    c.advance(4000);
    await loadFeedCached(40.7, -74, 25, deps);
    expect(calls).toBe(1);
    c.advance(2000);
    await loadFeedCached(40.7, -74, 25, deps);
    expect(calls).toBe(2);
  });

  it("does not cache a failed shared request, so a later request retries", async () => {
    const c = clock();
    let fail = true;
    let calls = 0;
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: async () => {
        calls++;
        return fail ? new Response("no", { status: 503 }) : json({ ac: [ac] });
      },
    };
    const first = await loadFeedCached(40.7, -74, 25, deps);
    expect(first.error).toBe(DATA_BUSY_MESSAGE);
    const callsAfterFail = calls;

    fail = false;
    c.advance(200_000); // past the provider cool-down
    const second = await loadFeedCached(40.7, -74, 25, deps);
    expect(calls).toBeGreaterThan(callsAfterFail);
    expect(second.error).toBeUndefined();
    expect(second.aircraft).toHaveLength(1);
  });

  it("gives every waiter the stale-with-busy fallback when the shared request fails", async () => {
    const c = clock();
    let fail = false;
    let calls = 0;
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: async () => {
        calls++;
        return fail ? new Response("no", { status: 503 }) : json({ ac: [ac] });
      },
    };
    await loadFeedCached(40.7, -74, 25, deps);
    c.advance(200_000); // cache expired
    fail = true;
    calls = 0;
    const [a, b] = await Promise.all([
      loadFeedCached(40.7, -74, 25, deps),
      loadFeedCached(40.7, -74, 25, deps),
    ]);
    for (const r of [a, b]) {
      expect(r.error).toBe(DATA_BUSY_MESSAGE);
      expect(r.busy).toBe(true);
      expect(r.aircraft).toHaveLength(1);
    }
    // one shared request: adsb.lol, airplanes.live and OpenSky once each
    expect(calls).toBe(3);
  });

  it("clears the in-flight entry after a timed-out request", async () => {
    const c = clock();
    let hanging = true;
    let calls = 0;
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: (_url, init) => {
        calls++;
        return hanging ? hang(init) : Promise.resolve(json({ ac: [ac] }));
      },
    };
    const first = await loadFeedCached(40.7, -74, 25, deps);
    expect(first.error).toBe(DATA_BUSY_MESSAGE);
    hanging = false;
    c.advance(200_000);
    const before = calls;
    const second = await loadFeedCached(40.7, -74, 25, deps);
    expect(calls).toBe(before + 1);
    expect(second.error).toBeUndefined();
  });

  it("lets a waiter give up when the shared request never settles, and recovers", async () => {
    let neverSettle = true;
    let calls = 0;
    const deps: SourceDeps = {
      readsbTimeoutMs: 40,
      openSkyTimeoutMs: 40,
      deadlineMs: 300, // above MIN_ATTEMPT_MS; waiter limit = 300 + 500 ms margin
      fetchImpl: () => {
        calls++;
        return neverSettle ? new Promise<Response>(() => {}) : Promise.resolve(json({ ac: [ac] }));
      },
    };
    const [a, b] = await Promise.all([
      loadFeedCached(40.7, -74, 25, deps),
      loadFeedCached(40.7, -74, 25, deps),
    ]);
    expect(calls).toBe(1);
    expect(a.error).toBe(DATA_BUSY_MESSAGE);
    expect(b.error).toBe(DATA_BUSY_MESSAGE);

    neverSettle = false;
    const c = await loadFeedCached(40.7, -74, 25, deps);
    expect(calls).toBe(2);
    expect(c.error).toBeUndefined();
  });
});
