import { describe, expect, it } from "vitest";
import {
  appendSample,
  BACKFILL_CAP_MS,
  DEFAULT_DELAY_MS,
  delayLabel,
  EXTRAPOLATE_CAP_MS,
  initialDelay,
  lerpAngle,
  MAX_SAMPLES,
  median,
  missingOpacity,
  MISSING_KEEP_MS,
  motionAt,
  observeUpdate,
  stepDelay,
  targetDelayMs,
  type DelayState,
  type MotionSample,
} from "@/lib/smooth-motion";

function s(t: number, lat: number, lon: number, extra: Partial<MotionSample> = {}): MotionSample {
  return { t, lat, lon, altFt: 10000, track: 90, gs: 450, vRate: 0, onGround: false, ...extra };
}

describe("appendSample", () => {
  it("keeps order, ignores older reports and repeated positions", () => {
    let list: readonly MotionSample[] = [];
    list = appendSample(list, s(1000, 40, -74));
    list = appendSample(list, s(900, 40, -73.9));
    expect(list).toHaveLength(1);
    list = appendSample(list, s(2000, 40, -74));
    expect(list).toHaveLength(1);
    list = appendSample(list, s(3000, 40, -73.9));
    expect(list).toHaveLength(2);
  });

  it("limits the history", () => {
    let list: readonly MotionSample[] = [];
    for (let i = 0; i < MAX_SAMPLES + 5; i++)
      list = appendSample(list, s(1000 + i * 1000, 40, -74 + i * 0.01));
    expect(list).toHaveLength(MAX_SAMPLES);
    expect(list[0]?.t).toBe(1000 + 5 * 1000);
  });
});

describe("motionAt", () => {
  const a = s(0, 40, -74, { altFt: 10000, track: 90 });
  const b = s(10_000, 40, -73.9, { altFt: 12000, track: 110 });

  it("is null without samples", () => {
    expect(motionAt([], 0)).toBeNull();
  });

  it("interpolates position, altitude and heading between samples", () => {
    const m = motionAt([a, b], 5000);
    expect(m?.phase).toBe("interpolated");
    expect(m?.lat).toBeCloseTo(40, 6);
    expect(m?.lon).toBeCloseTo(-73.95, 6);
    expect(m?.altFt).toBeCloseTo(11000, 6);
    expect(m?.track).toBeCloseTo(100, 6);
  });

  it("is exact at a sample time", () => {
    const m = motionAt([a, b], 10_000);
    expect(m?.lon).toBeCloseTo(-73.9, 9);
    expect(m?.phase).toBe("interpolated");
  });

  it("turns the short way across north and across the date line", () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
    const west = s(0, 10, 179.99);
    const east = s(10_000, 10, -179.99);
    const m = motionAt([west, east], 5000);
    expect(Math.abs(m?.lon ?? 0)).toBeGreaterThan(179.98);
  });

  it("dead reckons past the newest sample, then holds and marks it stale", () => {
    const early = motionAt([a, b], 10_000 + 5000);
    expect(early?.phase).toBe("extrapolated");
    expect(early?.lon ?? 0).toBeGreaterThan(-73.9);
    const atCap = motionAt([a, b], 10_000 + EXTRAPOLATE_CAP_MS);
    const late = motionAt([a, b], 10_000 + EXTRAPOLATE_CAP_MS + 30_000);
    expect(late?.phase).toBe("stale");
    expect(late?.lon).toBeCloseTo(atCap?.lon ?? 0, 9);
    expect(late?.beyondNewestMs).toBe(EXTRAPOLATE_CAP_MS + 30_000);
  });

  it("does not move a slow or grounded aircraft by dead reckoning", () => {
    const g = s(0, 40, -74, { onGround: true, gs: 12 });
    const m = motionAt([g], 8000);
    expect(m?.lat).toBe(40);
    expect(m?.lon).toBe(-74);
  });

  it("backfills a newly seen aircraft for a limited time", () => {
    const m = motionAt([a], -3000);
    expect(m?.phase).toBe("backfilled");
    expect(m?.lon ?? 0).toBeLessThan(-74);
    const far = motionAt([a], -60_000);
    const cap = motionAt([a], -BACKFILL_CAP_MS);
    expect(far?.lon).toBeCloseTo(cap?.lon ?? 0, 9);
  });

  it("does not glide across an implausible jump", () => {
    const teleport = s(10_000, 45, -60);
    const m = motionAt([a, teleport], 5000);
    expect(m?.lat).toBe(40);
    expect(m?.lon).toBe(-74);
    expect(motionAt([a, teleport], 10_000)?.lat).toBe(45);
  });
});

describe("missing aircraft", () => {
  it("stays fully visible, then fades, then is removed", () => {
    expect(missingOpacity(0)).toBe(1);
    expect(missingOpacity(MISSING_KEEP_MS - 20_000)).toBe(1);
    const mid = missingOpacity(MISSING_KEEP_MS - 10_000);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(missingOpacity(MISSING_KEEP_MS)).toBeNull();
  });
});

