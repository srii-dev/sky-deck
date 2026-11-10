import { afterEach, describe, expect, it } from "vitest";

import {
  getFeedStats,
  loadFeedCached,
  resetAdsbSourceState,
  setFeedBudgetPerMinute,
  snapFeedCircle,
  type SourceDeps,
} from "@/lib/adsb-sources";
import { budgetFromEnv, DEFAULT_BUDGET_PER_MINUTE, RefreshBudget } from "@/lib/refresh-budget";

afterEach(() => {
  resetAdsbSourceState();
});

describe("RefreshBudget decisions", () => {
  const spend = (b: RefreshBudget, n: number, now: number) => {
    for (let i = 0; i < n; i++) b.noteUpstream(now);
  };

  it("refreshes everything while most of the budget is unused", () => {
    const b = new RefreshBudget({ perWindow: 100 });
    spend(b, 50, 1000);
    expect(b.decide("a", 10_000, 1000)).toBe("refresh");
  });

  it("serves every copy once the budget is used up, until the copy is too old", () => {
    const b = new RefreshBudget({ perWindow: 100 });
    spend(b, 100, 1000);
    expect(b.decide("a", 20_000, 1000)).toBe("stale");
    expect(b.decide("a", 59_000, 1000)).toBe("stale");
    // Past the hard limit a copy is always refreshed, budget or not.
    expect(b.decide("a", 61_000, 1000)).toBe("refresh");
  });

  it("lets the busiest tiles keep refreshing while the budget fills up", () => {
    const b = new RefreshBudget({ perWindow: 100 });
    // A busy tile, a middling one and a quiet one.
    for (let i = 0; i < 30; i++) b.noteRequest("busy", 1000);
    for (let i = 0; i < 10; i++) b.noteRequest("middle", 1000);
    b.noteRequest("quiet", 1000);
    spend(b, 85, 1000); // 85% used
    expect(b.demandRank("busy", 1000)).toBe(0);
    expect(b.demandRank("quiet", 1000)).toBe(1);
    expect(b.decide("busy", 10_000, 1000)).toBe("refresh");
    expect(b.decide("quiet", 10_000, 1000)).toBe("stale");
    // A quiet tile whose copy is older than the soft limit is refreshed even so.
    expect(b.decide("quiet", 31_000, 1000)).toBe("refresh");
  });

  it("gives the budget back as requests leave the window", () => {
    const b = new RefreshBudget({ perWindow: 10, windowMs: 60_000 });
    spend(b, 10, 0);
    expect(b.decide("a", 10_000, 1000)).toBe("stale");
    expect(b.used(61_000)).toBe(0);
    expect(b.decide("a", 10_000, 61_000)).toBe("refresh");
  });

  it("has no limit when the budget is zero", () => {
    const b = new RefreshBudget({ perWindow: 0 });
    spend(b, 5000, 0);
    expect(b.decide("a", 20_000, 0)).toBe("refresh");
  });

  it("ranks equal tiles equally and is zero with one tile", () => {
    const b = new RefreshBudget({ perWindow: 10 });
    expect(b.demandRank("x", 0)).toBe(0);
    b.noteRequest("a", 0);
    b.noteRequest("b", 0);
    expect(b.demandRank("a", 0)).toBe(0);
    expect(b.demandRank("b", 0)).toBe(0);
  });
});

describe("budgetFromEnv", () => {
  it("reads a whole number, zero for no limit, and falls back to the default", () => {
    expect(budgetFromEnv("120")).toBe(120);
    expect(budgetFromEnv(" 0 ")).toBe(0);
    for (const bad of [undefined, null, "", "abc", "-5", "1.5", "999999"]) {
      expect(budgetFromEnv(bad as string | undefined)).toBe(DEFAULT_BUDGET_PER_MINUTE);
    }
  });
});

/*
 * Crowd through the real server cache with a fake provider and clock: 80 tiles, a few very busy and most quiet,
 * polled every 7 s for 5 minutes. The budget must hold the upstream rate near its limit, keep the busy tiles
 * fresher than the quiet ones, and never serve a copy older than the hard limit.
 */
