import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type FeedResponse, type FlightRoute, type RouteAirport } from "./aircraft";
import { getJson, loadFeedCached, searchAircraftSources } from "./adsb-sources";
import { prune, type CacheEntry } from "./request-control";

/*
 * Server-side proxy for free community ADS-B sources.
 * Fetch, timeouts, and back-off live in adsb-sources.ts.
 * - Primary: adsb.lol (readsb v2 JSON)
 * - Secondary: airplanes.live (same format; may refuse unapproved callers)
 * - Fallback: OpenSky Network REST (state vectors)
 * Feed responses are cached in-memory for ~5 s per rounded viewport, and identical in-flight
 * requests are shared (both in adsb-sources.ts, loadFeedCached).
 */

const ROUTE_TTL_MS = 60 * 60 * 1000;

const routeCache = new Map<string, CacheEntry<FlightRoute | null>>();

const feedInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusNm: z.number().min(1).max(250),
});

export const getAircraftFeed = createServerFn({ method: "GET" })
  .validator((d: unknown) => feedInput.parse(d))
  .handler(async ({ data }): Promise<FeedResponse> => {
    const lat = Math.round(data.lat * 20) / 20;
    const lon = Math.round(data.lon * 20) / 20;
    const r = Math.max(5, Math.min(250, Math.ceil(data.radiusNm / 5) * 5));
    return loadFeedCached(lat, lon, r);
  });

const searchInput = z.object({ q: z.string().trim().min(2).max(12) });

export const searchAircraft = createServerFn({ method: "GET" })
  .validator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data }) => {
    const q = data.q.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    return searchAircraftSources(q);
  });

const routeInput = z.object({ callsign: z.string().trim().min(3).max(10) });

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

type RawKeys = "lat" | "lon" | "iata" | "icao" | "location" | "name";
type Raw = Partial<Record<RawKeys, unknown>>;

function toAirport(a: Raw): RouteAirport | null {
  const lat = num(a.lat);
  const lon = num(a.lon);
  if (lat == null || lon == null) return null;
  return {
    iata: str(a.iata),
    icao: str(a.icao),
    name: str(a.name) ?? "Unknown airport",
    location: str(a.location),
    lat,
    lon,
  };
}

export const getFlightRoute = createServerFn({ method: "GET" })
  .validator((d: unknown) => routeInput.parse(d))
  .handler(async ({ data }): Promise<FlightRoute | null> => {
    const cs = data.callsign.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cs.length < 3) return null;
    const hit = routeCache.get(cs);
    if (hit && Date.now() - hit.at < ROUTE_TTL_MS) return hit.value;
    let value: FlightRoute | null = null;
    try {
      const json = (await getJson(
        `https://vrs-standing-data.adsb.lol/routes/${cs.slice(0, 2)}/${cs}.json`,
        5000,
      )) as { _airports?: Raw[] };
      const airports = (json._airports ?? []).map(toAirport).filter((a): a is RouteAirport => !!a);
      const origin = airports[0];
      const destination = airports[airports.length - 1];
      if (airports.length >= 2 && origin && destination) value = { origin, destination };
    } catch {
      value = null;
    }
    prune(routeCache, ROUTE_TTL_MS, 2000);
    routeCache.set(cs, { at: Date.now(), value });
    return value;
  });
