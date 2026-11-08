import type { Aircraft } from "./aircraft";
import type { RunwayInfo } from "./airport-data";
import { bearingDeg, distanceNm } from "./measure";
import { angleDiff, likelyRunways, runwayEnds, CALM_WIND_KT, type RunwayEnd } from "./runway-wind";

/*
 * Likely runway in use from traffic and wind together (Phase 4d).
 * The wind alone (runway-wind.ts) says which runway ends face the wind. This adds what the aircraft are
 * doing right now: a low, descending aircraft lined up with a runway heading and sitting on the extended
 * centreline behind it is on final for that end; a low, climbing aircraft lined up and ahead of an end is
 * departing from it; a fast aircraft on the ground, aligned with a runway, is on its roll.
 * It uses one snapshot of the aircraft this browser already has (position, track and climb rate), not a
 * stored history. It is a guess for curiosity, not operational information: air traffic control decides.
 */

/** How far from the airport an aircraft still counts as being on final or on its climb-out. */
export const MAX_APPROACH_NM = 12;
/** Closer than this the field-centre reference point is too coarse to tell sides apart. */
export const MIN_APPROACH_NM = 0.5;
/** How far off the extended centreline (nm) still counts; the airport point is the field centre, not the threshold. */
export const MAX_CROSS_NM = 2;
/** Largest gap between the aircraft's track and the runway heading, degrees. */
export const TRACK_TOLERANCE_DEG = 20;
export const ARRIVAL_MAX_AGL_FT = 4000;
export const DEPARTURE_MAX_AGL_FT = 5000;
export const ARRIVAL_VRATE_FPM = -200;
export const DEPARTURE_VRATE_FPM = 300;
/** Ground speed above which an aircraft on the ground is on a runway roll, not taxiing. */
export const ROLL_MIN_KT = 40;
export const ROLL_MAX_NM = 2.5;
/** Runway ends whose headings differ by no more than this are treated as parallel. */
export const PARALLEL_DEG = 5;

export type RunwaySource = "traffic" | "traffic+wind" | "wind";

export interface RunwayEvidence {
  end: RunwayEnd;
  arrivals: number;
  departures: number;
  rolling: number;
}

export interface RunwayGuess {
  /** Likely runway ends, most evidence first. */
  ends: RunwayEnd[];
  source: RunwaySource;
  /** Headwind in knots for the first end; null when the wind is calm, variable or unknown. */
  headwindKt: number | null;
  /** True when the wind favours the first end, false when it does not, null when the wind says nothing. */
  windAgrees: boolean | null;
  /** Evidence per end, only for ends that had some. Empty for a wind-only guess. */
  evidence: RunwayEvidence[];
  arrivals: number;
  departures: number;
  rolling: number;
}

interface Match {
  end: RunwayEnd;
  kind: "arrival" | "departure" | "roll";
  trackDiff: number;
}

function matchEnd(
  a: Aircraft,
  apt: { lat: number; lon: number },
  elevFt: number,
  ends: readonly RunwayEnd[],
): Match | null {
  if (a.track == null) return null;
  const dist = distanceNm([apt.lon, apt.lat], [a.lon, a.lat]);
  const bearing = bearingDeg([apt.lon, apt.lat], [a.lon, a.lat]);
  let best: Match | null = null;
  const consider = (m: Match) => {
    if (!best || m.trackDiff < best.trackDiff) best = m;
  };
  for (const end of ends) {
    const trackDiff = angleDiff(a.track, end.heading);
    if (a.onGround) {
      if (a.gs != null && a.gs >= ROLL_MIN_KT && dist <= ROLL_MAX_NM && trackDiff <= 15) {
        consider({ end, kind: "roll", trackDiff });
      }
      continue;
    }
    if (trackDiff > TRACK_TOLERANCE_DEG) continue;
    if (a.altFt == null || a.vRate == null || dist < MIN_APPROACH_NM || dist > MAX_APPROACH_NM) {
      continue;
    }
    const agl = a.altFt - elevFt;
    if (agl < -200) continue;
    // Arrival: behind the end, so the bearing from the airport points opposite to the landing heading.
    const behind = angleDiff(bearing, (end.heading + 180) % 360);
    if (
      a.vRate <= ARRIVAL_VRATE_FPM &&
      agl <= ARRIVAL_MAX_AGL_FT &&
      behind < 90 &&
      dist * Math.sin((behind * Math.PI) / 180) <= MAX_CROSS_NM
    ) {
      consider({ end, kind: "arrival", trackDiff });
      continue;
    }
    // Departure: ahead of the end, along the departure heading.
    const ahead = angleDiff(bearing, end.heading);
    if (
      a.vRate >= DEPARTURE_VRATE_FPM &&
      agl <= DEPARTURE_MAX_AGL_FT &&
      ahead < 90 &&
      dist * Math.sin((ahead * Math.PI) / 180) <= MAX_CROSS_NM
    ) {
      consider({ end, kind: "departure", trackDiff });
    }
  }
  return best;
}

