import { afterEach, describe, expect, it } from "vitest";
import { DATA_BUSY_MESSAGE } from "@/lib/aircraft";
import {
  getFeedStats,
  loadFeedCached,
  loadFeedCircle,
  PROVIDER_MIN_GAP_MS,
  resetAdsbSourceState,
  searchAircraftSources,
  STALE_MAX_MS,
  type SourceDeps,
} from "@/lib/adsb-sources";

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

const fast: Pick<SourceDeps, "readsbTimeoutMs" | "deadlineMs" | "paceGapMs"> = {
  readsbTimeoutMs: 40,
  deadlineMs: 500,
  paceGapMs: 0, // the coalescing tests are not about pacing
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
    c.advance(20_000); // cache expired, but not too old to use as a fallback
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
      expect(r.ageMs).toBeGreaterThanOrEqual(20_000);
    }
    // one shared request: adsb.lol and airplanes.live once each
    expect(calls).toBe(2);
  });

  it("does not serve a cached result older than STALE_MAX_MS when the fetch fails", async () => {
    const c = clock();
    let fail = false;
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: async () => (fail ? new Response("no", { status: 503 }) : json({ ac: [ac] })),
    };
    await loadFeedCached(40.7, -74, 25, deps);
    c.advance(STALE_MAX_MS + 1000);
    fail = true;
    const r = await loadFeedCached(40.7, -74, 25, deps);
    expect(r.error).toBe(DATA_BUSY_MESSAGE);
    expect(r.aircraft).toHaveLength(0);
    expect(getFeedStats().staleOnError).toBe(0);
  });

  it("ages the aircraft of a cache hit so dead reckoning is not fooled", async () => {
    const c = clock();
    const deps: SourceDeps = {
      ...fast,
      now: c.now,
      fetchImpl: async () => json({ ac: [ac] }),
    };
    const first = await loadFeedCached(40.7, -74, 25, deps);
    expect(first.aircraft[0]!.seenPos).toBe(1);
    c.advance(3000);
    const hit = await loadFeedCached(40.7, -74, 25, deps);
    expect(hit.ageMs).toBe(3000);
    expect(hit.aircraft[0]!.seenPos).toBeCloseTo(4, 5);
    // the cached copy itself is not changed
    c.advance(1000);
    const hit2 = await loadFeedCached(40.7, -74, 25, deps);
    expect(hit2.aircraft[0]!.seenPos).toBeCloseTo(5, 5);
    expect(getFeedStats().hits).toBe(2);
    expect(getFeedStats().upstream).toBe(1);
  });

  it("serves a cached tile instead of waiting when the provider queue is long", async () => {
    const c = clock();
    let calls = 0;
    const deps: SourceDeps = {
      now: c.now,
      readsbTimeoutMs: 40,
      deadlineMs: 9000,
      paceGapMs: 1000,
      sleep: async () => {},
      fetchImpl: async () => {
        calls++;
        return json({ ac: [ac] });
      },
    };
    await loadFeedCached(40.7, -74, 25, deps); // tile cached
    c.advance(6000); // tile is stale (> 5 s) but usable (< 30 s)
    // build a queue: other tiles each reserve the next 1 s slot
    await Promise.all([
      loadFeedCached(41.7, -74, 25, deps),
      loadFeedCached(42.7, -74, 25, deps),
      loadFeedCached(43.7, -74, 25, deps),
      loadFeedCached(44.7, -74, 25, deps),
    ]);
    const before = calls;
    const r = await loadFeedCached(40.7, -74, 25, deps);
    expect(r.error).toBeUndefined();
    expect(r.aircraft).toHaveLength(1);
    expect(calls).toBe(before); // no new upstream request
    expect(getFeedStats().shed).toBe(1);
  });

  it("counts a caller that waited for a running fetch as shared", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const deps: SourceDeps = {
      ...fast,
      fetchImpl: async () => {
        await gate;
        return json({ ac: [ac] });
      },
    };
    const a = loadFeedCached(40.7, -74, 25, deps);
    const b = loadFeedCached(40.7, -74, 25, deps);
    release();
    await Promise.all([a, b]);
    const s = getFeedStats();
    expect(s.misses).toBe(2);
    expect(s.upstream).toBe(1);
    expect(s.shared).toBe(1);
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
      paceGapMs: 0,
      readsbTimeoutMs: 40,
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

/**
 * Fake time for pacing tests: sleep() parks the caller until flush() moves the clock forward,
 * so nothing really waits. Reserved slots use this clock.
 */
function fakeTime(start = 1_000_000) {
  let t = start;
  const waiting: { at: number; resolve: () => void }[] = [];
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleeps,
    advance: (ms: number) => (t += ms),
    sleep: (ms: number) => {
      sleeps.push(ms);
      return new Promise<void>((resolve) => waiting.push({ at: t + ms, resolve }));
    },
    /** Let pending work settle, then wake sleepers in time order until none are left. */
    async flush() {
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setImmediate(r));
        const next = waiting.sort((a, b) => a.at - b.at).shift();
        if (!next) return;
        t = Math.max(t, next.at);
        next.resolve();
      }
    },
  };
}

function recorder(time: ReturnType<typeof fakeTime>, status = 200) {
  const starts: { url: string; at: number }[] = [];
  const fetchImpl: SourceDeps["fetchImpl"] = async (url) => {
    starts.push({ url: String(url), at: time.now() });
    return status === 200 ? json({ ac: [ac] }) : new Response("no", { status });
  };
  return { starts, fetchImpl };
}

