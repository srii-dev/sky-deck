/*
 * Facts about one flight in the air or on the ground (Phase 14a): which phase it is in, how long the route is, how far
 * along it is, how far and how long to the destination, and whether the nose points at the destination. All of it
 * comes from the aircraft's broadcast position and the route on file, so it is an estimate: straight lines, current
 * ground speed, no winds, no air traffic control. Pure functions.
 */
import { inferStage, type StageInput, type StageResult, type StageRoute } from "./flight-stage";
import { routeProgress, type LatLon } from "./route-geometry";

export interface FlightFactsInput extends StageInput {
  /** Track over the ground, degrees true. */
  track: number | null;
}

export interface RouteFacts {
  /** Straight line (great circle) length of the whole route, nm. */
  totalNm: number;
  /** Straight line distance already covered, nm. */
  flownNm: number;
  /** Straight line distance to the destination, nm. */
  remainingNm: number;
  /** 0 to 1. */
  fraction: number;
}

export interface FlightFacts {
  stage: StageResult;
  /** Null when there is no route on file, or it does not fit where the aircraft is. */
  route: RouteFacts | null;
  /** Compass bearing from the aircraft to the destination, degrees true. */
  bearingToDestDeg: number | null;
  /** Track minus bearing to the destination, -180 to 180; small means heading straight for it. */
  offDirectDeg: number | null;
  /** When it should arrive at the current speed, ms since 1970; null when it cannot be told. */
  arrivalAt: number | null;
}

/** Initial great-circle bearing from a to b, degrees true (0 to 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const p1 = a.lat * r;
  const p2 = b.lat * r;
  const dl = (b.lon - a.lon) * r;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Signed difference a - b in degrees, wrapped to -180..180. */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function flightFacts(
  a: FlightFactsInput,
  routeOnFile: StageRoute | null,
  now: number,
  prev: Parameters<typeof inferStage>[2] = null,
): FlightFacts {
  const stage = inferStage(a, routeOnFile, prev);
  const usable = routeOnFile && !stage.routeMismatch ? routeOnFile : null;
  if (!usable) {
    return { stage, route: null, bearingToDestDeg: null, offDirectDeg: null, arrivalAt: null };
  }
  const here = { lat: a.lat, lon: a.lon };
  const p = routeProgress(usable.origin, usable.destination, here, 120);
  const remainingNm = stage.remainingNm ?? p.remainingNm;
  const bearing = bearingDeg(here, usable.destination);
  const airborneEnRoute = !a.onGround && remainingNm > 1;
  return {
    stage,
    route: {
      totalNm: p.totalNm,
      // From the exact distance to go, so the three numbers always agree (the line is only sampled).
      flownNm: Math.max(0, p.totalNm - remainingNm),
      remainingNm,
      fraction: p.totalNm > 0 ? Math.min(1, Math.max(0, 1 - remainingNm / p.totalNm)) : 0,
    },
    bearingToDestDeg: airborneEnRoute ? bearing : null,
    offDirectDeg: airborneEnRoute && a.track != null ? angleDiff(a.track, bearing) : null,
    arrivalAt: stage.etaMin != null ? now + stage.etaMin * 60_000 : null,
  };
}
