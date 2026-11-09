import { greatCirclePoints, type LatLon } from "./route-geometry";

/*
 * Terrain profile along a line (Phase 8b), from the AWS Terrarium elevation tiles that the map already uses
 * for 3D terrain (free, no key, CORS open: checked 2026-11-08 with one real tile request).
 * Terrarium encodes elevation in metres in the colour of each pixel: (R * 256 + G + B / 256) - 32768.
 * The tile fetching is injected so the maths can be tested without the network. At zoom 7 a pixel is about
 * 300 m wide at the equator and the tiles are coarse near cliffs and narrow peaks, so the profile is an
 * overview, not a clearance tool.
 */

export const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const PROFILE_ZOOM = 7;
export const TILE_SIZE = 256;
export const FT_PER_M = 3.28084;
export const PROFILE_DISCLAIMER =
  "Terrain along a straight line between the airports, from coarse elevation tiles. Not the flight's real path. Educational only, not for flight planning.";

export interface TileRef {
  z: number;
  x: number;
  y: number;
}

/** Slippy-map tile and pixel for a coordinate at zoom z. */
export function lonLatToTilePixel(p: LatLon, z: number): { tile: TileRef; px: number; py: number } {
  const n = 2 ** z;
  const lat = Math.max(-85.0511, Math.min(85.0511, p.lat));
  const x = ((p.lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.min(n - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(n - 1, Math.max(0, Math.floor(y)));
  return {
    tile: { z, x: tx, y: ty },
    px: Math.min(TILE_SIZE - 1, Math.floor((x - tx) * TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor((y - ty) * TILE_SIZE)),
  };
}

export function tileKey(t: TileRef): string {
  return t.z + "/" + t.x + "/" + t.y;
}

export function tileUrl(t: TileRef): string {
  return TERRARIUM_URL.replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

/** Elevation in metres from one Terrarium pixel. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** RGBA pixels of one tile (TILE_SIZE by TILE_SIZE), or null when it could not be loaded. */
export type TilePixels = { data: ArrayLike<number> } | null;
export type TileLoader = (t: TileRef) => Promise<TilePixels>;

export interface ProfilePoint {
  /** Distance from the start, nm. */
  nm: number;
  lat: number;
  lon: number;
  /** Elevation in feet; null when its tile could not be read. */
  elevFt: number | null;
}

/**
 * Elevation at `count` evenly spaced points from a to b. Each needed tile is loaded once. `totalNm` is the line
 * length, used for the distance axis.
 */
export async function sampleProfile(
  a: LatLon,
  b: LatLon,
  totalNm: number,
  count: number,
  load: TileLoader,
  zoom: number = PROFILE_ZOOM,
): Promise<ProfilePoint[]> {
  const pts = greatCirclePoints(a, b, count);
  const refs = pts.map((p) => lonLatToTilePixel(p, zoom));
  const tiles = new Map<string, Promise<TilePixels>>();
  for (const r of refs) {
    const k = tileKey(r.tile);
    if (!tiles.has(k))
      tiles.set(
        k,
        load(r.tile).catch(() => null),
      );
  }
  const loaded = new Map<string, TilePixels>();
  for (const [k, p] of tiles) loaded.set(k, await p);
  return pts.map((p, i) => {
    const r = refs[i]!;
    const px = loaded.get(tileKey(r.tile));
    let elevFt: number | null = null;
    if (px) {
      const o = (r.py * TILE_SIZE + r.px) * 4;
      const red = px.data[o];
      const green = px.data[o + 1];
      const blue = px.data[o + 2];
      if (red !== undefined && green !== undefined && blue !== undefined) {
        elevFt = decodeTerrarium(red, green, blue) * FT_PER_M;
      }
    }
    return { nm: (totalNm * i) / (pts.length - 1), lat: p.lat, lon: p.lon, elevFt };
  });
}

export interface ProfileSummary {
  /** Highest known terrain, ft (never below zero: sea level), and where along the line, nm. */
  maxFt: number;
  maxAtNm: number;
  /** How many points could not be read. */
  missing: number;
}

export function summarizeProfile(points: readonly ProfilePoint[]): ProfileSummary | null {
  let maxFt = -Infinity;
  let maxAtNm = 0;
  let missing = 0;
  for (const p of points) {
    if (p.elevFt == null) {
      missing += 1;
      continue;
    }
    // The sea reads slightly below zero in some tiles; show it as sea level.
    const ft = Math.max(0, p.elevFt);
    if (ft > maxFt) {
      maxFt = ft;
      maxAtNm = p.nm;
    }
  }
  return Number.isFinite(maxFt) ? { maxFt, maxAtNm, missing } : null;
}

/**
 * SVG path data for the terrain area under the profile, in a box of width x height pixels. The vertical scale
 * runs from 0 to `topFt` (at least the highest terrain). Missing points are bridged by their neighbours.
 */
export function profileAreaPath(
  points: readonly ProfilePoint[],
  width: number,
  height: number,
  topFt: number,
): string {
  const usable = points.filter((p) => p.elevFt != null);
  const last = points[points.length - 1];
  if (usable.length < 2 || !last || last.nm <= 0 || topFt <= 0) return "";
  const x = (nm: number) => (nm / last.nm) * width;
  const y = (ft: number) => height - (Math.max(0, Math.min(topFt, ft)) / topFt) * height;
  let d = "";
  for (const p of usable) {
    d += (d ? " L" : "M") + x(p.nm).toFixed(1) + " " + y(p.elevFt ?? 0).toFixed(1);
  }
  const firstX = x(usable[0]!.nm).toFixed(1);
  const lastX = x(usable[usable.length - 1]!.nm).toFixed(1);
  return d + " L" + lastX + " " + height + " L" + firstX + " " + height + " Z";
}

/** The y position (pixels) of an altitude in the same box, or null when it is above the chart top. */
export function altitudeY(altFt: number, height: number, topFt: number): number | null {
  if (topFt <= 0 || altFt > topFt) return null;
  return height - (Math.max(0, altFt) / topFt) * height;
}

/** A tidy top value for the chart: the highest of the terrain and the aircraft, rounded up, at least 2000 ft. */
export function chartTopFt(maxTerrainFt: number, aircraftFt: number | null): number {
  const peak = Math.max(maxTerrainFt, aircraftFt ?? 0, 2000);
  const step = peak > 20000 ? 5000 : peak > 8000 ? 2000 : 1000;
  return Math.ceil(peak / step) * step;
}