describe("provider pacing", () => {
  it("spaces concurrent requests to one provider by its gap", async () => {
    const time = fakeTime();
    const t0 = time.now();
    const { starts, fetchImpl } = recorder(time);
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    const calls = [0, 1, 2, 3].map((i) => loadFeedCircle(40 + i, -74, 25, deps));
    await time.flush();
    await Promise.all(calls);
    const gap = PROVIDER_MIN_GAP_MS["adsb.lol"]!;
    expect(starts.map((s) => s.at - t0)).toEqual([0, gap, 2 * gap, 3 * gap]);
    expect(starts.every((s) => s.url.includes("adsb.lol"))).toBe(true);
  });

  it("uses a separate gap per provider, and search shares the adsb.lol slots", async () => {
    const time = fakeTime();
    const { fetchImpl } = recorder(time);
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    const feed = loadFeedCircle(40, -74, 25, deps);
    const search = searchAircraftSources("UAL123", deps);
    await time.flush();
    await Promise.all([feed, search]);
    expect(time.sleeps).toEqual([PROVIDER_MIN_GAP_MS["adsb.lol"]]);
  });

  it("does not let a cache hit or a coalesced waiter use a slot", async () => {
    const time = fakeTime();
    const { starts, fetchImpl } = recorder(time);
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    const both = [loadFeedCached(40, -74, 25, deps), loadFeedCached(40, -74, 25, deps)];
    await time.flush();
    await Promise.all(both);
    await loadFeedCached(40, -74, 25, deps); // fresh cache hit
    expect(starts).toHaveLength(1);

    const other = loadFeedCircle(41, -74, 25, deps);
    await time.flush();
    await other;
    // exactly one earlier slot was used, so the next request waits one gap (not three)
    expect(time.sleeps).toEqual([PROVIDER_MIN_GAP_MS["adsb.lol"]]);
  });

  it("skips a cooling provider without using a slot", async () => {
    const time = fakeTime();
    const urls: string[] = [];
    const fetchImpl: SourceDeps["fetchImpl"] = async (url) => {
      urls.push(String(url));
      return String(url).includes("adsb.lol")
        ? new Response("no", { status: 500 })
        : json({ ac: [ac] });
    };
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    await loadFeedCircle(40, -74, 25, deps); // strikes adsb.lol, airplanes.live answers
    urls.length = 0;
    const two = [loadFeedCircle(41, -74, 25, deps), loadFeedCircle(42, -74, 25, deps)];
    await time.flush();
    await Promise.all(two);
    expect(urls.some((u) => u.includes("adsb.lol"))).toBe(false);
    // only airplanes.live slots were taken: 1 gap and 2 gaps behind the first call's slot
    const gap = PROVIDER_MIN_GAP_MS["airplanes.live"]!;
    expect(time.sleeps).toEqual([gap, 2 * gap]);
  });

  it("re-checks the cool-down after waking from a slot wait", async () => {
    const time = fakeTime();
    const urls: string[] = [];
    const fetchImpl: SourceDeps["fetchImpl"] = async (url) => {
      urls.push(String(url));
      return String(url).includes("adsb.lol")
        ? new Response("no", { status: 500 })
        : json({ ac: [ac] });
    };
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    const a = loadFeedCircle(40, -74, 25, deps); // takes the first adsb.lol slot, fails, strikes
    const b = loadFeedCircle(41, -74, 25, deps); // waits for the second slot
    await time.flush();
    await Promise.all([a, b]);
    expect(urls.filter((u) => u.includes("adsb.lol"))).toHaveLength(1);
  });

  it("skips to the next provider, without a slot, when the wait does not fit the deadline", async () => {
    const time = fakeTime();
    const { starts, fetchImpl } = recorder(time);
    const deps: SourceDeps = {
      now: time.now,
      sleep: time.sleep,
      fetchImpl,
      deadlineMs: 600,
      paceGapMs: 500,
    };
    const a = loadFeedCircle(40, -74, 25, deps); // adsb.lol, no wait
    const b = loadFeedCircle(41, -74, 25, deps); // wait 500 + 250 > 600 -> airplanes.live
    await time.flush();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.source).toBe("adsb.lol");
    expect(rb.source).toBe("airplanes.live");
    expect(rb.busy).toBe(true);
    expect(starts.filter((s) => s.url.includes("adsb.lol"))).toHaveLength(1);

    // b's skipped attempt reserved nothing: once a's slot passes, adsb.lol is free again.
    time.advance(500);
    time.sleeps.length = 0;
    const d = loadFeedCircle(42, -74, 25, deps);
    await time.flush();
    expect((await d).source).toBe("adsb.lol");
    expect(time.sleeps).toEqual([]);
  });

  it("clears pacing state on reset", async () => {
    const time = fakeTime();
    const { fetchImpl } = recorder(time);
    const deps: SourceDeps = { now: time.now, sleep: time.sleep, fetchImpl, deadlineMs: 9000 };
    await loadFeedCircle(40, -74, 25, deps);
    resetAdsbSourceState();
    await loadFeedCircle(41, -74, 25, deps);
    expect(time.sleeps).toEqual([]);
  });
});
