import type { RunwayInfo } from "./airport-data";

/*
 * Likely runway in use (Phase 4d), from the METAR wind alone. Aircraft traffic is not used yet.
 * This is a guess for curiosity, not operational information: air traffic control picks the runway.
 */

export interface RunwayEnd {
  /** Runway end label, for example "22R". */
  label: string;
  /** True heading of this end in degrees. */
  heading: number;
}

/** Below this wind speed (knots) no runway is preferred. */
export const CALM_WIND_KT = 3;

/** Smallest angle between two headings, 0 to 180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  return d;
}

/** Both ends of each runway pair. Needs the published true heading of the first end. */
export function runwayEnds(runways: readonly RunwayInfo[]): RunwayEnd[] {
  const ends: RunwayEnd[] = [];
  for (const r of runways) {
    if (r.alignment == null) continue;
    const parts = r.id.split("/");
    const first = parts[0];
    const second = parts[1];
    if (!first) continue;
    ends.push({ label: first, heading: ((r.alignment % 360) + 360) % 360 });
    if (second) ends.push({ label: second, heading: (r.alignment + 180) % 360 });
  }
  return ends;
}

export interface LikelyRunways {
  /** Ends facing the wind, best first. */
  ends: RunwayEnd[];
  /** Headwind component in knots for the best end. */
  headwindKt: number;
  crosswindKt: number;
}

/**
 * Runway ends that face the wind. Returns null when the wind is calm, variable or unknown, or no
 * runway headings are known. Parallel runways (headings within 15 degrees of the best) are kept together.
 */
export function likelyRunways(
  runways: readonly RunwayInfo[],
  windDir: number | null,
  windKt: number | null,
): LikelyRunways | null {
  if (windDir == null || windKt == null || windKt < CALM_WIND_KT) return null;
  const ends = runwayEnds(runways);
  if (ends.length === 0) return null;
  const head = (e: RunwayEnd) => Math.cos(((windDir - e.heading) * Math.PI) / 180) * windKt;
  const sorted = [...ends].sort((a, b) => head(b) - head(a));
  const best = sorted[0];
  if (!best || head(best) <= 0) return null;
  const chosen = sorted.filter((e) => angleDiff(e.heading, best.heading) <= 15 && head(e) > 0);
  const h = head(best);
  const cross = Math.abs(Math.sin(((windDir - best.heading) * Math.PI) / 180) * windKt);
  return { ends: chosen, headwindKt: Math.round(h), crosswindKt: Math.round(cross) };
}