describe("adaptive delay", () => {
  function feed(state: DelayState, gaps: number[], ageMs: number): DelayState {
    let t = 1_000_000;
    let st = observeUpdate(state, t, ageMs);
    for (const g of gaps) {
      t += g;
      st = observeUpdate(st, t, ageMs);
    }
    return st;
  }

  it("uses the default until enough updates are seen", () => {
    const st = initialDelay("smooth");
    expect(st.delayMs).toBe(DEFAULT_DELAY_MS);
    expect(targetDelayMs(feed(st, [7000], 2000), "smooth")).toBe(DEFAULT_DELAY_MS);
  });

  it("covers the slow updates plus the sample age in smooth mode", () => {
    const st = feed(initialDelay("smooth"), [7000, 7000, 7000, 7000, 9000], 2000);
    // 90th percentile of the gaps is 9 s, plus 2 s age, plus 1 s margin.
    expect(targetDelayMs(st, "smooth")).toBe(12_000);
  });

  it("is shorter in live mode and respects floor and ceiling", () => {
    const st = feed(initialDelay("live"), [7000, 7000, 7000, 7000], 2000);
    expect(targetDelayMs(st, "live")).toBe(3000);
    const fast = feed(initialDelay("smooth"), [500, 500, 500, 500], 0);
    expect(targetDelayMs(fast, "smooth")).toBe(4000);
    const slow = feed(initialDelay("smooth"), [60_000, 60_000, 60_000, 60_000], 5000);
    expect(targetDelayMs(slow, "smooth")).toBe(25_000);
  });

  it("changes the delay slowly", () => {
    const st = feed(initialDelay("smooth"), [20_000, 20_000, 20_000, 20_000], 2000);
    const after1s = stepDelay(st, "smooth", 1000);
    expect(after1s.delayMs - st.delayMs).toBeCloseTo(100, 6);
    // Close to the target it lands exactly.
    const near = stepDelay({ ...st, delayMs: targetDelayMs(st, "smooth") - 20 }, "smooth", 1000);
    expect(near.delayMs).toBe(targetDelayMs(st, "smooth"));
  });

  it("labels the delay and takes a median", () => {
    expect(delayLabel(10_400)).toBe("10 s behind");
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBe(0);
  });
});

/*
 * Simulated feed (20j): one aircraft flying east at 450 kt, polled about every 7 s with jitter, with some
 * updates dropped and one very late update. The display is drawn at 10 frames a second. We count visible
 * jumps (a frame step far bigger than the flight speed allows) and freezes (no movement for over a second).
 */
describe("simulated feed", () => {
  const SPEED_DEG_PER_S = (450 * 0.514444) / 111320 / Math.cos((40 * Math.PI) / 180);

  function truth(tMs: number) {
    return { lat: 40, lon: -74 + SPEED_DEG_PER_S * (tMs / 1000) };
  }

  /** Deterministic pseudo random numbers, so the test does not flake. */
  function rng(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  }

  function run(mode: "smooth" | "live", dropEvery: number) {
    const rand = rng(7);
    const arrivals: { at: number; seen: number }[] = [];
    let at = 3000;
    let n = 0;
    while (at < 240_000) {
      n += 1;
      const late = n === 12 ? 9000 : 0;
      if (n % dropEvery !== 0) arrivals.push({ at: at + late, seen: rand() * 3000 });
      at += 7000 + (rand() - 0.5) * 3000;
    }
    arrivals.sort((x, y) => x.at - y.at);

    let samples: readonly MotionSample[] = [];
    let delay = initialDelay(mode);
    let next = 0;
    let prev: { lon: number } | null = null;
    let jumps = 0;
    let freezes = 0;
    let still = 0;
    let beyondCount = 0;
    let frames = 0;
    const stepNormal = SPEED_DEG_PER_S * 0.1;
    for (let now = 0; now < 240_000; now += 100) {
      while (next < arrivals.length && (arrivals[next]?.at ?? Infinity) <= now) {
        const u = arrivals[next]!;
        const tSample = u.at - u.seen;
        const p = truth(tSample);
        samples = appendSample(samples, s(tSample, p.lat, p.lon));
        delay = observeUpdate(delay, u.at, u.seen);
        next += 1;
      }
      delay = stepDelay(delay, mode, 100);
      if (now < 40_000) continue; // let the delay settle
      const m = motionAt(samples, now - delay.delayMs);
      if (!m) continue;
      frames += 1;
      if (m.phase === "extrapolated" || m.phase === "stale") beyondCount += 1;
      if (prev) {
        const step = Math.abs(m.lon - prev.lon);
        if (step > stepNormal * 3) jumps += 1;
        if (step < stepNormal * 0.05) {
          still += 1;
          if (still > 10) freezes += 1;
        } else still = 0;
      }
      prev = { lon: m.lon };
    }
    return { jumps, freezes, beyondShare: beyondCount / frames };
  }

  it("smooth mode shows no jumps or freezes even with jitter, drops and a late update", () => {
    const r = run("smooth", 6);
    expect(r.jumps).toBe(0);
    expect(r.freezes).toBe(0);
  });

  it("smooth mode needs far less guessing than live mode", () => {
    const smooth = run("smooth", 6);
    const live = run("live", 6);
    expect(smooth.beyondShare).toBeLessThan(0.1);
    expect(live.beyondShare).toBeGreaterThan(smooth.beyondShare);
  });
});
