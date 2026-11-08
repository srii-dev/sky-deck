import type { Airport } from "./airports";
import { bearingDeg, distanceNm } from "./measure";

/* Airports near a point (Phase 4c). The point comes from the browser's location, only after the user asks. */

export interface NearbyAirport {
  airport: Airport;
  distanceNm: number;
  /** Initial bearing from the point to the airport, degrees true. */
  bearing: number;
}

export function nearbyAirports(
  pos: { lat: number; lon: number },
  list: readonly Airport[],
  limit = 5,
  maxNm = 150,
): NearbyAirport[] {
  const out: NearbyAirport[] = [];
  for (const airport of list) {
    const d = distanceNm([pos.lon, pos.lat], [airport.lon, airport.lat]);
    if (d <= maxNm) {
      out.push({
        airport,
        distanceNm: d,
        bearing: bearingDeg([pos.lon, pos.lat], [airport.lon, airport.lat]),
      });
    }
  }
  out.sort((a, b) => a.distanceNm - b.distanceNm);
  return out.slice(0, limit);
}
