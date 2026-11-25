import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { Viewport } from "@/components/skydeck/map-config";
import { POLL_MS, useAircraftFeed } from "@/hooks/use-aircraft-feed";
import { getAircraftFeed, searchAircraft } from "@/lib/adsb.functions";
import {
  DATA_BUSY_MESSAGE,
  LAST_GOOD_MAX_MS,
  type Aircraft,
  type FeedResponse,
} from "@/lib/aircraft";
import { planCoverage, WIDE_NEAR_CIRCLES } from "@/lib/coverage";

vi.mock("@/lib/adsb.functions", () => ({
  getAircraftFeed: vi.fn(),
  searchAircraft: vi.fn(),
}));

type FeedArgs = { data: { lat: number; lon: number; radiusNm: number } };
const feed = getAircraftFeed as unknown as Mock<(a: FeedArgs) => Promise<FeedResponse>>;
const search = searchAircraft as unknown as Mock<
  (a: { data: { q: string } }) => Promise<{ aircraft: Aircraft[] }>
>;

function plane(hex: string, over: Partial<Aircraft> = {}): Aircraft {
  return {
    hex,
    callsign: null,
    registration: null,
    type: null,
    description: null,
    operator: null,
    lat: 40,
    lon: -74,
    altFt: 10000,
    onGround: false,
    gs: 300,
    track: 90,
    vRate: 0,
    squawk: null,
    category: null,
    kind: "jet",
    kindLabel: "Jet",
    seenPos: 1,
    ...over,
  } as Aircraft;
}

const ok = (aircraft: Aircraft[], over: Partial<FeedResponse> = {}): FeedResponse => ({
  aircraft,
  source: "adsb.lol",
  fetchedAt: Date.now(),
  ...over,
});

/** No bounds: one circle for the whole view. */
const single = (lat = 40, lon = -74): Viewport => ({ lat, lon, radiusNm: 100 });
/** A small zoomed-in view that needs several fixed tiles. */
const fine: Viewport = {
  lat: 40,
  lon: -73.4,
  radiusNm: 15,
  bounds: { north: 40.2, south: 39.8, east: -73.2, west: -73.6 },
};
/** A continent-wide view, where far tiles alternate between polls. */
const wide: Viewport = {
  lat: 40,
  lon: -95,
  radiusNm: 1200,
  bounds: { north: 50, south: 30, east: -75, west: -115 },
};

let hidden = false;
/** Lets the refresh loop's promise chain settle, so timers it schedules start from the current fake time. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
async function tick(ms: number) {
  await settle();
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await settle();
  await act(() => vi.advanceTimersByTimeAsync(0));
  await settle();
}

function setup(initial: { vp: Viewport | null; hex?: string | null; poll?: number }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    (p: { vp: Viewport | null; hex?: string | null; poll?: number }) =>
      useAircraftFeed(p.vp, p.hex ?? null, p.poll),
    { wrapper, initialProps: initial },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  feed.mockReset();
  search.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Feed request times, in ms since the test started. */
let calls: number[] = [];
let t0 = 0;
const record = () => calls.push(Date.now() - t0);
const gaps = () => calls.slice(1).map((t, i) => t - calls[i]!);
/** Each gap within 2 ms of the expected one (a request leaves a millisecond after its refresh starts). */
function expectGaps(expected: number[]) {
  const got = gaps();
  expect(got).toHaveLength(expected.length);
  got.forEach((g, i) =>
    expect(Math.abs(g - expected[i]!), `gap ${i}: ${g}`).toBeLessThanOrEqual(2),
  );
}

