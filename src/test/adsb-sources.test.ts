import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadFeedCached,
  loadFeedCircle,
  resetAdsbSourceState,
  searchAircraftSources,
  setFeedBudgetPerMinute,
  snapFeedCircle,
  type SourceDeps,
} from "@/lib/adsb-sources";

/* Parsing, back-off, search paths and cache eviction. Fallback order, coalescing and quota have their own files. */

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAdsbSourceState();
});
afterEach(() => {
  resetAdsbSourceState();
  vi.restoreAllMocks();
});

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const one = { hex: "abc123", lat: 1, lon: 2 };

/** A fake provider and clock; `urls` records what was asked. */
function world(reply: (url: string) => Response) {
  const w = {
    t: Date.UTC(2026, 10, 25, 12),
    urls: [] as string[],
    reply,
    deps: {} as SourceDeps,
  };
  w.deps = {
    paceGapMs: 0,
    now: () => w.t,
    fetchImpl: async (url) => {
      w.urls.push(String(url));
      return w.reply(String(url));
    },
  };
  return w;
}

describe("reading a provider's answer", () => {
  it("maps the fields, with fallbacks for altitude, heading, climb rate and position age", async () => {
    const w = world(() =>
      answer({
        aircraft: [
          {
            hex: "~ABC123",
            flight: "TST1    ",
            r: "  ",
            lat: 1,
            lon: 2,
            alt_geom: 3000,
            true_heading: 90,
            geom_rate: -64,
            seen: 4,
            gs: "fast",
          },
          { hex: "def456", lat: 1, lon: 2, alt_baro: "ground", alt_geom: 50, mag_heading: 7 },
        ],
      }),
    );
    const { aircraft } = await loadFeedCircle(1, 2, 25, w.deps);
    expect(aircraft[0]).toMatchObject({
      hex: "abc123",
      callsign: "TST1",
      registration: null,
      altFt: 3000,
      onGround: false,
      track: 90,
      vRate: -64,
      seenPos: 4,
      gs: null,
    });
    expect(aircraft[1]).toMatchObject({ altFt: 0, onGround: true, track: 7, seenPos: 0 });
  });

  it("drops entries without a position or an address, and anything that is not an object", async () => {
    const w = world(() =>
      answer({ ac: ["x", 3, null, { hex: "a1", lat: 1 }, { lat: 1, lon: 2 }, one] }),
    );
    const { aircraft } = await loadFeedCircle(1, 2, 25, w.deps);
    expect(aircraft.map((a) => a.hex)).toEqual(["abc123"]);
  });
});

describe("snapFeedCircle", () => {
  it("snaps the centre to 0.05 degrees and rounds the radius up within 5 to 250 nm", () => {
    expect(snapFeedCircle(40.6412, -73.7781, 26)).toEqual({
      lat: 40.65,
      lon: -73.8,
      radiusNm: 30,
    });
    expect(snapFeedCircle(0, 0, 0.2).radiusNm).toBe(5);
    expect(snapFeedCircle(0, 0, 900).radiusNm).toBe(250);
  });
});

