import { describe, expect, it } from "vitest";

import {
  debugLines,
  formatBehind,
  formatLastSeen,
  lastSeenSec,
  LAST_SEEN_MIN_MS,
} from "@/lib/live-status";
import { motionAt, type MotionSample } from "@/lib/smooth-motion";

describe("lastSeenSec", () => {
  it("is null while the aircraft is reporting, or when nothing is known", () => {
    expect(lastSeenSec(null)).toBeNull();
    expect(lastSeenSec({ phase: "interpolated", beyondNewestMs: 0 })).toBeNull();
    expect(lastSeenSec({ phase: "backfilled", beyondNewestMs: 9000 })).toBeNull();
  });

  it("ignores a short gap past the newest report", () => {
    expect(lastSeenSec({ phase: "extrapolated", beyondNewestMs: LAST_SEEN_MIN_MS - 1 })).toBeNull();
  });

  it("gives whole seconds once the aircraft is silent, while extrapolated and when held", () => {
    expect(lastSeenSec({ phase: "extrapolated", beyondNewestMs: LAST_SEEN_MIN_MS })).toBe(5);
    expect(lastSeenSec({ phase: "extrapolated", beyondNewestMs: 12_900 })).toBe(12);
    expect(lastSeenSec({ phase: "stale", beyondNewestMs: 34_000 })).toBe(34);
  });

  it("is null for a missing or invalid age", () => {
    expect(lastSeenSec({ phase: "stale", beyondNewestMs: Number.NaN })).toBeNull();
  });
});

describe("text", () => {
  it("formats last seen in seconds, then minutes", () => {
    expect(formatLastSeen(34)).toBe("Last seen 34 s ago");
    expect(formatLastSeen(89)).toBe("Last seen 89 s ago");
    expect(formatLastSeen(150)).toBe("Last seen 3 min ago");
  });

  it("says how far behind the picture is, and says nothing in a replay or before it is known", () => {
    expect(formatBehind(8, false)).toBe("8 s behind");
    expect(formatBehind(7.6, false)).toBe("8 s behind");
    expect(formatBehind(8, true)).toBeNull();
    expect(formatBehind(null, false)).toBeNull();
    expect(formatBehind(undefined, false)).toBeNull();
    expect(formatBehind(Number.NaN, false)).toBeNull();
  });

  it("lists the debug numbers, including the empty and failed cases", () => {
    const base = {
      delaySec: 10,
      smooth: true,
      shown: 5,
      total: 5,
      feedAgeSec: 3,
      pollSec: 7,
      failed: false,
      selected: null,
    };
    const lines = Object.fromEntries(debugLines(base));
    expect(lines["Delay"]).toBe("10 s, Smooth mode");
    expect(lines["Aircraft"]).toBe("5");
    expect(lines["Last update"]).toBe("3 s ago");
    expect(lines["Poll every"]).toBe("7 s");
    expect(lines["Selected"]).toBe("none");
    const bad = Object.fromEntries(
      debugLines({
        ...base,
        delaySec: null,
        smooth: false,
        shown: 2,
        feedAgeSec: null,
        failed: true,
        selected: { phase: "stale", beyondNewestMs: 40_000 },
      }),
    );
    expect(bad["Delay"]).toBe("not yet known");
    expect(bad["Aircraft"]).toBe("2 shown of 5");
    expect(bad["Last update"]).toBe("none yet");
    expect(Object.fromEntries(debugLines({ ...base, failed: true }))["Last update"]).toBe(
      "3 s ago (failed)",
    );
    expect(bad["Selected"]).toBe("stale, 40 s past newest report");
  });
});

describe("a wrong browser clock changes nothing", () => {
  const sample = (t: number, lat: number): MotionSample => ({
    t,
    lat,
    lon: -73,
    altFt: 30000,
    track: 0,
    gs: 400,
    vRate: 0,
    onGround: false,
  });
  const OFFSET = 7 * 60_000; // the clock is seven minutes wrong

  it("draws the same state and the same silent time when every time is shifted together", () => {
    const real = [sample(100_000, 40), sample(107_000, 40.02), sample(114_000, 40.04)];
    const shifted = real.map((s) => ({ ...s, t: s.t + OFFSET }));
    const a = motionAt(real, 110_000);
    const b = motionAt(shifted, 110_000 + OFFSET);
    expect(b).toEqual(a);
    const late = motionAt(real, 150_000);
    const lateShifted = motionAt(shifted, 150_000 + OFFSET);
    expect(lateShifted).toEqual(late);
    expect(lastSeenSec(late)).toBe(lastSeenSec(lateShifted));
    expect(lastSeenSec(late)).not.toBeNull();
  });
});