describe("useAircraftFeed polling cadence", () => {
  beforeEach(() => {
    calls = [];
    t0 = Date.now();
  });

  it("fetches on mount, then aims each start POLL_MS after the previous start", async () => {
    feed.mockImplementation(async () => (record(), ok([plane("aaa111")])));
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.aircraft.map((a) => a.hex)).toEqual(["aaa111"]);
    expect(result.current.source).toBe("adsb.lol");
    expect(result.current.fetchedAt).toBe(t0);
    await tick(3 * POLL_MS + 100);
    expectGaps([POLL_MS, POLL_MS, POLL_MS]);
  });

  it("subtracts a slow refresh from the wait but still leaves at least one second", async () => {
    let slow = false;
    feed.mockImplementation(() => {
      record();
      const res = ok([plane("aaa111")]);
      return slow
        ? new Promise((r) => setTimeout(() => r(res), POLL_MS - 500))
        : Promise.resolve(res);
    });
    const { result } = setup({ vp: single() });
    await tick(0);
    slow = true;
    await tick(POLL_MS + 100);
    expect(result.current.isFetching).toBe(true);
    await tick(POLL_MS - 500); // 13.6 s: the slow refresh (7 s to 13.5 s) is done.
    expect(result.current.isFetching).toBe(false);
    slow = false;
    expect(result.current.aircraft[0]!.seenPos).toBe(1);
    // Only half a second of the poll was left, so the next refresh waits the one-second floor (14.5 s). The tile
    // is still in its five-second cache then, so it is served aged instead of being asked for again.
    await tick(800);
    expect(result.current.aircraft[0]!.seenPos).toBe(1);
    await tick(200);
    expect(result.current.aircraft[0]!.seenPos).toBeCloseTo(2, 1);
    await tick(POLL_MS);
    expectGaps([POLL_MS, 2 * POLL_MS + 500]);
  });

  it("uses the battery saver interval, and a change applies from the next refresh", async () => {
    feed.mockImplementation(async () => (record(), ok([plane("aaa111")])));
    const { rerender } = setup({ vp: single(), poll: 15_000 });
    await tick(0);
    rerender({ vp: single(), poll: 7000 });
    await tick(15_000 + 2 * 7000 + 100);
    expectGaps([15_000, 7000, 7000]);
  });

  it("waits without a viewport and refreshes as soon as one arrives", async () => {
    feed.mockImplementation(async () => (record(), ok([plane("aaa111")])));
    const { rerender, result } = setup({ vp: null });
    await tick(30_000);
    expect(feed).not.toHaveBeenCalled();
    rerender({ vp: single() });
    await tick(0);
    expect(calls.map((t) => t - 30_000)).toEqual([expect.any(Number)]);
    expect(calls[0]! - 30_000).toBeLessThanOrEqual(2);
    expect(feed.mock.calls[0]![0].data).toEqual({ lat: 40, lon: -74, radiusNm: 100 });
    expect(result.current.aircraft).toHaveLength(1);
  });

  it("a new viewport refreshes straight away instead of waiting for the poll", async () => {
    feed.mockImplementation(
      async ({ data }) => (record(), ok([plane(data.lat === 40 ? "aaa111" : "bbb222")])),
    );
    const { rerender, result } = setup({ vp: single() });
    await tick(2000);
    rerender({ vp: single(45, 10) });
    await tick(0);
    expectGaps([2000]);
    expect(result.current.aircraft.map((a) => a.hex)).toEqual(["bbb222"]);
  });

  it("reuses an area fetched under five seconds ago instead of asking again", async () => {
    feed.mockImplementation(async ({ data }) => ok([plane(data.lat === 40 ? "aaa111" : "bbb222")]));
    const { rerender, result } = setup({ vp: single() });
    await tick(1000);
    rerender({ vp: single(45, 10) });
    await tick(1000);
    rerender({ vp: single() });
    await tick(0);
    expect(feed).toHaveBeenCalledTimes(2);
    expect(result.current.aircraft.map((a) => a.hex)).toEqual(["aaa111"]);
    // The cached copy is aged so dead reckoning stays right (seenPos 1 s plus about 2 s in the cache).
    expect(result.current.aircraft[0]!.seenPos).toBeGreaterThan(2.5);
    expect(result.current.aircraft[0]!.seenPos).toBeLessThan(3.5);
  });

  it("pauses while the tab is hidden, keeps the aircraft, and resumes when visible", async () => {
    feed.mockImplementation(async () => ok([plane("aaa111")]));
    const { result } = setup({ vp: single() });
    await tick(0);
    hidden = true;
    await tick(5 * 60_000);
    expect(feed).toHaveBeenCalledTimes(1);
    expect(result.current.aircraft).toHaveLength(1);
    hidden = false;
    await tick(POLL_MS + 10);
    expect(feed).toHaveBeenCalledTimes(2);
  });

  it("stops polling once unmounted", async () => {
    feed.mockImplementation(async () => ok([plane("aaa111")]));
    const { unmount } = setup({ vp: single() });
    await tick(0);
    unmount();
    await tick(60_000);
    expect(feed).toHaveBeenCalledTimes(1);
  });
});

