import type { FeatureCollection, Point } from "geojson";
import { AIRPORTS, type Airport } from "./airports";
import { fmtRange, haversineNm } from "./glide-ring";
import { compassPoint, type UnitSystem } from "./units";

const NOTE_SHORT =
  "From a short list of major airports. Small fields are not included, so “none” does not mean none reachable.";
const NOTE_LARGE =
  "Large and medium airports only (OurAirports data). Small airfields are not included, so “none” does not mean none reachable.";

/** Caveat shown under the reachable-airports list and matching the list actually in use. */
export function reachableListNote(largeListLoaded: boolean): string {
  return largeListLoaded ? NOTE_LARGE : NOTE_SHORT;
}

/** How many airports the panel list and the map markers show. */
export const REACHABLE_LIMIT = 5;

export interface ReachableAirport {
  airport: Airport;
  /** Great-circle distance from the aircraft, nautical miles. */
  distNm: number;
  /** Initial compass bearing from the aircraft to the airport, 0-360 degrees. */
  bearingDeg: number;
}

/** Initial great-circle bearing from point 1 to point 2, in degrees 0-360. */
export function initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const p1 = lat1 * toR;
  const p2 = lat2 * toR;
  const dLon = (lon2 - lon1) * toR;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}

/**
 * Airports inside a circle of `rangeNm` around the aircraft, nearest first.
 * Straight-line distance only: ignores terrain, wind, runway suitability and airport type.
 * Returns [] for a missing or non-positive range.
 */
export function reachableAirports(
  lat: number,
  lon: number,
  rangeNm: number | null,
  limit = REACHABLE_LIMIT,
  airports: readonly Airport[] = AIRPORTS,
): ReachableAirport[] {
  if (rangeNm == null || !(rangeNm > 0)) return [];
  const out: ReachableAirport[] = [];
  for (const airport of airports) {
    const distNm = haversineNm(lat, lon, airport.lat, airport.lon);
    if (distNm <= rangeNm) {
      out.push({
        airport,
        distNm,
        bearingDeg: initialBearingDeg(lat, lon, airport.lat, airport.lon),
      });
    }
  }
  out.sort((a, b) => a.distNm - b.distNm);
  return out.slice(0, Math.max(0, limit));
}

/** Point features (one per airport) for the map. Coordinates are [lon, lat] as GeoJSON requires. */
export function reachableAirportsGeoJSON(
  list: readonly ReachableAirport[],
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: list.map((r) => ({
      type: "Feature",
      properties: { iata: r.airport.iata, icao: r.airport.icao, distNm: r.distNm },
      geometry: { type: "Point", coordinates: [r.airport.lon, r.airport.lat] },
    })),
  };
}

/**
 * One-line header summary of the nearest airport in the list (it is sorted nearest first),
 * for example "Nearest in range: JFK · 12.3 nm NE". Null when the list is empty.
 */
export function formatNearestReachable(
  list: readonly ReachableAirport[],
  units: UnitSystem,
): string | null {
  const first = list[0];
  if (!first) return null;
  const dir = compassPoint(first.bearingDeg);
  return `Nearest in range: ${first.airport.iata} · ${fmtRange(first.distNm, units)}${dir ? ` ${dir}` : ""}`;
}
