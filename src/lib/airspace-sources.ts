import { parseAirspace, type Airspace, type AirspaceLayer } from "./airspace";
import { prune, type CacheEntry } from "./request-control";

/*
 * Server-side loader for the airspace map layers (Phase 8d). The FAA data changes about every 8 weeks (per the
 * layer's own metadata), so answers are cached for 12 hours per rounded box and nobody queries it per visitor.
 * The requested box is rounded to whole degrees and limited in size, which also bounds the answer size.
 * Tests inject fetch and the clock.
 */

const BASE = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services";
const SERVICES: Record<AirspaceLayer, { path: string; where: string; fields: string }> = {
  class: {
    path: "/Class_Airspace/FeatureServer/0/query",
    where: "CLASS IN ('B','C','D')",
    fields:
      "OBJECTID,NAME,CLASS,ICAO_ID,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE",
  },
  special: {
    path: "/Special_Use_Airspace/FeatureServer/0/query",
    where: "TYPE_CODE IN ('R','P','W','A','MOA')",
    fields:
      "OBJECTID,NAME,TYPE_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE,TIMESOFUSE",
  },
};
const UA = "SkyDeck/1.0 (hobby flight tracker; educational use)";
const TIMEOUT_MS = 10_000;
export const AIRSPACE_TTL_MS = 12 * 60 * 60 * 1000;
/** Widest box answered, in degrees. */
export const AIRSPACE_MAX_SPAN_DEG = 6;
/** Geometry is simplified to about this many degrees (about 100 m). */
export const SIMPLIFY_DEG = 0.001;
const MAX_FEATURES = 600;

export interface AirspaceBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AirspaceResult {
  layer: AirspaceLayer;
  areas: Airspace[];
  box: AirspaceBox;
  /** The FAA service had more areas than we ask for; some are missing. */
  truncated: boolean;
  fetchedAt: number;
}

export interface AirspaceDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const cache = new Map<string, CacheEntry<AirspaceResult>>();

export function resetAirspaceState() {
  cache.clear();
}

/** Whole degrees, limited size. Null for an invalid box or one across the date line. */
export function normalizeAirspaceBox(box: AirspaceBox): AirspaceBox | null {
  const { south, west, north, east } = box;
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;
  const s = Math.max(-90, Math.floor(south));
  const n = Math.min(90, Math.ceil(north));
  const w = Math.max(-180, Math.floor(west));
  const e = Math.min(180, Math.ceil(east));
  if (n - s > AIRSPACE_MAX_SPAN_DEG || e - w > AIRSPACE_MAX_SPAN_DEG) return null;
  return { south: s, west: w, north: n, east: e };
}

export function airspaceUrl(layer: AirspaceLayer, box: AirspaceBox): string {
  const svc = SERVICES[layer];
  const params = new URLSearchParams({
    where: svc.where,
    geometry: [box.west, box.south, box.east, box.north].join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: svc.fields,
    returnGeometry: "true",
    maxAllowableOffset: String(SIMPLIFY_DEG),
    geometryPrecision: "4",
    resultRecordCount: String(MAX_FEATURES),
    f: "geojson",
  });
  return BASE + svc.path + "?" + params.toString();
}

async function getJsonOnce(url: string, deps: AirspaceDeps): Promise<unknown> {
  const f = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await f(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

/** One retry after a timeout or a server error. */
async function getJson(url: string, deps: AirspaceDeps): Promise<unknown> {
  try {
    return await getJsonOnce(url, deps);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== undefined && status < 500) throw err;
    return getJsonOnce(url, deps);
  }
}

export async function loadAirspace(
  layer: AirspaceLayer,
  boxIn: AirspaceBox,
  deps: AirspaceDeps = {},
): Promise<AirspaceResult | null> {
  const box = normalizeAirspaceBox(boxIn);
  if (!box) return null;
  const now = (deps.now ?? Date.now)();
  const key = layer + ":" + [box.south, box.west, box.north, box.east].join(",");
  const hit = cache.get(key);
  if (hit && now - hit.at < AIRSPACE_TTL_MS) return hit.value;
  const json = await getJson(airspaceUrl(layer, box), deps);
  // ArcGIS answers errors with HTTP 200 and an error object.
  if (json && typeof json === "object" && "error" in json) throw new Error("FAA service error");
  const areas = parseAirspace(json, layer);
  const truncated =
    !!json &&
    typeof json === "object" &&
    (("exceededTransferLimit" in json &&
      (json as { exceededTransferLimit?: unknown }).exceededTransferLimit === true) ||
      areas.length >= MAX_FEATURES);
  const value: AirspaceResult = { layer, areas, box, truncated, fetchedAt: now };
  prune(cache, AIRSPACE_TTL_MS, 200, now);
  cache.set(key, { at: now, value });
  return value;
}
