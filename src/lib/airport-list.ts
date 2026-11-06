import { AIRPORTS, type Airport } from "./airports";
import type { AirportRow } from "./airports-large";

/*
 * Which airports the reachable-airports feature searches.
 * Starts with the short built-in list; the larger generated list (OurAirports, about 4,500 large and
 * medium airports) is loaded lazily so it stays out of the main bundle.
 */

let large: readonly Airport[] | null = null;
let pending: Promise<readonly Airport[]> | null = null;

export function rowToAirport([iata, icao, name, city, lat, lon]: AirportRow): Airport {
  return { iata, icao, name, city, lat, lon };
}

/** The larger list once loaded, otherwise the short built-in list. */
export function currentAirportList(): readonly Airport[] {
  return large ?? AIRPORTS;
}

export function isLargeLoaded(): boolean {
  return large !== null;
}

/** Load the larger list once. A failed load can be retried by calling again. */
export function loadLargeAirports(): Promise<readonly Airport[]> {
  if (large) return Promise.resolve(large);
  pending ??= import("./airports-large")
    .then((m) => {
      large = m.LARGE_AIRPORT_ROWS.map(rowToAirport);
      return large;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Test hook: forget the loaded list. */
export function resetAirportList() {
  large = null;
  pending = null;
}
