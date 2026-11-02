import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { FeedResponse, FlightRoute, RouteAirport } from "./aircraft";
import { getJson, loadFeedCircle, searchAircraftSources } from "./adsb-sources";

/*
 * Server-side proxy for free community ADS-B sources.
 * Fetch, timeouts, and back-off live in adsb-sources.ts.
 * - Primary: adsb.lol (readsb v2 JSON)
 * - Secondary: airplanes.live (same format; may refuse unapproved callers)
 * - Fallback: OpenSky Network REST (state vectors)
 * Responses are cached in-memory for ~5 s per rounded viewport.
 */

const FEED_TTL_MS = 5000;
const ROUTE_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = { at: number; value: T };
const feedCache = new Map<string, CacheEntry<FeedResponse>>();
const routeCache = new Map<string, CacheEntry<FlightRoute | null>>();

function prune<T>(cache: Map<string, CacheEntry<T>>, ttl: number, max: number) {
  if (cache.size < max) return;
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > ttl) cache.delete(k);
  while (cache.size > max) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

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
    const key = `${lat},${lon},${r}`;
    const hit = feedCache.get(key);
    if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.value;

    const value = await loadFeedCircle(lat, lon, r);
    if (!value.error) {
      prune(feedCache, FEED_TTL_MS, 200);
      feedCache.set(key, { at: Date.now(), value });
      return value;
    }
    if (hit) return { ...hit.value, busy: true, error: "Data provider busy" };
    return value;
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
