/*
 * Link to US airport charts (Phase 4h). Only an outbound link to the FAA's own d-TPP search page: nothing is
 * fetched, scraped or copied. The URL pattern was checked on 2026-11-08: the results page is a plain GET
 * with `cycle` (the 28 day chart cycle, for example 2611) and `ident` (3 or 4 letter airport code). Without
 * a cycle the page redirects to the search form; an older cycle still lists results.
 */

const DTPP_RESULTS =
  "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/";

/** ICAO prefixes of the US states and territories the d-TPP covers. */
const US_PREFIXES = ["K", "PA", "PH", "PG", "TJ", "TI"];

export function isUsAirport(icao: string): boolean {
  const code = icao.trim().toUpperCase();
  return code.length === 4 && US_PREFIXES.some((p) => code.startsWith(p));
}

/** Cycle 2601 took effect at 0901Z on 2026-01-22; every cycle lasts 28 days. */
const EPOCH_MS = Date.UTC(2026, 0, 22, 9, 1);
const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * The FAA chart cycle in effect at `now`, as "YYNN" (year, then the number of the cycle that began that
 * year). Computed rather than fetched; a wrong guess still lands on a results page because the FAA lists
 * neighbouring cycles too.
 */
export function chartCycle(now: number): string {
  const n = Math.floor((now - EPOCH_MS) / CYCLE_MS);
  const start = EPOCH_MS + n * CYCLE_MS;
  const year = new Date(start).getUTCFullYear();
  const ordinal = Math.floor((start - Date.UTC(year, 0, 1)) / CYCLE_MS) + 1;
  return String(year % 100).padStart(2, "0") + String(ordinal).padStart(2, "0");
}

/** FAA chart search results for a US airport, or null for any other airport. */
export function faaChartsUrl(icao: string, now: number = Date.now()): string | null {
  if (!isUsAirport(icao)) return null;
  return DTPP_RESULTS + "?cycle=" + chartCycle(now) + "&ident=" + icao.trim().toUpperCase();
}
