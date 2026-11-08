import {
  parseAirportInfo,
  parseAtis,
  parseMetar,
  parseNasStatus,
  parseTaf,
  type AirportInfo,
  type AtisReport,
  type Metar,
  type NasEvent,
  type Taf,
} from "./airport-data";
import { prune, type CacheEntry } from "./request-control";

/*
 * Server-side loader for airport pages (Phase 4). Weather comes from aviationweather.gov and delays from
 * the FAA NAS status feed. Each part can fail on its own: a failed part is reported as `null` plus a name
 * in `failed`, so the page can say what is missing instead of showing nothing.
 * Answers are cached in memory per server instance (weather 2 minutes, FAA status 1 minute, airport info
 * 12 hours). Tests inject fetch and the clock.
 */

export const AWC_BASE = "https://aviationweather.gov/api/data";
export const NAS_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const UA = "SkyDeck/1.0 (hobby flight tracker; educational use)";
const TIMEOUT_MS = 6000;

/**
 * Digital ATIS (Phase 4g). datis.clowd.io redirects here (checked 2026-11-08), so we call the target
 * directly. It answers 404 {"error":"No results found"} for airports without a D-ATIS.
 */
export const ATIS_BASE = "https://atis.info/api";

export const INFO_TTL_MS = 12 * 60 * 60 * 1000;
export const WEATHER_TTL_MS = 2 * 60 * 1000;
export const NAS_TTL_MS = 60 * 1000;
/** ATIS broadcasts change about every half hour to hour. */
export const ATIS_TTL_MS = 2 * 60 * 1000;
/** "No D-ATIS here" rarely changes, so ask less often. */
export const ATIS_NONE_TTL_MS = 15 * 60 * 1000;

export interface AirportBrief {
  icao: string;
  info: AirportInfo | null;
  metar: Metar | null;
  taf: Taf | null;
  /** FAA events for this airport; null when the FAA feed (or the airport's IATA code) was not available. */
  nas: NasEvent[] | null;
  /** Which parts could not be loaded. A part that loaded but has no data (small airport, no METAR) is not listed. */
  failed: ("info" | "weather" | "nas")[];
  fetchedAt: number;
}

export interface AirportDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const infoCache = new Map<string, CacheEntry<AirportInfo | null>>();
const weatherCache = new Map<string, CacheEntry<{ metar: Metar | null; taf: Taf | null }>>();
let nasCache: CacheEntry<string> | null = null;
const atisCache = new Map<string, CacheEntry<AtisReport[]>>();

export function resetAirportSourceState() {
  infoCache.clear();
  weatherCache.clear();
  nasCache = null;
  atisCache.clear();
}

