import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getFeedStats,
  getJson,
  loadFeedCached,
  resetAdsbSourceState,
  snapFeedCircle,
  type SourceDeps,
} from "@/lib/adsb-sources";
import { planCoverage, wideCircleDue, type CoverageView } from "@/lib/coverage";
import {
  ADSBLOL_FREE_LIMITS,
  NEW_TILE_RESERVE,
  QuotaGuard,
  type QuotaLimits,
} from "@/lib/quota-guard";

/*
 * The adsb.lol key quota with the real tile planner, the real server cache, budget and quota guard, a fake clock
 * and a fake provider. adsb.lol answers every tile; airplanes.live refuses (as it does for Cloudflare's addresses),
 * so a request the guard holds back has nowhere else to go.
 */

const T0 = Date.UTC(2026, 10, 23, 12, 0, 0); // a Monday, noon UTC
let t = T0;
let sent = 0;
const fetchImpl = (async (url: string) => {
  if (!url.includes("api.adsb.lol")) return new Response("no", { status: 403 });
  sent++;
  return new Response(JSON.stringify({ ac: [{ hex: "abc123", lat: 1, lon: 2 }] }), {
    status: 200,
  });
}) as unknown as typeof fetch;
const deps: SourceDeps = { fetchImpl, now: () => t, paceGapMs: 0, sleep: async () => {} };

/** A map view the size of a 1440 x 900 window at a MapLibre zoom (512 px tiles), Mercator stretch ignored. */
function mapView(lat: number, lon: number, zoom: number): CoverageView {
  const degPerPx = 360 / (512 * 2 ** zoom);
  const halfLon = (1440 / 2) * degPerPx;
  const halfLat = (900 / 2) * degPerPx * Math.cos((lat * Math.PI) / 180);
  return {
    lat,
    lon,
    radiusNm: 0,
    bounds: {
      north: lat + halfLat,
      south: lat - halfLat,
      east: lon + halfLon,
      west: lon - halfLon,
    },
  };
}

/** One browser poll as use-aircraft-feed.ts makes it: the due circles, each its own server call. */
async function poll(v: CoverageView, pollIndex: number, seen: Set<string>) {
  const plan = planCoverage(v);
  let answered = 0;
  let asked = 0;
  for (let i = 0; i < plan.circles.length; i++) {
    const c = plan.circles[i]!;
    if (plan.tier === "wide" && !wideCircleDue(i, seen.has(c.key), pollIndex)) continue;
    asked++;
    const s = snapFeedCircle(c.lat, c.lon, c.radiusNm);
    const r = await loadFeedCached(s.lat, s.lon, s.radiusNm, deps);
    if (!r.error && r.aircraft.length) {
      answered++;
      seen.add(c.key);
    }
  }
  return { asked, answered };
}

beforeEach(() => {
  process.env["ADSBLOL_API_KEY"] = "test-key";
  resetAdsbSourceState();
  t = T0;
  sent = 0;
});
afterEach(() => {
  delete process.env["ADSBLOL_API_KEY"];
  resetAdsbSourceState();
});