describe("useAircraftFeed errors and backoff", () => {
  beforeEach(() => {
    calls = [];
    t0 = Date.now();
  });

  it("doubles the wait after each failed refresh, caps it at a minute, and resets on success", async () => {
    let failing = true;
    feed.mockImplementation(async () => {
      record();
      if (failing) throw new Error("network down");
      return ok([plane("aaa111")]);
    });
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.error).toBe(DATA_BUSY_MESSAGE);
    expect(result.current.fetchedAt).toBeNull();
    await tick(14_000 + 28_000 + 56_000 + 60_000 + 60_000 + 100);
    expectGaps([14_000, 28_000, 56_000, 60_000, 60_000]);

    failing = false;
    await tick(60_000);
    expect(result.current.error).toBeNull();
    expect(result.current.aircraft).toHaveLength(1);
    await tick(2 * POLL_MS);
    expectGaps([14_000, 28_000, 56_000, 60_000, 60_000, 60_000, POLL_MS, POLL_MS]);
  });

  it("treats an error answer like a failed request", async () => {
    feed.mockImplementation(async () => (record(), ok([], { error: "upstream 429" })));
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.error).toBe(DATA_BUSY_MESSAGE);
    await tick(14_100);
    expectGaps([14_000]);
  });

  it("does not let a viewport change cut a backoff short", async () => {
    feed.mockImplementation(async () => {
      record();
      throw new Error("down");
    });
    const { rerender } = setup({ vp: single() });
    await tick(1000);
    rerender({ vp: single(45, 10) });
    await tick(13_100);
    expectGaps([14_000]);
    expect(feed.mock.calls[1]![0].data.lat).toBe(45);
  });

  it("keeps the last good aircraft while every provider fails, then clears them on time", async () => {
    feed.mockImplementationOnce(async () => ok([plane("aaa111")]));
    feed.mockRejectedValue(new Error("down"));
    const { result } = setup({ vp: single() });
    await tick(0);
    const firstAt = result.current.fetchedAt!;
    await tick(POLL_MS + 10);
    expect(result.current.error).toBe(DATA_BUSY_MESSAGE);
    expect(result.current.fetchedAt).toBe(firstAt);
    expect(result.current.aircraft).toHaveLength(1);

    await tick(LAST_GOOD_MAX_MS - POLL_MS - 1000);
    expect(result.current.aircraft).toHaveLength(1);
    // Polls are backed off to a minute by now; the once-a-second check clears them anyway.
    await tick(2000);
    expect(result.current.aircraft).toEqual([]);
    expect(result.current.fetchedAt).toBe(firstAt);
  });
});

