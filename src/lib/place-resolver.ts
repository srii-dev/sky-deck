import type { Airport } from "./airports";
import type { PlaceMatch } from "./alert-rule-parser";

/*
 * Turns words into a place for alert areas (Phase 10e): an airport code ("JFK", "KJFK") or a city or airport name
 * ("new york", "heathrow"), looked up in the airport list the app already has. There is no general place search:
 * an unknown place is reported, not guessed.
 */

export function resolvePlace(text: string, airports: readonly Airport[]): PlaceMatch | null {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return null;
  const upper = q.toUpperCase();
  if ((q.length === 3 || q.length === 4) && !q.includes(" ")) {
    const byCode = airports.find((a) => a.iata === upper || a.icao === upper);
    if (byCode) return { lat: byCode.lat, lon: byCode.lon, label: byCode.iata || byCode.icao };
  }
  // The city name exactly, then a name that contains the words.
  const byCity = airports.find((a) => a.city.toLowerCase() === q);
  if (byCity) return { lat: byCity.lat, lon: byCity.lon, label: byCity.city };
  if (q.length >= 4) {
    const byName = airports.find((a) => a.name.toLowerCase().includes(q));
    if (byName) return { lat: byName.lat, lon: byName.lon, label: byName.iata || byName.icao };
  }
  return null;
}