describe("adsb.lol key quota with the real planner", () => {
  it.each([
    ["a minute", 4],
    ["ten minutes", 43],
  ])("a wide Europe view after %s of wide US views gets its aircraft", async (_, polls) => {
    const seen = new Set<string>();
    let p = 0;
    let usShown = 0;
    for (const zoom of [3, 4]) {
      for (let i = 0; i < polls; i++, p++, t += 7000) {
        usShown = (await poll(mapView(39, -98, zoom), p, seen)).answered;
      }
    }
    const europe = mapView(50, 10, 3);
    expect(planCoverage(europe).tier).toBe("wide");
    const first = await poll(europe, p, seen);
    console.info("[quota] US last poll", usShown, "Europe first poll", first, "sent", sent);
    expect(usShown).toBeGreaterThan(0);
    expect(first.answered).toBe(first.asked);
  });

  it("spreads the allowance over the hour for one zoomed-in visitor", async () => {
    const view = mapView(51.5, -0.5, 10);
    const plan = planCoverage(view);
    expect(plan.tier).toBe("fine");
    const perTenMinutes: number[] = [];
    let oldest = 0;
    for (let slice = 0; slice < 6; slice++) {
      const before = sent;
      for (let i = 0; i < 86; i++, t += 7000) {
        for (const c of plan.circles) {
          const s = snapFeedCircle(c.lat, c.lon, c.radiusNm);
          const r = await loadFeedCached(s.lat, s.lon, s.radiusNm, deps);
          expect(r.error).toBeUndefined();
          oldest = Math.max(oldest, r.ageMs ?? 0);
        }
      }
      perTenMinutes.push(sent - before);
    }
    console.info(
      `[quota] ${plan.circles.length} tile(s): sent per 10 min`,
      perTenMinutes,
      "oldest copy",
      oldest,
    );
    // Monday noon the week is the tightest window: about one refresh every 132 s, 27 an hour. Before pacing
    // the same visitor spent the hour's 255 in about half an hour, then saw old copies and an empty map.
    const total = perTenMinutes.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20);
    expect(total).toBeLessThan(40);
    // Every ten minutes gets its share: no burst, no gap.
    for (const n of perTenMinutes.slice(1)) {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
    // Each tile takes its turn (one gap more in the first round), so no copy gets near the ten-minute limit.
    expect(oldest).toBeLessThan((plan.circles.length + 1) * 140_000);
  });

  it("fetches a tile with no copy while refreshes of tiles with one wait", async () => {
    await loadFeedCached(1, 2, 50, deps);
    // Leave just the new-tile reserve in the 30-second window.
    for (let i = 0; i < 10; i++) await getJson("https://api.adsb.lol/v2/hex/x", 1000, deps);
    t += 6000;
    const before = sent;
    const old = await loadFeedCached(1, 2, 50, deps);
    expect(old.ageMs).toBe(6000);
    expect(sent).toBe(before);
    const fresh = await loadFeedCached(3, 4, 50, deps);
    expect(fresh.error).toBeUndefined();
    expect(sent).toBe(before + 1);
    expect(getFeedStats().quotaPaced).toBe(1);
  });

  it("a request the quota holds back does not put adsb.lol on a cool-down", async () => {
    for (let i = 0; i < 17; i++) await getJson("https://api.adsb.lol/v2/hex/x", 1000, deps);
    t += 1000;
    expect((await loadFeedCached(1, 2, 50, deps)).error).toBeDefined();
    t += 11_000;
    expect((await loadFeedCached(1, 2, 50, deps)).error).toBeDefined();
    // The 30-second window is clear again: the tile is fetched at once.
    t += 18_500;
    expect((await loadFeedCached(1, 2, 50, deps)).error).toBeUndefined();
  });
});

describe("QuotaGuard pacing", () => {
  it("spends what is left evenly until the tightest window ends", () => {
    const g = new QuotaGuard(ADSBLOL_FREE_LIMITS);
    // Monday noon: 4,244 requests (less the reserve) for the 6.5 days left in the week.
    expect(g.paceGapMs(T0)).toBeCloseTo((6.5 * 86_400_000) / (4250 - NEW_TILE_RESERVE), 0);
    // Sunday 18:00 with most of the week unused: the day's 844 over 6 hours, at most 255 an hour.
    const sunday = Date.UTC(2026, 10, 29, 18, 0, 0);
    expect(g.paceGapMs(sunday)).toBeCloseTo((6 * 3_600_000) / (850 - NEW_TILE_RESERVE), 0);
  });

  const oneMinute = (max: number): QuotaLimits => ({
    sliding: [{ ms: 60_000, max }],
    perDay: 1e6,
    perWeek: 1e6,
    perMonth: 1e6,
  });

  it("stops refreshes at the new-tile reserve", () => {
    const g = new QuotaGuard(oneMinute(10));
    for (let i = 0; i < 10 - NEW_TILE_RESERVE; i++) g.take(T0);
    expect(g.paceGapMs(T0)).toBe(Infinity);
    expect(g.takeRefresh(T0 + 30_000, 1e9, 0, 1)).toBe(false);
    expect(g.canSend(T0 + 30_000)).toBe(true);
  });

  it("refreshes at most once a gap, busiest tile first, watched tiles in turn", () => {
    const g = new QuotaGuard(oneMinute(19));
    g.take(T0);
    const gap = g.paceGapMs(T0); // 60 s over the 12 left above the reserve
    expect(gap).toBe(5000);
    expect(g.takeRefresh(T0 + gap - 1, 1e9, 0, 2)).toBe(false);
    // Two tiles watched, both copies three gaps old: the quiet one waits four gaps, the busy one two.
    expect(g.takeRefresh(T0 + gap, 3 * gap, 1, 2)).toBe(false);
    expect(g.takeRefresh(T0 + gap, 3 * gap, 0, 2)).toBe(true);
    expect(g.takeRefresh(T0 + gap + 1, 1e9, 0, 2)).toBe(false);
    // One gap later the tile just refreshed is not due yet, so the other one gets the slot.
    expect(g.takeRefresh(T0 + 2 * gap, gap, 0, 2)).toBe(false);
    expect(g.takeRefresh(T0 + 2 * gap, 4 * gap, 0, 2)).toBe(true);
  });
});

describe("without a key", () => {
  it("refreshes a watched tile on every poll, exactly as before", async () => {
    delete process.env["ADSBLOL_API_KEY"];
    resetAdsbSourceState();
    for (let i = 0; i < 40; i++, t += 7000) {
      expect((await loadFeedCached(1, 2, 50, deps)).error).toBeUndefined();
    }
    expect(sent).toBe(40);
    expect(getFeedStats().quotaPaced).toBe(0);
  });
});