describe("useAircraftFeed areas and providers", () => {
  const plan = planCoverage(fine);
  const keyOf = (d: FeedArgs["data"]) => `${d.lat},${d.lon},${d.radiusNm}`;

  it("needs several tiles for the zoomed-in test view", () => {
    expect(plan.tier).toBe("fine");
    expect(plan.circles.length).toBeGreaterThanOrEqual(2);
  });

  it("merges tiles and keeps one record per aircraft, the fresher one", async () => {
    const [c0, c1] = plan.circles;
    feed.mockImplementation(async ({ data }) => {
      const k = keyOf(data);
      if (k === c0!.key)
        return ok([plane("aaa111", { seenPos: 5 }), plane("ccc333")], { ageMs: 8000 });
      if (k === c1!.key)
        return ok([plane("aaa111", { seenPos: 1, lat: 41 })], {
          source: "airplanes.live",
          ageMs: 3000,
        });
      return ok([], { ageMs: 5000 });
    });
    const { result } = setup({ vp: fine });
    await tick(1000);
    const a = result.current.aircraft;
    expect(a.map((x) => x.hex).sort()).toEqual(["aaa111", "ccc333"]);
    const dup = a.find((x) => x.hex === "aaa111")!;
    expect(dup.seenPos).toBe(1);
    expect(dup.source).toBe("airplanes.live");
    expect(result.current.source).toContain("adsb.lol");
    expect(result.current.source).toContain("airplanes.live");
    // The freshest tile's server-side age (plus at most the 300 ms it then sat in this browser's cache).
    expect(result.current.dataAgeMs).toBeGreaterThanOrEqual(3000);
    expect(result.current.dataAgeMs).toBeLessThan(3500);
  });

  it("reports the freshest tile's server-side age", async () => {
    let n = 0;
    feed.mockImplementation(async () => ok([], { ageMs: [8000, 3000][n++ % 2] ?? 0 }));
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.dataAgeMs).toBe(8000);
    await tick(POLL_MS + 10);
    expect(result.current.dataAgeMs).toBe(3000);
  });

  it("marks a busy primary answered by the fallback as backup, not as an error", async () => {
    feed.mockImplementation(async () =>
      ok([plane("aaa111")], { source: "airplanes.live", busy: true }),
    );
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.backup).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.source).toBe("airplanes.live");
  });

  it("a failing tile marks areas missing and reuses its last result for up to 30 s", async () => {
    const failKey = plan.circles[1]!.key;
    let failing = false;
    feed.mockImplementation(async ({ data }) => {
      if (failing && keyOf(data) === failKey) throw new Error("timeout");
      return ok([plane(keyOf(data) === failKey ? "fff000" : "aaa111")]);
    });
    const { result } = setup({ vp: fine });
    await tick(1000);
    expect(result.current.areasMissing).toBe(false);
    failing = true;

    await tick(POLL_MS + 10);
    expect(result.current.areasMissing).toBe(true);
    expect(result.current.error).toBeNull();
    const kept = result.current.aircraft.find((a) => a.hex === "fff000");
    expect(kept).toBeDefined();
    expect(kept!.seenPos).toBeGreaterThan(5);

    // Backed off (14 s, then 28 s); at the third failure the tile's copy is too old to show. Each refresh ends
    // up to 300 ms after it starts, because the requests are staggered.
    await tick(14_000);
    expect(result.current.aircraft.some((a) => a.hex === "fff000")).toBe(true);
    await tick(28_500);
    expect(result.current.aircraft.some((a) => a.hex === "fff000")).toBe(false);
    expect(result.current.aircraft.some((a) => a.hex === "aaa111")).toBe(true);
  });

  it("in a wide view asks for the far tiles only every other poll", async () => {
    const wplan = planCoverage(wide);
    const all = wplan.circles.length;
    expect(wplan.tier).toBe("wide");
    expect(all).toBeGreaterThan(WIDE_NEAR_CIRCLES);
    feed.mockImplementation(async () => ok([]));
    setup({ vp: wide });
    await tick(1000);
    expect(feed).toHaveBeenCalledTimes(all);
    const perPoll: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = feed.mock.calls.length;
      await tick(POLL_MS);
      perPoll.push(feed.mock.calls.length - before);
    }
    // Near tiles every poll, far tiles every other one (which polls is not the point).
    expect([...perPoll].sort()).toEqual([all, all, WIDE_NEAR_CIRCLES, WIDE_NEAR_CIRCLES].sort());
    expect(perPoll[0]).not.toBe(perPoll[1]);
    expect(perPoll[1]).not.toBe(perPoll[2]);
  });
});

describe("useAircraftFeed selected aircraft", () => {
  it("looks up a selected aircraft outside the feed and adds it", async () => {
    feed.mockImplementation(async () => ok([plane("aaa111")]));
    search.mockResolvedValue({ aircraft: [plane("eee555", { lat: 10 })] });
    const { result } = setup({ vp: single(), hex: "eee555" });
    await tick(0);
    await tick(0);
    expect(search).toHaveBeenCalledWith({ data: { q: "eee555" } });
    expect(result.current.aircraft.map((a) => a.hex)).toEqual(["aaa111", "eee555"]);
  });

  it("does not look up a selected aircraft that is already in the feed", async () => {
    feed.mockImplementation(async () => ok([plane("aaa111")]));
    setup({ vp: single(), hex: "aaa111" });
    await tick(0);
    await tick(POLL_MS + 10);
    expect(search).not.toHaveBeenCalled();
  });

  it("builds the selected aircraft's trail, one point per new position", async () => {
    const lats = [40, 40, 40.1];
    let n = 0;
    feed.mockImplementation(async () => ok([plane("aaa111", { lat: lats[n++] ?? 40.2 })]));
    const { result } = setup({ vp: single(), hex: "aaa111" });
    await tick(0);
    await tick(POLL_MS + 10);
    await tick(POLL_MS + 10);
    expect(result.current.trail.map((p) => p.lat)).toEqual([40, 40.1]);
  });

  it("withholds an emergency squawk until a second poll confirms it", async () => {
    feed.mockImplementation(async () => ok([plane("aaa111", { squawk: "7700" })]));
    const { result } = setup({ vp: single() });
    await tick(0);
    expect(result.current.aircraft[0]!.squawk).toBeNull();
    expect(result.current.aircraft[0]!.reportedSquawk).toBe("7700");
    await tick(POLL_MS + 10);
    expect(result.current.aircraft[0]!.squawk).toBe("7700");
  });
});
