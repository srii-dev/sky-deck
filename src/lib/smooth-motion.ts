/*
 * Smooth aircraft motion (Phase 20a to 20d, 20g).
 *
 * Idea: instead of guessing where an aircraft is now (dead reckoning), draw the world a few seconds in the
 * past. Every drawn position then lies between two real samples and is interpolated, not guessed. The price is
 * latency: the display runs `delay` behind the data. The delay adapts to how late samples really arrive.
 *
 * All times are milliseconds on one clock (Date.now()). A sample's time is when the position was reported
 * (arrival time minus the provider's "seen position" age), not when we received it.
 * Pure functions only: the map and the feed hook own the clocks and the state.
 */

export interface MotionSample {
  /** When the position was reported, ms. */
  t: number;
  lat: number;
  lon: number;
  altFt: number | null;
  /** Degrees true. */
  track: number | null;
  /** Ground speed, knots. */
  gs: number | null;
  /** Vertical rate, ft/min. */
  vRate: number | null;
  onGround: boolean;
}

export type MotionPhase = "interpolated" | "backfilled" | "extrapolated" | "stale";

export interface MotionState {
  lat: number;
  lon: number;
  altFt: number | null;
  track: number | null;
  gs: number | null;
  vRate: number | null;
  onGround: boolean;
  phase: MotionPhase;
  /** How far the drawn time is beyond the newest sample (0 while interpolating), ms. */
  beyondNewestMs: number;
}

/** Samples kept per aircraft. */
export const MAX_SAMPLES = 12;
/**
 * Past the newest sample the aircraft is moved along its heading for at most this long, then held and drawn
 * dimmer. Measured on 2026-11-08 against the real feed: it sometimes stalls for 25 s or more (the provider asks
 * us to back off), and a short cap froze every aircraft and made them jump when data resumed. The old renderer
 * used 40 s. With the adaptive delay this guess is rarely needed.
 */
export const EXTRAPOLATE_CAP_MS = 30_000;
/** Before the first sample (a newly seen aircraft) it is moved backwards along its heading for at most this long. */
export const BACKFILL_CAP_MS = 12_000;
/** An aircraft missing from the data stays on screen this long after its last sample, then disappears. */
export const MISSING_KEEP_MS = 60_000;
/** It starts to fade this long before it is removed. */
export const MISSING_FADE_MS = 20_000;

const KT_TO_MS = 0.514444;
const M_PER_DEG = 111320;

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Longitude difference b - a in -180..180. */
function lonDelta(a: number, b: number): number {
  return wrapLon(b - a);
}

/** Shortest-way interpolation between two headings in degrees. */
export function lerpAngle(a: number, b: number, k: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * k) % 360) + 360) % 360;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function lerpNullable(a: number | null, b: number | null, k: number): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return lerp(a, b, k);
}

/** Position after moving along the sample's heading for dtMs (negative moves backwards). */
export function deadReckon(s: MotionSample, dtMs: number): [number, number] {
  if (s.onGround || !s.gs || s.track == null || s.gs < 30 || dtMs === 0) return [s.lat, s.lon];
  const d = s.gs * KT_TO_MS * (dtMs / 1000);
  const rad = (s.track * Math.PI) / 180;
  const dLat = (d * Math.cos(rad)) / M_PER_DEG;
  const dLon =
    (d * Math.sin(rad)) / (M_PER_DEG * Math.max(0.05, Math.cos((s.lat * Math.PI) / 180)));
  return [s.lat + dLat, wrapLon(s.lon + dLon)];
}

/** Rough distance in nautical miles between two close points. */
function approxNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = lonDelta(lon1, lon2) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon) * 60;
}

/**
 * Add a sample. Returns the same list when it adds nothing: a report that is not newer than the last one, or a
 * repeat of the same position (the provider sends the last report again until the aircraft sends a new one).
 */
export function appendSample(
  list: readonly MotionSample[],
  s: MotionSample,
  max: number = MAX_SAMPLES,
): readonly MotionSample[] {
  const last = list[list.length - 1];
  if (last) {
    if (s.t <= last.t) return list;
    if (s.lat === last.lat && s.lon === last.lon && s.altFt === last.altFt) return list;
  }
  const next = list.length >= max ? [...list.slice(list.length - max + 1), s] : [...list, s];
  return next;
}

/** A jump too big for the time and speed is a bad report or a teleport: do not glide across it. */
function isJump(a: MotionSample, b: MotionSample): boolean {
  const dtS = Math.max(0.001, (b.t - a.t) / 1000);
  const dist = approxNm(a.lat, a.lon, b.lat, b.lon);
  const speedKt = Math.max(a.gs ?? 0, b.gs ?? 0, 100);
  // Allow three times the plausible distance plus a margin for position noise.
  return dist > (speedKt * 3 * dtS) / 3600 + 2;
}

function fromSample(s: MotionSample, phase: MotionPhase, beyond: number): MotionState {
  return {
    lat: s.lat,
    lon: s.lon,
    altFt: s.altFt,
    track: s.track,
    gs: s.gs,
    vRate: s.vRate,
    onGround: s.onGround,
    phase,
    beyondNewestMs: beyond,
  };
}

