import { describe, expect, it } from "vitest";
import {
  advanceClock,
  canReplay,
  createRecorder,
  ingest,
  offsetLabel,
  recordingSpan,
  REPLAY_LEAD_MS,
  REPLAY_LINGER_MS,
  REPLAY_MIN_SPAN_MS,
  seekClock,
  startReplay,
  togglePlay,
  trailUpTo,
  visibleAt,
  type RecordInput,
  type ReplayClock,
} from "@/lib/replay";
import { motionAt } from "@/lib/smooth-motion";

function ac(hex: string, lon: number, extra: Partial<RecordInput> = {}): RecordInput {
  return {
    hex,
    callsign: "TST" + hex,
    registration: null,
    type: "B738",
    kind: "narrowbody",
    kindLabel: "Narrowbody",
    squawk: null,
    lat: 40,
    lon,
    altFt: 10000,
    track: 90,
    gs: 450,
    vRate: 0,
    onGround: false,
    seenPos: 0,
    ...extra,
  };
}

const T0 = 1_000_000_000;

describe("recorder", () => {
  it("records positions with their report time and keeps the newest metadata", () => {
    const rec = createRecorder();
    ingest(rec, [ac("a", -74)], T0);
    ingest(rec, [ac("a", -73.99, { seenPos: 2, callsign: "NEW1" })], T0 + 7000);
    const tr = rec.tracks.get("a");
    expect(tr?.samples.map((s) => s.t)).toEqual([T0, T0 + 5000]);
    expect(tr?.meta.callsign).toBe("NEW1");
    expect(rec.totalSamples).toBe(2);
  });

  it("ignores a repeated position and bad coordinates", () => {
    const rec = createRecorder();
    ingest(rec, [ac("a", -74)], T0);
    ingest(rec, [ac("a", -74)], T0 + 7000);
    ingest(rec, [{ ...ac("b", NaN) }], T0 + 7000);
    expect(rec.tracks.get("a")?.samples).toHaveLength(1);
    expect(rec.tracks.has("b")).toBe(false);
  });

  it("drops samples older than the window and aircraft with nothing left", () => {
    const rec = createRecorder();
    ingest(rec, [ac("old", -74), ac("keep", -74)], T0, 60_000);
    ingest(rec, [ac("keep", -73.9)], T0 + 50_000, 60_000);
    ingest(rec, [ac("keep", -73.8)], T0 + 100_000, 60_000);
    expect(rec.tracks.has("old")).toBe(false);
    expect(rec.tracks.get("keep")?.samples.map((s) => s.t)).toEqual([T0 + 50_000, T0 + 100_000]);
    expect(rec.totalSamples).toBe(2);
  });

  it("keeps the total under the limit by dropping the oldest reports", () => {
    const rec = createRecorder();
    for (let i = 0; i < 10; i++) {
      ingest(rec, [ac("a", -74 + i * 0.01), ac("b", -73 + i * 0.01)], T0 + i * 1000, 1e9, 8);
    }
    expect(rec.totalSamples).toBeLessThanOrEqual(8);
    const span = recordingSpan(rec);
    expect(span?.end).toBe(T0 + 9000);
  });

  it("starts the recording at the first update, not at the oldest report", () => {
    const rec = createRecorder();
    // An aircraft whose last report was already a minute old when the page opened.
    ingest(rec, [ac("old", -74, { seenPos: 60 }), ac("new", -73)], T0, 1e9);
    ingest(rec, [ac("new", -72.9)], T0 + 30_000, 1e9);
    const span = recordingSpan(rec);
    expect(span?.start).toBe(T0);
    expect(span?.end).toBe(T0 + 30_000);
    // The old report is still kept for interpolation.
    expect(rec.tracks.get("old")?.samples[0]?.t).toBe(T0 - 60_000);
  });

  it("a copy of the map is not changed by later recording", () => {
    const rec = createRecorder();
    ingest(rec, [ac("a", -74)], T0);
    const frozen = new Map(rec.tracks);
    ingest(rec, [ac("a", -73.9)], T0 + 7000);
    expect(frozen.get("a")?.samples).toHaveLength(1);
    expect(rec.tracks.get("a")?.samples).toHaveLength(2);
  });
});

