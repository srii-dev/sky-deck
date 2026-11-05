import type { Feature, Polygon } from "geojson";
import type { AircraftKind } from "./aircraft-kind";
import type { UnitSystem } from "./units";

export const TERRAIN_EXAGGERATION = 1.3;
export const FT_PER_NM = 6076.12;
export const FT_TO_M = 0.3048;
export const NM_TO_KM = 1.852;
export const NM_TO_SM = 1.150779;
export const EARTH_RADIUS_NM = 3440.065;

export const GLIDE_DISCLAIMER = "Educational estimate only. Not for operational or safety use.";
export const GLIDE_RATIO_LABEL = "Typical rule-of-thumb ratios, not aircraft-specific";
export const ELEV_UNAVAILABLE_TERRAIN_OFF = "Elevation unavailable – terrain required";
export const ELEV_UNAVAILABLE_GENERIC = "Elevation unavailable";

/** Default rule-of-thumb still-air glide ratios by category. */
export const DEFAULT_GLIDE_RATIOS: Record<AircraftKind, number | null> = {
  narrowbody: 17,
  widebody: 15,
  bizjet: 14,
  light: 9,
  helicopter: 4,
  glider: 35,
  generic: 12,
  balloon: null,
  drone: null,
  ground: null,
};

export interface GlideRatioBounds {
  min: number;
  max: number;
  step: number;
  defaultRatio: number;
}

export function glideRatioBounds(kind: AircraftKind): GlideRatioBounds | null {
  const def = DEFAULT_GLIDE_RATIOS[kind];
  if (def == null) return null;
  if (kind === "glider") {
    return { min: 30, max: 40, step: 0.5, defaultRatio: def };
  }
  return {
    min: Math.round(def * 0.5 * 10) / 10,
    max: Math.round(def * 1.5 * 10) / 10,
    step: 0.5,
    defaultRatio: def,
  };
}

/** Clamp a glide ratio to the category's bounds. Returns the original ratio if unbounded. */
export function clampGlideRatio(ratio: number, kind: AircraftKind): number {
  const bounds = glideRatioBounds(kind);
  if (!bounds) return ratio;
  return Math.min(bounds.max, Math.max(bounds.min, ratio));
}

/** Compute still-air glide range in nautical miles from AGL in feet and glide ratio. */
export function rangeNm(altAGLFt: number, ratio: number): number {
  if (altAGLFt <= 0 || ratio <= 0) return 0;
  return (altAGLFt / FT_PER_NM) * ratio;
}

/**
 * Compute altitude above ground level (AGL) in feet.
 *
 * @param altFt Barometric pressure altitude (or geometric fallback) in feet.
 * @param onGround True if aircraft reports being on the ground.
 * @param rawTerrainElevM Raw elevation returned by MapLibre queryTerrainElevation (multiplied by TERRAIN_EXAGGERATION).
 */
export function computeAGL(
  altFt: number | null,
  onGround: boolean,
  rawTerrainElevM: number | null,
): number | null {
  if (onGround || altFt == null || rawTerrainElevM == null) return null;
  const trueElevM = rawTerrainElevM / TERRAIN_EXAGGERATION;
  const groundElevFt = trueElevM / FT_TO_M;
  const aglFt = altFt - groundElevFt;
  if (aglFt <= 0) return null;
  return aglFt;
}

export interface ElevationCacheEntry {
  elevM: number;
  lat: number;
  lon: number;
  sampledAt: number;
}

export const ELEVATION_CACHE_TTL_MS = 20_000;
export const ELEVATION_CACHE_MAX_DIST_NM = 3;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(s));
}

export function isElevationCacheValid(
  entry: ElevationCacheEntry | undefined,
  lat: number,
  lon: number,
  now: number,
): boolean {
  if (!entry) return false;
  if (now - entry.sampledAt > ELEVATION_CACHE_TTL_MS) return false;
  if (haversineNm(entry.lat, entry.lon, lat, lon) > ELEVATION_CACHE_MAX_DIST_NM) return false;
  return true;
}

/**
 * Destination point given distance in nm and bearing in degrees on spherical Earth.
 * Returns [lat, lon] in degrees.
 */
export function destinationPoint(
  lat: number,
  lon: number,
  distNm: number,
  bearingDeg: number,
): [number, number] {
  const d = distNm / EARTH_RADIUS_NM;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  const lat2Deg = (lat2 * 180) / Math.PI;
  const lon2Deg = (((lon2 * 180) / Math.PI + 540) % 360) - 180;
  return [lat2Deg, lon2Deg];
}

/**
 * Build GeoJSON Polygon for glide range ring.
 * Coordinates are formatted as [lon, lat] per GeoJSON specification.
 * Longitudes are unwrapped continuously around centreLon to avoid antimeridian artifacts.
 */
export function buildRingPolygon(
  centreLat: number,
  centreLon: number,
  radiusNm: number,
  numPoints = 72,
): Feature<Polygon> {
  const coords: [number, number][] = [];
  const step = 360 / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const bearing = i * step;
    const [pLat, pLon] = destinationPoint(centreLat, centreLon, radiusNm, bearing);
    let lon = pLon;
    while (lon - centreLon > 180) lon -= 360;
    while (lon - centreLon < -180) lon += 360;
    coords.push([lon, pLat]);
  }
  // Close the polygon ring
  if (coords.length > 0 && coords[0]) {
    coords.push([coords[0][0], coords[0][1]]);
  }

  return {
    type: "Feature",
    properties: { radiusNm },
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

export function fmtRange(nm: number, u: UnitSystem): string {
  if (nm <= 0) return "0 nm";
  if (u === "metric") {
    return `${Math.round(nm * NM_TO_KM).toLocaleString("en-US")} km`;
  }
  if (u === "imperial") {
    return `${Math.round(nm * NM_TO_SM).toLocaleString("en-US")} mi`;
  }
  return `${nm.toFixed(1)} nm`;
}
