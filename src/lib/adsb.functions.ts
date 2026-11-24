import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DATA_BUSY_MESSAGE,
  type FeedResponse,
  type FlightRoute,
  type RouteAirport,
} from "./aircraft";
import { getJson, searchAircraftSources, snapFeedCircle, type SearchResult } from "./adsb-sources";
import { createKeyedLimiter, visitorKey } from "./rate-limit";
import { prune, type CacheEntry } from "./request-control";
import { createSearchCache } from "./search-cache";
import { loadFeedShared } from "./feed-hub.server";

/*
 * Server-side proxy for free community ADS-B sources.
 * Fetch, timeouts, and back-off live in adsb-sources.ts.
 * - Primary: adsb.lol (readsb v2 JSON)
 * - Secondary: airplanes.live (same format; may refuse unapproved callers)
 * (OpenSky Network is intentionally not used: its terms require a written license for live API use.)
 * Feed responses are cached in-memory for ~5 s per rounded viewport, and identical in-flight
 * requests are shared (both in adsb-sources.ts, loadFeedCached). On Cloudflare that loader runs inside one
 * FeedHub Durable Object (src/server/feed-hub.ts), so the cache and pacing are shared by every instance.
 */

const ROUTE_TTL_MS = 60 * 60 * 1000;
const ROUTE_RETRY_MS = 60 * 1000;

const routeCache = new Map<string, CacheEntry<FlightRoute | null>>();

const feedInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusNm: z.number().min(1).max(250),
});

// Per-visitor limits so one client cannot spend the shared adsb.lol key quota. The counters are per Worker
// instance (shortcut: move them into a Durable Object when abuse appears). Normal use is one poll every ~7 s
// with up to 6 tiles, each tile its own call (about 50 a minute); the rest is headroom for panning and zooming,
// which refresh at once, and a second tab.
const feedLimiter = createKeyedLimiter({ max: 240, windowMs: 60_000 });
// Following a selected aircraft outside the feed searches its hex every poll (cached 5 s), so this is not 12.
const searchLimiter = createKeyedLimiter({ max: 30, windowMs: 60_000 });
const searchCache = createSearchCache<SearchResult>();

export const getAircraftFeed = createServerFn({ method: "GET" })
  .validator((d: unknown) => feedInput.parse(d))
  .handler(async ({ data }): Promise<FeedResponse> => {
    if (!feedLimiter.allow(visitorKey(getRequestHeader), Date.now()).ok) {
      setResponseHeader("Cache-Control", "no-store");
      return {
        aircraft: [],
        source: "none",
        fetchedAt: Date.now(),
        busy: true,
        error: DATA_BUSY_MESSAGE,
      };
    }
    const { lat, lon, radiusNm } = snapFeedCircle(data.lat, data.lon, data.radiusNm);
    // Through the shared FeedHub Durable Object when deployed, so all visitors share one cache and budget.
    return loadFeedShared(lat, lon, radiusNm);
  });

const searchInput = z.object({ q: z.string().trim().min(2).max(12) });

export const searchAircraft = createServerFn({ method: "GET" })
  .validator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data }) => {
    const q = data.q.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const now = Date.now();
    const hit = searchCache.get(q, now);
    if (hit) return hit;
    if (!searchLimiter.allow(visitorKey(getRequestHeader), now).ok) {
      setResponseHeader("Cache-Control", "no-store");
      return { aircraft: [], error: "Too many searches. Wait a moment.", busy: true };
    }
    const result = await searchAircraftSources(q);
    searchCache.set(q, result, Date.now());
    return result;
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
    // A route rarely changes within a day: let browsers and any shared cache keep the answer.
    setResponseHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
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
    } catch (e) {
      // A 404 means the route is unknown, which is worth remembering. Any other failure (timeout, 5xx) is
      // remembered for one minute only and not cached by browsers, so the route comes back once the source recovers.
      if ((e as { status?: number }).status !== 404) {
        setResponseHeader("Cache-Control", "no-store");
        prune(routeCache, ROUTE_TTL_MS, 2000);
        routeCache.set(cs, { at: Date.now() - ROUTE_TTL_MS + ROUTE_RETRY_MS, value: null });
        return null;
      }
    }
    prune(routeCache, ROUTE_TTL_MS, 2000);
    routeCache.set(cs, { at: Date.now(), value });
    return value;
  });