describe("provider back-off", () => {
  /** Whether adsb.lol is asked again `afterMs` after the last load. */
  async function asksAdsbLolAfter(w: ReturnType<typeof world>, afterMs: number) {
    w.t += afterMs;
    w.urls = [];
    await loadFeedCircle(1, 2, 25, w.deps);
    return w.urls.some((u) => u.includes("adsb.lol"));
  }
  const failing = (status: number) =>
    world((u) => (u.includes("adsb.lol") ? answer({}, status) : answer({ ac: [] })));

  it("waits longer after a 429 than after a plain error, doubling until a success", async () => {
    const plain = failing(500);
    await loadFeedCircle(1, 2, 25, plain.deps);
    expect(await asksAdsbLolAfter(plain, 2_499)).toBe(false);
    expect(await asksAdsbLolAfter(plain, 1)).toBe(true); // 2.5 s over; fails again
    expect(await asksAdsbLolAfter(plain, 4_999)).toBe(false);
    expect(await asksAdsbLolAfter(plain, 1)).toBe(true);

    resetAdsbSourceState();
    const limited = failing(429);
    await loadFeedCircle(1, 2, 25, limited.deps);
    expect(await asksAdsbLolAfter(limited, 9_999)).toBe(false);
    limited.reply = () => answer({ ac: [] });
    expect(await asksAdsbLolAfter(limited, 1)).toBe(true); // succeeds: strikes forgotten
    limited.reply = () => answer({}, 429);
    await loadFeedCircle(1, 2, 25, limited.deps);
    expect(await asksAdsbLolAfter(limited, 10_000)).toBe(true);
  });

  it("answers busy when every provider is cooling down, without asking", async () => {
    const w = world(() => answer({}, 500));
    await loadFeedCircle(1, 2, 25, w.deps);
    w.urls = [];
    const res = await loadFeedCircle(1, 2, 25, w.deps);
    expect(w.urls).toEqual([]);
    expect(res).toMatchObject({ source: "none", busy: true, aircraft: [] });
    expect(res.error).toBeTruthy();
  });
});

describe("search", () => {
  const paths = (urls: string[]) => urls.map((u) => u.replace(/^.*\/v2\//, ""));

  it("tries the hex address first for six hex digits, then callsign and registration", async () => {
    const w = world(() => answer({ ac: [] }));
    expect(await searchAircraftSources("ABC123", w.deps)).toEqual({ aircraft: [] });
    expect(paths(w.urls)).toEqual(["hex/abc123", "callsign/ABC123", "reg/ABC123"]);
  });

  it("stops at the first path with a result and returns at most ten aircraft", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...one, hex: "abc1" + (10 + i) }));
    const w = world((u) => answer({ ac: u.includes("/reg/") ? many : [] }));
    const res = await searchAircraftSources("N123", w.deps);
    expect(res.source).toBe("adsb.lol");
    expect(res.aircraft).toHaveLength(10);
    expect(paths(w.urls)).toEqual(["callsign/N123", "reg/N123"]);
  });

  it("says search is unavailable when every provider fails", async () => {
    const w = world(() => answer({}, 503));
    expect(await searchAircraftSources("N123", w.deps)).toEqual({
      aircraft: [],
      error: "Search unavailable right now",
      busy: true,
    });
    expect(w.urls).toHaveLength(2);
  });

  it("gives up when the time budget is spent", async () => {
    const w = world(() => answer({ ac: [] }));
    w.reply = () => {
      w.t += 10_000;
      return answer({ ac: [] });
    };
    const res = await searchAircraftSources("N123", w.deps);
    expect(w.urls).toHaveLength(1);
    expect(res.busy).toBe(true);
  });
});

describe("a full tile cache", () => {
  /** 200 tiles (the cache's size) fetched at the same moment, with no refresh budget in the way. */
  async function filled() {
    setFeedBudgetPerMinute(0);
    const w = world(() => answer({ ac: [one] }));
    for (let i = 0; i < 200; i++) await loadFeedCached(i, 0, 25, w.deps);
    return w;
  }

  it("keeps copies that can still be served when it makes room", async () => {
    const w = await filled();
    w.t += 6_000;
    await loadFeedCached(500, 0, 25, w.deps);
    w.reply = () => answer({}, 500);
    const res = await loadFeedCached(0, 0, 25, w.deps);
    expect(res).toMatchObject({ busy: true, ageMs: 6_000 });
    expect(res.aircraft).toHaveLength(1);
  });

  it("drops the tile refreshed longest ago, not the one first seen longest ago", async () => {
    const w = await filled();
    w.t += 6_000;
    await loadFeedCached(0, 0, 25, w.deps); // tile 0 is refreshed
    await loadFeedCached(500, 0, 25, w.deps);
    await loadFeedCached(501, 0, 25, w.deps);
    w.t += 6_000;
    w.reply = () => answer({}, 500);
    expect((await loadFeedCached(0, 0, 25, w.deps)).aircraft).toHaveLength(1);
  });
});
