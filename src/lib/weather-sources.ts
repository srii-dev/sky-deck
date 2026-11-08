import {
  parseGairmets,
  parsePireps,
  parseSigmets,
  type Advisory,
  type Pirep,
} from "./weather-advisories";
import { prune, type CacheEntry } from "./request-control";

/*
 * Server-side loader for the advisory and PIREP map layers (Phase 7e). aviationweather.gov answers without a
 * CORS header, so the browser goes through the server functions in weather.functions.ts. Answers are cached per
 * server instance (advisories 5 minutes, PIREPs 2 minutes per rounded box). Each advisory feed can fail on its
 * own. Tests inject fetch and the clock.
 */

export const AWC_BASE = "https://aviationweather.gov/api/data";
const UA = "SkyDeck/1.0 (hobby flight tracker; educational use)";
const TIMEOUT_MS = 6000;

export const ADVISORY_TTL_MS = 5 * 60 * 1000;
export const PIREP_TTL_MS = 2 * 60 * 1000;
/** PIREP reports from the last this many hours are requested. */
export const PIREP_AGE_HOURS = 2;
/** Largest box the PIREP request may cover, in degrees. Bigger views are clamped around their centre. */
export const PIREP_MAX_SPAN_DEG = 30;

export interface WeatherDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface AdvisoryResult {
  advisories: Advisory[];
  failed: ("sigmet" | "isigmet" | "gairmet")[];
  fetchedAt: number;
}

export interface PirepBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface PirepResult {
  pireps: Pirep[];
  box: PirepBox;
  fetchedAt: number;
}

let advisoryCache: CacheEntry<AdvisoryResult> | null = null;
const pirepCache = new Map<string, CacheEntry<PirepResult>>();

export function resetWeatherSourceState() {
  advisoryCache = null;
  pirepCache.clear();
}

async function getJsonOnce(url: string, deps: WeatherDeps): Promise<unknown> {
  const f = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
    const text = await res.text();
    if (!text.trim()) return [];
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(t);
  }
}

/**
 * One retry after a timeout or a server error. aviationweather.gov mostly answers in well under a second but
 * was measured sometimes taking 6 s or more (see the airport loader), and a PIREP request was seen aborted.
 */
async function getJson(url: string, deps: WeatherDeps): Promise<unknown> {
  try {
    return await getJsonOnce(url, deps);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== undefined && status < 500) throw err;
    return getJsonOnce(url, deps);
  }
}

function logFailure(part: string, err: unknown) {
  console.warn(
    "[weather] " +
      part +
      " failed: " +
      (err instanceof Error ? err.name + ": " + err.message : String(err)),
  );
}

export async function loadAdvisories(deps: WeatherDeps = {}): Promise<AdvisoryResult> {
  const now = (deps.now ?? Date.now)();
  if (advisoryCache && now - advisoryCache.at < ADVISORY_TTL_MS) return advisoryCache.value;
  const failed: AdvisoryResult["failed"] = [];
  const part = async (
    name: "sigmet" | "isigmet" | "gairmet",
    path: string,
    parse: (json: unknown) => Advisory[],
  ): Promise<Advisory[]> => {
    try {
      return parse(await getJson(AWC_BASE + "/" + path + "?format=json", deps));
    } catch (err) {
      logFailure(name, err);
      failed.push(name);
      return [];
    }
  };
  const [us, intl, g] = await Promise.all([
    part("sigmet", "airsigmet", (j) => parseSigmets(j, "sigmet", now)),
    part("isigmet", "isigmet", (j) => parseSigmets(j, "isigmet", now)),
    part("gairmet", "gairmet", (j) => parseGairmets(j, now)),
  ]);
  const value: AdvisoryResult = { advisories: [...g, ...intl, ...us], failed, fetchedAt: now };
  // A partial answer is not kept, so the next request tries the failed feed again.
  if (failed.length === 0) advisoryCache = { at: now, value };
  return value;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Round a requested view to whole degrees (so nearby views share a cache entry) and limit its size.
 * Returns null for an invalid box.
 */
export function normalizeBox(box: PirepBox): PirepBox | null {
  const { south, west, north, east } = box;
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (north <= south) return null;
  // A view across the date line (west greater than east) is not supported: the caller sends two boxes or none.
  if (east <= west) return null;
  let s = clamp(Math.floor(south), -90, 90);
  let n = clamp(Math.ceil(north), -90, 90);
  let w = clamp(Math.floor(west), -180, 180);
  let e = clamp(Math.ceil(east), -180, 180);
  if (n - s > PIREP_MAX_SPAN_DEG) {
    const mid = (n + s) / 2;
    s = clamp(Math.floor(mid - PIREP_MAX_SPAN_DEG / 2), -90, 90);
    n = clamp(s + PIREP_MAX_SPAN_DEG, -90, 90);
  }
  if (e - w > PIREP_MAX_SPAN_DEG) {
    const mid = (e + w) / 2;
    w = clamp(Math.floor(mid - PIREP_MAX_SPAN_DEG / 2), -180, 180);
    e = clamp(w + PIREP_MAX_SPAN_DEG, -180, 180);
  }
  return { south: s, west: w, north: n, east: e };
}

export async function loadPireps(
  boxIn: PirepBox,
  deps: WeatherDeps = {},
): Promise<PirepResult | null> {
  const box = normalizeBox(boxIn);
  if (!box) return null;
  const now = (deps.now ?? Date.now)();
  const key = [box.south, box.west, box.north, box.east].join(",");
  const hit = pirepCache.get(key);
  if (hit && now - hit.at < PIREP_TTL_MS) return hit.value;
  const url =
    AWC_BASE +
    "/pirep?format=json&age=" +
    PIREP_AGE_HOURS +
    "&bbox=" +
    [box.south, box.west, box.north, box.east].join(",");
  const json = await getJson(url, deps);
  const value: PirepResult = { pireps: parsePireps(json), box, fetchedAt: now };
  prune(pirepCache, PIREP_TTL_MS, 200, now);
  pirepCache.set(key, { at: now, value });
  return value;
}
