import { afterEach, describe, expect, it } from "vitest";
import {
  getFeedStats,
  loadFeedCached,
  resetAdsbSourceState,
  snapFeedCircle,
  type SourceDeps,
} from "@/lib/adsb-sources";
import { planCoverage, wideCircleDue, type CoverageView } from "@/lib/coverage";

/*
 * Load model for Phase 19f. A crowd of simulated visitors runs through the real tile planner and
 * the real server cache with a fake provider and a fake clock. No request leaves the machine.
 * It shows how the upstream request rate grows with the number of visitors.
 */

afterEach(() => {
  resetAdsbSourceState();
});

// Small seeded generator so the crowd is the same on every run.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOTSPOTS: [number, number][] = [
  [40.7, -74.0],
  [34.0, -118.4],
  [41.9, -87.9],
  [33.6, -84.4],
  [32.9, -97.0],
  [51.5, -0.5],
  [49.0, 2.5],
  [50.0, 8.6],
  [25.2, 55.4],
  [1.4, 103.9],
  [35.5, 139.8],
  [-33.9, 151.2],
];

/** 70% of visitors are zoomed in (15 to 85 nm), 30% see a wide area (300 nm). */
function crowd(n: number, seed: number): CoverageView[] {
  const rand = rng(seed);
  const views: CoverageView[] = [];
  for (let i = 0; i < n; i++) {
    const [hLat, hLon] = HOTSPOTS[Math.floor(rand() * HOTSPOTS.length)]!;
    const lat = hLat + (rand() - 0.5) * 0.8;
    const lon = hLon + (rand() - 0.5) * 0.8;
    const radiusNm = rand() < 0.7 ? 15 + rand() * 70 : 300;
    const dLat = radiusNm / 60 / Math.SQRT2;
    const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    views.push({
      lat,
      lon,
      radiusNm,
      bounds: { north: lat + dLat, south: lat - dLat, east: lon + dLon, west: lon - dLon },
    });
  }
  return views;
}

/** The request one visitor used to make before tiles: its own circle, centre rounded to 0.01. */
function legacyKeys(v: CoverageView): string[] {
  const plan = planCoverage(v);
  if (plan.tier === "wide") return plan.circles.map((c) => c.key);
  const lat = Math.round(v.lat * 100) / 100;
  const lon = Math.round(v.lon * 100) / 100;
  const s = snapFeedCircle(lat, lon, Math.round(v.radiusNm));
  return [`${s.lat},${s.lon},${s.radiusNm}`];
}

const keyOf = (lat: number, lon: number, radiusNm: number) => {
  const s = snapFeedCircle(lat, lon, radiusNm);
  return `${s.lat},${s.lon},${s.radiusNm}`;
};

const ROUNDS = 6; // 6 polls of 7 s each

async function simulate(n: number) {
  resetAdsbSourceState();
  const views = crowd(n, 42);
  let now = 1_000_000;
  const deps: SourceDeps = {
    now: () => now,
    readsbTimeoutMs: 1000,
    deadlineMs: 5000,
    paceGapMs: 0, // measure demand, not our own pacing
    sleep: async () => {},
    fetchImpl: async () =>
      new Response(JSON.stringify({ ac: [] }), {
        headers: { "content-type": "application/json" },
      }),
  };
  const legacy = new Set<string>();
  const tiles = new Set<string>();
  let offered = 0;
  for (let round = 0; round < ROUNDS; round++) {
    for (const v of views) {
      const plan = planCoverage(v);
      for (let i = 0; i < plan.circles.length; i++) {
        const c = plan.circles[i]!;
        if (plan.tier === "wide" && !wideCircleDue(i, true, round)) continue;
        offered++;
        const s = snapFeedCircle(c.lat, c.lon, c.radiusNm);
        tiles.add(keyOf(c.lat, c.lon, c.radiusNm));
        await loadFeedCached(s.lat, s.lon, s.radiusNm, deps);
      }
      for (const k of legacyKeys(v)) legacy.add(k);
    }
    now += 7000; // the cache lifetime (5 s) is shorter than the poll interval
  }
  const stats = getFeedStats();
  return {
    visitors: n,
    offeredPerPoll: offered / ROUNDS,
    upstreamPerPoll: stats.upstream / ROUNDS,
    upstreamPerSecond: stats.upstream / ROUNDS / 7,
    distinctTiles: tiles.size,
    distinctLegacy: legacy.size,
  };
}

describe("feed load model (fake provider, fake clock)", () => {
  it("upstream requests grow with the number of tiles in use, not with the number of visitors", async () => {
    const small = await simulate(10);
    const mid = await simulate(100);
    const big = await simulate(1000);
    console.info(
      "[load model] visitors | calls offered/poll | upstream/poll | upstream/s | tiles | old distinct circles\n" +
        [small, mid, big]
          .map(
            (r) =>
              `${String(r.visitors).padStart(8)} | ${r.offeredPerPoll.toFixed(0).padStart(18)} | ` +
              `${r.upstreamPerPoll.toFixed(0).padStart(13)} | ${r.upstreamPerSecond.toFixed(1).padStart(10)} | ` +
              `${String(r.distinctTiles).padStart(5)} | ${r.distinctLegacy}`,
          )
          .join("\n"),
    );
    // With the cache every distinct tile costs one upstream call per poll, no matter how many
    // visitors ask for it.
    expect(big.upstreamPerPoll).toBeLessThanOrEqual(big.distinctTiles);
    expect(big.upstreamPerPoll).toBeLessThan(big.offeredPerPoll / 5);
    // Ten times the visitors must cost far less than ten times the upstream requests.
    expect(big.upstreamPerPoll).toBeLessThan(mid.upstreamPerPoll * 4);
    // Fixed tiles need far fewer distinct requests than one circle per visitor.
    expect(big.distinctTiles).toBeLessThan(big.distinctLegacy * 0.6);
  }, 60_000);

  it("never asks the provider for more than 250 nm", async () => {
    const views = crowd(300, 7);
    for (const v of views) {
      for (const c of planCoverage(v).circles) {
        expect(snapFeedCircle(c.lat, c.lon, c.radiusNm).radiusNm).toBeLessThanOrEqual(250);
      }
    }
  });
});