async function getTextOnce(url: string, deps: AirportDeps): Promise<string> {
  const f = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * One retry after a timeout or a server error. aviationweather.gov was measured on 2026-11-08 answering
 * in 30 to 300 ms most of the time but sometimes taking several seconds (once about 20 s), so a single
 * short attempt failed too often.
 */
async function getText(url: string, deps: AirportDeps): Promise<string> {
  try {
    return await getTextOnce(url, deps);
  } catch (err) {
    const status = (err as { status?: number }).status;
    const retryable = status === undefined || status >= 500;
    if (!retryable) throw err;
    return getTextOnce(url, deps);
  }
}

/** The provider answers with an empty body when it has nothing for the airport. */
async function getJsonOrEmpty(url: string, deps: AirportDeps): Promise<unknown> {
  const text = await getText(url, deps);
  if (!text.trim()) return [];
  return JSON.parse(text) as unknown;
}

function logFailure(part: string, err: unknown) {
  console.warn(
    "[airport] " +
      part +
      " failed: " +
      (err instanceof Error ? err.name + ": " + err.message : String(err)),
  );
}

export function isValidIcao(code: string): boolean {
  return /^[A-Z0-9]{3,4}$/.test(code);
}

export async function loadAirportBrief(
  icaoIn: string,
  iataIn: string | null,
  deps: AirportDeps = {},
): Promise<AirportBrief> {
  const now = deps.now ?? Date.now;
  const icao = icaoIn.trim().toUpperCase();
  const iata = iataIn ? iataIn.trim().toUpperCase() : null;
  const failed: AirportBrief["failed"] = [];
  const t0 = now();

  const infoP = (async (): Promise<AirportInfo | null> => {
    const hit = infoCache.get(icao);
    if (hit && t0 - hit.at < INFO_TTL_MS) return hit.value;
    try {
      const value = parseAirportInfo(
        await getJsonOrEmpty(AWC_BASE + "/airport?format=json&ids=" + icao, deps),
      );
      prune(infoCache, INFO_TTL_MS, 1000, t0);
      infoCache.set(icao, { at: t0, value });
      return value;
    } catch (err) {
      logFailure("info", err);
      failed.push("info");
      return null;
    }
  })();

  const weatherP = (async (): Promise<{ metar: Metar | null; taf: Taf | null }> => {
    const hit = weatherCache.get(icao);
    if (hit && t0 - hit.at < WEATHER_TTL_MS) return hit.value;
    try {
      const [m, t] = await Promise.all([
        getJsonOrEmpty(AWC_BASE + "/metar?format=json&ids=" + icao, deps),
        getJsonOrEmpty(AWC_BASE + "/taf?format=json&ids=" + icao, deps),
      ]);
      const value = { metar: parseMetar(m), taf: parseTaf(t) };
      prune(weatherCache, WEATHER_TTL_MS, 1000, t0);
      weatherCache.set(icao, { at: t0, value });
      return value;
    } catch (err) {
      logFailure("weather", err);
      failed.push("weather");
      return { metar: null, taf: null };
    }
  })();

  const nasP = (async (): Promise<NasEvent[] | null> => {
    if (!iata) return null;
    try {
      if (!nasCache || t0 - nasCache.at >= NAS_TTL_MS) {
        nasCache = { at: t0, value: await getText(NAS_URL, deps) };
      }
      return parseNasStatus(nasCache.value, iata);
    } catch (err) {
      logFailure("nas", err);
      failed.push("nas");
      return null;
    }
  })();

  const [info, weather, nas] = await Promise.all([infoP, weatherP, nasP]);
  return { icao, info, metar: weather.metar, taf: weather.taf, nas, failed, fetchedAt: now() };
}

export interface AirportAtis {
  icao: string;
  /** Current reports; [] when this airport has no D-ATIS; null when the service could not be reached. */
  atis: AtisReport[] | null;
  fetchedAt: number;
}

/**
 * D-ATIS for one airport. Kept apart from loadAirportBrief so a slow or failing third-party service
 * never delays the weather and FAA status. One attempt, no retry: the panel asks again on its own.
 */
export async function loadAirportAtis(
  icaoIn: string,
  deps: AirportDeps = {},
): Promise<AirportAtis> {
  const now = deps.now ?? Date.now;
  const icao = icaoIn.trim().toUpperCase();
  const t0 = now();
  const hit = atisCache.get(icao);
  if (hit) {
    const ttl = hit.value.length ? ATIS_TTL_MS : ATIS_NONE_TTL_MS;
    if (t0 - hit.at < ttl) return { icao, atis: hit.value, fetchedAt: t0 };
  }
  try {
    let atis: AtisReport[] = [];
    try {
      atis = parseAtis(JSON.parse(await getTextOnce(ATIS_BASE + "/" + icao, deps)) as unknown);
    } catch (err) {
      // 404 is the service's way of saying "no D-ATIS at this airport", not a failure.
      if ((err as { status?: number }).status !== 404) throw err;
    }
    prune(atisCache, ATIS_NONE_TTL_MS, 1000, t0);
    atisCache.set(icao, { at: t0, value: atis });
    return { icao, atis, fetchedAt: now() };
  } catch (err) {
    logFailure("atis", err);
    return { icao, atis: null, fetchedAt: now() };
  }
}
