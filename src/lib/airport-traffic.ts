import type { Aircraft } from "./aircraft";
import { angleDiff } from "./runway-wind";
import { bearingDeg, distanceNm } from "./measure";

/*
 * Traffic near an airport (Phase 4a), counted from the aircraft this browser already has.
 * "Arriving" and "departing" are inferred from altitude, climb or descent and heading; they are not
 * schedule data, and aircraft outside radio coverage are not counted.
 */

export const TRAFFIC_RADIUS_NM = 25;
export const GROUND_RADIUS_NM = 3;
export const LOW_ALT_FT = 8000;
export const VRATE_MIN_FPM = 300;
export const HEADING_TOLERANCE_DEG = 60;

export interface AirportTraffic {
  nearby: number;
  onGround: number;
  arriving: Aircraft[];
  departing: Aircraft[];
}

export interface Point {
  lat: number;
  lon: number;
}

export function airportTraffic(
  aircraft: readonly Aircraft[],
  apt: Point,
  radiusNm: number = TRAFFIC_RADIUS_NM,
): AirportTraffic {
  const out: AirportTraffic = { nearby: 0, onGround: 0, arriving: [], departing: [] };
  for (const a of aircraft) {
    const dist = distanceNm([apt.lon, apt.lat], [a.lon, a.lat]);
    if (dist > radiusNm) continue;
    out.nearby += 1;
    if (a.onGround) {
      if (dist <= GROUND_RADIUS_NM) out.onGround += 1;
      continue;
    }
    if (a.altFt == null || a.altFt > LOW_ALT_FT || a.vRate == null || a.track == null) continue;
    const toAirport = bearingDeg([a.lon, a.lat], [apt.lon, apt.lat]);
    const towards = angleDiff(a.track, toAirport) <= HEADING_TOLERANCE_DEG;
    const away = angleDiff(a.track, toAirport) >= 180 - HEADING_TOLERANCE_DEG;
    if (a.vRate <= -VRATE_MIN_FPM && towards) out.arriving.push(a);
    else if (a.vRate >= VRATE_MIN_FPM && away) out.departing.push(a);
  }
  return out;
}
