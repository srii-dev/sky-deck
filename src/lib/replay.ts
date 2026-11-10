import { appendSample, type MotionSample } from "./smooth-motion";

/*
 * Session replay (Phase 9a): the browser keeps what it saw for the last half hour and can play it back. Nothing
 * is sent anywhere and nothing survives a reload. This is only what this page received while it was open, from
 * the area the map covered, not a flight history.
 */

export const REPLAY_WINDOW_MS = 30 * 60 * 1000;
/** Upper limit on stored position reports; older ones are dropped first when it is exceeded. */
export const REPLAY_MAX_SAMPLES = 150_000;
/** Shortest recording that can be replayed. */
export const REPLAY_MIN_SPAN_MS = 20_000;
export const REPLAY_SPEEDS = [1, 4, 16, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
/** A recorded aircraft stays visible this long after its last report (it left coverage or the recording ends). */
export const REPLAY_LINGER_MS = 30_000;
/** ... and appears this long before its first report. */
export const REPLAY_LEAD_MS = 2000;

export interface RecordedMeta {
  callsign: string | null;
  registration: string | null;
  type: string | null;
  kind: string;
  kindLabel: string;
  squawk: string | null;
}

export interface RecordedTrack {
  hex: string;
  meta: RecordedMeta;
  /** Oldest first. A new array is made on every change, so a copy of the map stays valid. */
  samples: readonly MotionSample[];
}

export interface RecordInput {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  kind: string;
  kindLabel: string;
  squawk: string | null;
  lat: number;
  lon: number;
  altFt: number | null;
  track: number | null;
  gs: number | null;
  vRate: number | null;
  onGround: boolean;
  seenPos: number;
}

export interface Recorder {
  tracks: Map<string, RecordedTrack>;
  totalSamples: number;
  /** When the first update arrived (ms). The recording starts here, not at the oldest report: aircraft that were
   *  already 40 seconds old when the page opened would otherwise leave the first stretch nearly empty. */
  firstAt: number;
  /** When the latest update arrived. */
  lastAt: number;
  /** Nothing before this time is kept (the window and the size limit move it forward). */
  floor: number;
}

export function createRecorder(): Recorder {
  return {
    tracks: new Map(),
    totalSamples: 0,
    firstAt: Infinity,
    lastAt: -Infinity,
    floor: -Infinity,
  };
}

/** Add one update (all aircraft the page has at `receivedAt`). Mutates the recorder, not the arrays inside it. */
export function ingest(
  rec: Recorder,
  aircraft: readonly RecordInput[],
  receivedAt: number,
  windowMs: number = REPLAY_WINDOW_MS,
  maxSamples: number = REPLAY_MAX_SAMPLES,
): void {
  rec.firstAt = Math.min(rec.firstAt, receivedAt);
  rec.lastAt = Math.max(rec.lastAt, receivedAt);
  for (const a of aircraft) {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    const sample: MotionSample = {
      t: receivedAt - a.seenPos * 1000,
      lat: a.lat,
      lon: a.lon,
      altFt: a.altFt,
      track: a.track,
      gs: a.gs,
      vRate: a.vRate,
      onGround: a.onGround,
    };
    const prev = rec.tracks.get(a.hex);
    const meta: RecordedMeta = {
      callsign: a.callsign,
      registration: a.registration,
      type: a.type,
      kind: a.kind,
      kindLabel: a.kindLabel,
      squawk: a.squawk,
    };
    if (!prev) {
      rec.tracks.set(a.hex, { hex: a.hex, meta, samples: [sample] });
      rec.totalSamples += 1;
      continue;
    }
    // Unlimited length here: the window below decides how much is kept.
    const next = appendSample(prev.samples, sample, Number.MAX_SAFE_INTEGER);
    if (next !== prev.samples) rec.totalSamples += 1;
    rec.tracks.set(a.hex, { hex: a.hex, meta, samples: next });
  }
  prune(rec, receivedAt - windowMs, maxSamples);
}

function prune(rec: Recorder, oldest: number, maxSamples: number): void {
  rec.floor = Math.max(rec.floor, oldest);
  let total = 0;
  for (const [hex, tr] of rec.tracks) {
    let cut = 0;
    while (cut < tr.samples.length && (tr.samples[cut]?.t ?? Infinity) < oldest) cut += 1;
    if (cut >= tr.samples.length) {
      rec.tracks.delete(hex);
      continue;
    }
    if (cut > 0) rec.tracks.set(hex, { ...tr, samples: tr.samples.slice(cut) });
    total += tr.samples.length - cut;
  }
  rec.totalSamples = total;
  if (total <= maxSamples) return;
  // Still too much: drop the oldest reports until it fits, by moving the window start forward.
  const times: number[] = [];
  for (const tr of rec.tracks.values()) for (const s of tr.samples) times.push(s.t);
  times.sort((x, y) => x - y);
  const cutoff = times[total - maxSamples] ?? oldest;
  prune(rec, cutoff, Number.MAX_SAFE_INTEGER);
}

export interface RecordingSpan {
  start: number;
  end: number;
}

/** The time range covered by the recording (from the first update that is still kept to the latest), or null. */
export function recordingSpan(
  rec: Pick<Recorder, "tracks" | "firstAt" | "lastAt" | "floor">,
): RecordingSpan | null {
  if (rec.tracks.size === 0) return null;
  const start = Math.max(rec.firstAt, rec.floor);
  const end = rec.lastAt;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}
export function canReplay(rec: Pick<Recorder, "tracks" | "firstAt" | "lastAt" | "floor">): boolean {
  const span = recordingSpan(rec);
  return !!span && span.end - span.start >= REPLAY_MIN_SPAN_MS;
}

// ---------- playback clock ----------

export interface ReplayClock {
  start: number;
  end: number;
  /** The recorded time being shown, ms. */
  t: number;
  speed: ReplaySpeed;
  playing: boolean;
}

/** A frozen copy of the recording to play back, with its clock. The clock is changed in place while playing. */
export interface ReplaySource {
  tracks: ReadonlyMap<string, RecordedTrack>;
  clock: ReplayClock;
}

/** Start playing the last `lookBackMs` of the recording (all of it when shorter). Null when there is too little. */
export function startReplay(
  rec: Pick<Recorder, "tracks" | "firstAt" | "lastAt" | "floor">,
  speed: ReplaySpeed = 4,
  lookBackMs = 5 * 60 * 1000,
): ReplaySource | null {
  const span = recordingSpan(rec);
  if (!span || span.end - span.start < REPLAY_MIN_SPAN_MS) return null;
  const start = Math.max(span.start, span.end - lookBackMs);
  return {
    // A copy of the map: later recording does not change what is replayed.
    tracks: new Map(rec.tracks),
    clock: { start: span.start, end: span.end, t: start, speed, playing: true },
  };
}

/** Move the clock by real elapsed time. Stops at the end. */
export function advanceClock(clock: ReplayClock, elapsedMs: number): void {
  if (!clock.playing || elapsedMs <= 0) return;
  clock.t = Math.min(clock.end, clock.t + elapsedMs * clock.speed);
  if (clock.t >= clock.end) clock.playing = false;
}

export function seekClock(clock: ReplayClock, t: number): void {
  clock.t = Math.min(clock.end, Math.max(clock.start, t));
}

/** Press play: from the end it starts again a short way from the beginning of the lookback. */
export function togglePlay(clock: ReplayClock): void {
  if (clock.playing) {
    clock.playing = false;
    return;
  }
  if (clock.t >= clock.end) clock.t = Math.max(clock.start, clock.end - 60_000);
  clock.playing = true;
}

/** Whether a recorded aircraft is shown at replay time t. */
export function visibleAt(samples: readonly MotionSample[], t: number): boolean {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return false;
  return t >= first.t - REPLAY_LEAD_MS && t <= last.t + REPLAY_LINGER_MS;
}

/** "-12:30" style text for how far before the end of the recording t is ("live edge" at 0). */
export function offsetLabel(clock: Pick<ReplayClock, "t" | "end">): string {
  const sec = Math.max(0, Math.round((clock.end - clock.t) / 1000));
  if (sec === 0) return "end";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return "-" + m + ":" + String(s).padStart(2, "0");
}

/** The recorded positions of one aircraft up to time t, for its trail. */
export function trailUpTo(
  samples: readonly MotionSample[],
  t: number,
): { lat: number; lon: number; altFt: number | null; onGround: boolean; t: number }[] {
  const out: { lat: number; lon: number; altFt: number | null; onGround: boolean; t: number }[] =
    [];
  for (const s of samples) {
    if (s.t > t) break;
    out.push({ lat: s.lat, lon: s.lon, altFt: s.altFt, onGround: s.onGround, t: s.t });
  }
  return out;
}