/** Where the aircraft is drawn at time T. Null when there are no samples. */
export function motionAt(samples: readonly MotionSample[], T: number): MotionState | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return null;

  if (T < first.t) {
    const back = Math.min(BACKFILL_CAP_MS, first.t - T);
    const [lat, lon] = deadReckon(first, -back);
    return { ...fromSample(first, "backfilled", 0), lat, lon };
  }

  if (T >= last.t) {
    const beyond = T - last.t;
    const dt = Math.min(EXTRAPOLATE_CAP_MS, beyond);
    const [lat, lon] = deadReckon(last, dt);
    const phase: MotionPhase = beyond > EXTRAPOLATE_CAP_MS ? "stale" : "extrapolated";
    // Exactly on the newest sample is still an exact position, not a guess.
    return { ...fromSample(last, beyond === 0 ? "interpolated" : phase, beyond), lat, lon };
  }

  // Between two samples: find the pair around T.
  let i = samples.length - 1;
  while (i > 0 && (samples[i - 1]?.t ?? 0) > T) i -= 1;
  const b = samples[i];
  const a = samples[i - 1];
  if (!a || !b) return fromSample(first, "interpolated", 0);
  if (isJump(a, b)) return fromSample(a, "interpolated", 0);
  const k = (T - a.t) / (b.t - a.t);
  return {
    lat: lerp(a.lat, b.lat, k),
    lon: wrapLon(a.lon + lonDelta(a.lon, b.lon) * k),
    altFt: lerpNullable(a.altFt, b.altFt, k),
    track:
      a.track != null && b.track != null ? lerpAngle(a.track, b.track, k) : (b.track ?? a.track),
    gs: lerpNullable(a.gs, b.gs, k),
    vRate: lerpNullable(a.vRate, b.vRate, k),
    onGround: k < 0.5 ? a.onGround : b.onGround,
    phase: "interpolated",
    beyondNewestMs: 0,
  };
}

/**
 * How visible an aircraft that is missing from the data should be: 1 while it is fresh, fading to 0 over the
 * last MISSING_FADE_MS before MISSING_KEEP_MS, null once it should be removed. `sinceLastMs` is the time since
 * its newest sample.
 */
export function missingOpacity(sinceLastMs: number): number | null {
  if (sinceLastMs >= MISSING_KEEP_MS) return null;
  const fadeStart = MISSING_KEEP_MS - MISSING_FADE_MS;
  if (sinceLastMs <= fadeStart) return 1;
  return 1 - (sinceLastMs - fadeStart) / MISSING_FADE_MS;
}

// ---------- adaptive delay (20c) ----------

export type MotionMode = "smooth" | "live";

export const DEFAULT_DELAY_MS = 10_000;
export const SMOOTH_MIN_DELAY_MS = 4000;
export const SMOOTH_MAX_DELAY_MS = 25_000;
export const LIVE_MIN_DELAY_MS = 2000;
export const LIVE_MAX_DELAY_MS = 5000;
/** Extra time on top of the measured lateness. */
export const DELAY_MARGIN_MS = 1000;
/** The delay changes by at most this many ms per second, so the display speeds up or slows down by 10 percent at most. */
export const DELAY_SLEW_MS_PER_S = 100;
const HISTORY = 12;
/** Updates needed before the measured delay is trusted over the default. */
const MIN_UPDATES = 3;

export interface DelayState {
  /** The delay in use, ms. */
  delayMs: number;
  /** Recent gaps between updates, ms. */
  gaps: number[];
  /** Recent typical sample ages at arrival (median "seen position" of an update), ms. */
  ages: number[];
  lastArrival: number | null;
}

export function initialDelay(mode: MotionMode = "smooth"): DelayState {
  return {
    delayMs: mode === "smooth" ? DEFAULT_DELAY_MS : LIVE_MIN_DELAY_MS + DELAY_MARGIN_MS,
    gaps: [],
    ages: [],
    lastArrival: null,
  };
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

/** Record that an update arrived. `medianAgeMs` is the median "seen position" age of its aircraft. */
export function observeUpdate(
  state: DelayState,
  arrivalMs: number,
  medianAgeMs: number,
): DelayState {
  const gaps = [...state.gaps];
  if (state.lastArrival != null && arrivalMs > state.lastArrival) {
    gaps.push(arrivalMs - state.lastArrival);
    if (gaps.length > HISTORY) gaps.shift();
  }
  const ages = [...state.ages, Math.max(0, medianAgeMs)];
  if (ages.length > HISTORY) ages.shift();
  return { ...state, gaps, ages, lastArrival: arrivalMs };
}

/**
 * The delay that would have covered the recent lateness. In smooth mode it covers the slow updates (90th
 * percentile of the gaps) plus a typical sample age, so there is almost always a newer sample to interpolate
 * towards. Live mode only covers the typical sample age and lets the aircraft be extrapolated between updates.
 * Before enough updates are seen, the default is used.
 */
export function targetDelayMs(state: DelayState, mode: MotionMode): number {
  if (state.gaps.length < MIN_UPDATES) {
    return mode === "smooth" ? DEFAULT_DELAY_MS : LIVE_MIN_DELAY_MS + DELAY_MARGIN_MS;
  }
  const age = percentile(state.ages, 0.5);
  if (mode === "live") {
    return Math.min(LIVE_MAX_DELAY_MS, Math.max(LIVE_MIN_DELAY_MS, age + DELAY_MARGIN_MS));
  }
  const gap = percentile(state.gaps, 0.9);
  return Math.min(SMOOTH_MAX_DELAY_MS, Math.max(SMOOTH_MIN_DELAY_MS, gap + age + DELAY_MARGIN_MS));
}

/** Move the delay towards its target by at most the slew rate for the elapsed time. */
export function stepDelay(state: DelayState, mode: MotionMode, elapsedMs: number): DelayState {
  const target = targetDelayMs(state, mode);
  const maxStep = (DELAY_SLEW_MS_PER_S * Math.max(0, elapsedMs)) / 1000;
  const diff = target - state.delayMs;
  const step = Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  return step === 0 ? state : { ...state, delayMs: state.delayMs + step };
}

/** "Live, 10 s behind" style text for the delay in use. */
export function delayLabel(delayMs: number): string {
  return Math.round(delayMs / 1000) + " s behind";
}

/** Median of a list of numbers (0 when empty). */
export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}
