import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Aircraft, FeedResponse, FlightRoute, RouteAirport } from "./aircraft";

/*
 * Server-side proxy for free community ADS-B sources.
 * - Primary: adsb.lol (readsb v2 JSON)
 * - Secondary: airplanes.live (same format; may refuse unapproved callers)
 * - Fallback: OpenSky Network REST (state vectors)
 * Responses are cached in-memory for ~5 s per rounded viewport.
 */

const UA = "SkyDeck/0.1 (community flight tracker)";
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

async function getJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

// readsb / tar1090 aircraft JSON → Aircraft
function fromReadsb(ac: Record<string, unknown>): Aircraft | null {
  const lat = num(ac.lat);
  const lon = num(ac.lon);
  if (lat == null || lon == null) return null;
  const onGround = ac.alt_baro === "ground";
  const altFt = onGround ? 0 : (num(ac.alt_baro) ?? num(ac.alt_geom));
  return {
    hex: String(ac.hex ?? "").replace("~", "").toLowerCase(),
    callsign: str(ac.flight),
    registration: str(ac.r),
    type: str(ac.t),
    description: str(ac.desc),
    operator: str(ac.ownOp),
    lat,
    lon,
    altFt,
    onGround,
    gs: num(ac.gs),
    track: num(ac.track) ?? num(ac.true_heading) ?? num(ac.mag_heading),
    vRate: num(ac.baro_rate) ?? num(ac.geom_rate),
    squawk: str(ac.squawk),
    category: str(ac.category),
    seenPos: num(ac.seen_pos) ?? num(ac.seen) ?? 0,
  };
}

function parseReadsb(json: unknown): Aircraft[] {
  const list = (json as { ac?: unknown[]; aircraft?: unknown[] })?.ac ??
    (json as { aircraft?: unknown[] })?.aircraft ??
    [];
  const out: Aircraft[] = [];
  for (const raw of list) {
    const a = fromReadsb(raw as Record<string, unknown>);
    if (a && a.hex) out.push(a);
  }
  return out;
}

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.943844;

function parseOpenSky(json: unknown): Aircraft[] {
  const states = (json as { states?: unknown[][] })?.states ?? [];
  const out: Aircraft[] = [];
  for (const s of states) {
    const lon = num(s[5]);
    const lat = num(s[6]);
    if (lat == null || lon == null) continue;
    const baroM = num(s[7]) ?? num(s[13]);
    const vel = num(s[9]);
    const vr = num(s[11]);
    const lastContact = num(s[4]);
    out.push({
      hex: String(s[0] ?? "").toLowerCase(),
      callsign: str(s[1]),
      registration: null,
      type: null,
      description: null,
      operator: null,
      lat,
      lon,
      altFt: s[8] ? 0 : baroM != null ? baroM * M_TO_FT : null,
      onGround: !!s[8],
      gs: vel != null ? vel * MS_TO_KT : null,
      track: num(s[10]),
      vRate: vr != null ? vr * M_TO_FT * 60 : null,
      squawk: str(s[14]),
      category: null,
      seenPos: lastContact != null ? Math.max(0, Date.now() / 1000 - lastContact) : 0,
    });
  }
  return out;
}

const NM_PER_DEG_LAT = 60;

const feedInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusNm: z.number().min(1).max(250),
});

export const getAircraftFeed = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => feedInput.parse(d))
  .handler(async ({ data }): Promise<FeedResponse> => {
    const lat = Math.round(data.lat * 20) / 20;
    const lon = Math.round(data.lon * 20) / 20;
    const r = Math.max(5, Math.min(250, Math.ceil(data.radiusNm / 5) * 5));
    const key = `${lat},${lon},${r}`;
    const hit = feedCache.get(key);
    if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.value;

    const sources: [string, () => Promise<Aircraft[]>][] = [
      ["adsb.lol", async () => parseReadsb(await getJson(`https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`))],
      [
        "airplanes.live",
        async () => parseReadsb(await getJson(`https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`)),
      ],
      [
        "OpenSky Network",
        async () => {
          const dLat = r / NM_PER_DEG_LAT;
          const dLon = r / (NM_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
          const q = new URLSearchParams({
            lamin: String(Math.max(-90, lat - dLat)),
            lamax: String(Math.min(90, lat + dLat)),
            lomin: String(Math.max(-180, lon - dLon)),
            lomax: String(Math.min(180, lon + dLon)),
          });
          return parseOpenSky(await getJson(`https://opensky-network.org/api/states/all?${q}`, 8000));
        },
      ],
    ];

    for (const [name, run] of sources) {
      try {
        const aircraft = await run();
        const value: FeedResponse = { aircraft, source: name, fetchedAt: Date.now() };
        prune(feedCache, FEED_TTL_MS, 200);
        feedCache.set(key, { at: Date.now(), value });
        return value;
      } catch (err) {
        console.warn(`[adsb] ${name} failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (hit) return { ...hit.value, error: "Live sources unavailable — showing last data" };
    return { aircraft: [], source: "none", fetchedAt: Date.now(), error: "Live sources unavailable" };
  });

const searchInput = z.object({ q: z.string().trim().min(2).max(12) });

export const searchAircraft = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data }): Promise<{ aircraft: Aircraft[]; error?: string }> => {
    const q = data.q.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const attempts: string[] = [];
    if (/^[0-9A-F]{6}$/.test(q)) attempts.push(`hex/${q.toLowerCase()}`);
    attempts.push(`callsign/${q}`);
    attempts.push(`reg/${q}`);
    try {
      for (const path of attempts) {
        const list = parseReadsb(await getJson(`https://api.adsb.lol/v2/${path}`));
        if (list.length) return { aircraft: list.slice(0, 10) };
      }
      return { aircraft: [] };
    } catch (err) {
      console.warn("[adsb] search failed:", err instanceof Error ? err.message : err);
      return { aircraft: [], error: "Search unavailable right now" };
    }
  });

const routeInput = z.object({ callsign: z.string().trim().min(3).max(10) });

function toAirport(a: Record<string, unknown>): RouteAirport | null {
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
  .inputValidator((d: unknown) => routeInput.parse(d))
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
      )) as { _airports?: Record<string, unknown>[] };
      const airports = (json._airports ?? []).map(toAirport).filter((a): a is RouteAirport => !!a);
      if (airports.length >= 2) {
        value = { origin: airports[0], destination: airports[airports.length - 1] };
      }
    } catch {
      value = null;
    }
    prune(routeCache, ROUTE_TTL_MS, 2000);
    routeCache.set(cs, { at: Date.now(), value });
    return value;
  });