function headwind(end: RunwayEnd, windDir: number, windKt: number): number {
  return Math.cos(((windDir - end.heading) * Math.PI) / 180) * windKt;
}

/**
 * Combines the wind guess with what nearby aircraft are doing. Returns null when neither says anything.
 * Rules:
 * - Each aircraft counts for at most one runway end (the one it is best aligned with).
 * - Traffic wins when its best end has two or more aircraft, or one aircraft that the wind also favours.
 *   A lone aircraft against the wind is ignored (it may be a visual approach or something unusual).
 * - Otherwise the wind-only result is returned unchanged.
 */
export function likelyRunwaysWithTraffic(
  runways: readonly RunwayInfo[],
  windDir: number | null,
  windKt: number | null,
  aircraft: readonly Aircraft[],
  apt: { lat: number; lon: number },
  elevFt: number | null,
): RunwayGuess | null {
  const wind = likelyRunways(runways, windDir, windKt);
  const windFallback = (): RunwayGuess | null =>
    wind
      ? {
          ends: wind.ends,
          source: "wind",
          headwindKt: wind.headwindKt,
          windAgrees: true,
          evidence: [],
          arrivals: 0,
          departures: 0,
          rolling: 0,
        }
      : null;

  const ends = runwayEnds(runways);
  if (ends.length === 0) return windFallback();

  const byLabel = new Map<string, RunwayEvidence>();
  for (const a of aircraft) {
    const m = matchEnd(a, apt, elevFt ?? 0, ends);
    if (!m) continue;
    const ev = byLabel.get(m.end.label) ?? {
      end: m.end,
      arrivals: 0,
      departures: 0,
      rolling: 0,
    };
    if (m.kind === "arrival") ev.arrivals += 1;
    else if (m.kind === "departure") ev.departures += 1;
    else ev.rolling += 1;
    byLabel.set(m.end.label, ev);
  }
  const evidence = [...byLabel.values()];
  const count = (e: RunwayEvidence) => e.arrivals + e.departures + e.rolling;
  evidence.sort((x, y) => count(y) - count(x));
  const top = evidence[0];
  if (!top) return windFallback();

  const windUsable = windDir != null && windKt != null && windKt >= CALM_WIND_KT;
  const windFavoursTop = !!wind && wind.ends.some((e) => e.label === top.end.label);
  if (count(top) < 2 && !windFavoursTop) return windFallback();

  const keep = evidence.filter((e) => count(e) >= Math.max(1, Math.ceil(count(top) * 0.4)));
  const hw = windUsable ? headwind(top.end, windDir, windKt) : null;
  // Parallel runways share a heading and cannot be told apart from one position: keep them together.
  const labels = new Set<string>();
  const outEnds: RunwayEnd[] = [];
  for (const e of keep) {
    for (const cand of ends) {
      if (angleDiff(cand.heading, e.end.heading) <= PARALLEL_DEG && !labels.has(cand.label)) {
        labels.add(cand.label);
        outEnds.push(cand);
      }
    }
  }
  return {
    ends: outEnds,
    source: windFavoursTop ? "traffic+wind" : "traffic",
    headwindKt: hw == null ? null : Math.round(hw),
    windAgrees: hw == null ? null : hw > 0,
    evidence: keep,
    arrivals: keep.reduce((s, e) => s + e.arrivals, 0),
    departures: keep.reduce((s, e) => s + e.departures, 0),
    rolling: keep.reduce((s, e) => s + e.rolling, 0),
  };
}

/** Plain sentence for the panel. Always says it is a guess and that air traffic control decides. */
export function runwayGuessText(g: RunwayGuess): string {
  const labels = g.ends.map((e) => e.label).join(", ");
  const parts: string[] = [];
  if (g.arrivals) parts.push(g.arrivals + " arriving");
  if (g.departures) parts.push(g.departures + " departing");
  if (g.rolling) parts.push(g.rolling + " on the runway");
  const seen = parts.join(", ");
  if (g.source === "wind") {
    return (
      "Likely in use: " +
      labels +
      " (facing the wind, " +
      g.headwindKt +
      " kt headwind). A guess from wind only; air traffic control decides."
    );
  }
  const wind =
    g.source === "traffic+wind"
      ? "the wind agrees"
      : g.windAgrees === false
        ? "the wind does not favour it"
        : "the wind is calm or unknown";
  return (
    "Likely in use: " +
    labels +
    " (" +
    seen +
    " lined up with it; " +
    wind +
    "). A guess from nearby aircraft; air traffic control decides."
  );
}