describe("replay source and clock", () => {
  function recording(spanMs: number) {
    const rec = createRecorder();
    for (let t = 0; t <= spanMs; t += 7000) ingest(rec, [ac("a", -74 + t / 1e6)], T0 + t, 1e9);
    return rec;
  }

  it("needs a minimum recording", () => {
    expect(canReplay(recording(5000))).toBe(false);
    expect(startReplay(recording(5000))).toBeNull();
    expect(canReplay(recording(REPLAY_MIN_SPAN_MS + 7000))).toBe(true);
  });

  it("starts at the beginning of a short recording and a few minutes back from the end of a long one", () => {
    const short = startReplay(recording(60_000));
    expect(short?.clock.t).toBe(short?.clock.start);
    expect(short?.clock.playing).toBe(true);
    const long = startReplay(recording(20 * 60_000), 4, 5 * 60_000);
    expect(long ? long.clock.end - long.clock.t : 0).toBe(5 * 60_000);
    expect(long?.clock.start).toBe(T0);
  });

  it("advances by elapsed time times speed and stops at the end", () => {
    const c: ReplayClock = { start: 0, end: 100_000, t: 0, speed: 4, playing: true };
    advanceClock(c, 1000);
    expect(c.t).toBe(4000);
    advanceClock(c, 60_000);
    expect(c.t).toBe(100_000);
    expect(c.playing).toBe(false);
    advanceClock(c, 1000);
    expect(c.t).toBe(100_000);
    const paused: ReplayClock = { start: 0, end: 10, t: 0, speed: 1, playing: false };
    advanceClock(paused, 5);
    expect(paused.t).toBe(0);
  });

  it("seeks within the range and toggles play, restarting from the end", () => {
    const c: ReplayClock = { start: 1000, end: 200_000, t: 5000, speed: 1, playing: false };
    seekClock(c, -5);
    expect(c.t).toBe(1000);
    seekClock(c, 9e9);
    expect(c.t).toBe(200_000);
    togglePlay(c);
    expect(c.playing).toBe(true);
    expect(c.t).toBe(140_000);
    togglePlay(c);
    expect(c.playing).toBe(false);
  });

  it("labels the offset from the end", () => {
    expect(offsetLabel({ t: 100, end: 100 })).toBe("end");
    expect(offsetLabel({ t: 0, end: 750_000 })).toBe("-12:30");
    expect(offsetLabel({ t: 0, end: 5_000 })).toBe("-0:05");
  });
});

describe("what is shown at a replay time", () => {
  const rec = createRecorder();
  ingest(rec, [ac("a", -74)], T0, 1e9);
  ingest(rec, [ac("a", -73.99)], T0 + 10_000, 1e9);
  const samples = rec.tracks.get("a")!.samples;

  it("shows an aircraft from just before its first report until a while after its last", () => {
    expect(visibleAt(samples, T0 - REPLAY_LEAD_MS - 1)).toBe(false);
    expect(visibleAt(samples, T0 - REPLAY_LEAD_MS)).toBe(true);
    expect(visibleAt(samples, T0 + 10_000 + REPLAY_LINGER_MS)).toBe(true);
    expect(visibleAt(samples, T0 + 10_000 + REPLAY_LINGER_MS + 1)).toBe(false);
    expect(visibleAt([], T0)).toBe(false);
  });

  it("interpolates between recorded reports", () => {
    const m = motionAt(samples, T0 + 5000);
    expect(m?.phase).toBe("interpolated");
    expect(m?.lon).toBeCloseTo(-73.995, 6);
  });

  it("lists the trail up to the replay time only", () => {
    expect(trailUpTo(samples, T0 + 5000)).toHaveLength(1);
    expect(trailUpTo(samples, T0 + 10_000)).toHaveLength(2);
    expect(trailUpTo(samples, T0 - 1)).toEqual([]);
  });
});