async function crowd(budgetPerMinute: number) {
  resetAdsbSourceState();
  setFeedBudgetPerMinute(budgetPerMinute);
  let now = 10_000_000;
  const perTile = new Map<string, number>();
  const deps: SourceDeps = {
    now: () => now,
    readsbTimeoutMs: 1000,
    deadlineMs: 5000,
    paceGapMs: 0,
    sleep: async () => {},
    fetchImpl: async (input) => {
      const url = String(input);
      perTile.set(url, (perTile.get(url) ?? 0) + 1);
      return new Response(JSON.stringify({ ac: [] }), {
        headers: { "content-type": "application/json" },
      });
    },
  };
  const TILES = 80;
  const POLLS = 43; // about 5 minutes of 7 s polls
  let oldest = 0;
  const key = (i: number) => {
    const s = snapFeedCircle(30 + i * 0.5, -100, 75);
    return `https://api.adsb.lol/v2/point/${s.lat}/${s.lon}/${s.radiusNm}`;
  };
  for (let poll = 0; poll < POLLS; poll++) {
    for (let i = 0; i < TILES; i++) {
      // Tile 0 is asked for by 20 visitors per poll, tile 1 by 10, and so on down to one.
      const visitors = Math.max(1, Math.round(20 / (i + 1)));
      const s = snapFeedCircle(30 + i * 0.5, -100, 75);
      for (let v = 0; v < visitors; v++) {
        const res = await loadFeedCached(s.lat, s.lon, s.radiusNm, deps);
        oldest = Math.max(oldest, res.ageMs ?? 0);
      }
    }
    now += 7000;
  }
  const minutes = (POLLS * 7) / 60;
  const calls = (i: number) => perTile.get(key(i)) ?? 0;
  const sum = (from: number, to: number) => {
    let n = 0;
    for (let i = from; i < to; i++) n += calls(i);
    return n;
  };
  return {
    perMinute: [...perTile.values()].reduce((a, b) => a + b, 0) / minutes,
    busyPerTile: sum(0, 8) / 8,
    quietPerTile: sum(40, 80) / 40,
    oldest,
    stats: getFeedStats(),
  };
}

describe("refresh budget under a crowd (fake provider, fake clock)", () => {
  it("holds the upstream rate near the budget, favours busy tiles and caps how old a copy gets", async () => {
    const free = await crowd(0);
    const capped = await crowd(60);
    console.info(
      "[refresh budget] upstream/min: unlimited " +
        free.perMinute.toFixed(0) +
        ", budget 60 -> " +
        capped.perMinute.toFixed(0) +
        "; per busy tile " +
        capped.busyPerTile.toFixed(1) +
        ", per quiet tile " +
        capped.quietPerTile.toFixed(1) +
        "; oldest copy served " +
        (capped.oldest / 1000).toFixed(0) +
        " s",
    );
    // Without a budget every tile is refreshed on every poll.
    expect(free.perMinute).toBeGreaterThan(400);
    expect(free.stats.budgetShed).toBe(0);
    // With it the rate is the budget plus the refreshes that cannot be avoided (about one per tile a minute).
    expect(capped.perMinute).toBeLessThan(60 * 1.2 + 80 * 1.2);
    expect(capped.perMinute).toBeLessThan(free.perMinute / 3.5);
    expect(capped.stats.budgetShed).toBeGreaterThan(0);
    // Busy tiles stay much fresher than quiet ones.
    expect(capped.busyPerTile).toBeGreaterThan(capped.quietPerTile * 2);
    // And no copy older than the hard limit (60 s) is ever served.
    expect(capped.oldest).toBeLessThanOrEqual(60_000);
  }, 60_000);

  it("always fetches a tile that has no copy yet, even with the budget used up", async () => {
    resetAdsbSourceState();
    setFeedBudgetPerMinute(1);
    let calls = 0;
    const deps: SourceDeps = {
      now: () => 1_000_000,
      paceGapMs: 0,
      sleep: async () => {},
      fetchImpl: async () => (
        calls++,
        new Response(JSON.stringify({ ac: [] }), {
          headers: { "content-type": "application/json" },
        })
      ),
    };
    for (const lat of [10, 11, 12, 13]) await loadFeedCached(lat, 0, 50, deps);
    expect(calls).toBe(4);
  });
});
