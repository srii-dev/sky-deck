import { altitudeColor, isEmergency, type Aircraft } from "@/lib/aircraft";
import type { ReplaySource } from "@/lib/replay";
import { appendSample, motionAt, type MotionSample, type MotionState } from "@/lib/smooth-motion";
import type { Track } from "./types";

export function toSample(a: Aircraft, receivedAt: number): MotionSample {
  return {
    t: receivedAt - a.seenPos * 1000,
    lat: a.lat,
    lon: a.lon,
    altFt: a.altFt,
    track: a.track,
    gs: a.gs,
    vRate: a.vRate,
    onGround: a.onGround,
  };
}

/** Where a track is drawn at time T (the delayed clock). */
export function trackState(tr: Track, T: number): MotionState {
  return (
    motionAt(tr.samples, T) ?? {
      lat: tr.a.lat,
      lon: tr.a.lon,
      altFt: tr.a.altFt,
      track: tr.a.track,
      gs: tr.a.gs,
      vRate: tr.a.vRate,
      onGround: tr.a.onGround,
      phase: "stale",
      beyondNewestMs: 0,
    }
  );
}

/**
 * Adds one data update to the tracks. Aircraft in the update get a new sample; one that is filtered out (still in
 * `present`) is removed now, and one missing from the data is kept as a fading ghost. `ages` are the update's
 * report ages in milliseconds, for measuring how late updates arrive.
 */
export function mergeAircraft(
  tracks: ReadonlyMap<string, Track>,
  aircraft: readonly Aircraft[],
  received: number,
  present: ReadonlySet<string> | undefined,
): { tracks: Map<string, Track>; ages: number[] } {
  const seen = new Set<string>();
  const next = new Map(tracks);
  const ages: number[] = [];
  for (const a of aircraft) {
    seen.add(a.hex);
    const prev = next.get(a.hex);
    next.set(a.hex, {
      a,
      samples: appendSample(prev?.samples ?? [], toSample(a, received)),
      color: altitudeColor(a.altFt, a.onGround),
      emg: isEmergency(a.squawk),
      ghost: false,
    });
    ages.push(a.seenPos * 1000);
  }
  for (const [hex, tr] of next) {
    if (seen.has(hex)) continue;
    // Filtered out: remove now. Missing from the data: keep as a fading ghost.
    if (present?.has(hex)) next.delete(hex);
    else next.set(hex, { ...tr, ghost: true });
  }
  return { tracks: next, ages };
}

/** A replay recording as tracks in the same shape as live ones. */
export function replayTracks(rp: ReplaySource): Map<string, Track> {
  const built = new Map<string, Track>();
  for (const [hex, rt] of rp.tracks) {
    const last = rt.samples[rt.samples.length - 1];
    if (!last) continue;
    const a = {
      hex,
      callsign: rt.meta.callsign,
      registration: rt.meta.registration,
      type: rt.meta.type,
      description: null,
      operator: null,
      lat: last.lat,
      lon: last.lon,
      altFt: last.altFt,
      onGround: last.onGround,
      gs: last.gs,
      track: last.track,
      vRate: last.vRate,
      squawk: rt.meta.squawk,
      category: null,
      kind: rt.meta.kind,
      kindLabel: rt.meta.kindLabel,
      seenPos: 0,
    } as Aircraft;
    built.set(hex, {
      a,
      samples: rt.samples,
      color: altitudeColor(last.altFt, last.onGround),
      emg: false,
      ghost: false,
    });
  }
  return built;
}
