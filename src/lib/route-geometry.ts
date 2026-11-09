import { EARTH_RADIUS_NM } from "./glide-ring";

/*
 * Route line geometry (Phase 8a). The route lookup only gives the origin and destination airports, not the path
 * the flight was cleared along, so the line drawn here is the shortest (great-circle) line between them: an
 * approximation, labelled as one wherever it is shown.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point a fraction f (0 to 1) of the way along the great circle from a to b. */
export function intermediatePoint(a: LatLon, b: LatLon, f: number): LatLon {
  const d = distanceNm(a, b) / EARTH_RADIUS_NM;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/** `count` evenly spaced points from a to b, both ends included (count of at least 2). */
export function greatCirclePoints(a: LatLon, b: LatLon, count: number): LatLon[] {
  const n = Math.max(2, Math.floor(count));
  const out: LatLon[] = [];
  for (let i = 0; i < n; i++) out.push(intermediatePoint(a, b, i / (n - 1)));
  return out;
}

/**
 * Points for a line on the map. A line that crosses the date line is split into two parts so it is not drawn
 * across the whole map. Each part is a list of [lon, lat].
 */
export function routeLineParts(a: LatLon, b: LatLon, pointsPerPart = 64): [number, number][][] {
  const pts = greatCirclePoints(a, b, pointsPerPart);
  const parts: [number, number][][] = [];
  let current: [number, number][] = [];
  let prevLon: number | null = null;
  for (const p of pts) {
    if (prevLon != null && Math.abs(p.lon - prevLon) > 180) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
    current.push([p.lon, p.lat]);
    prevLon = p.lon;
  }
  if (current.length > 1) parts.push(current);
  return parts;
}

export interface RouteProgress {
  totalNm: number;
  /** Straight-line distance from the origin to the aircraft's nearest point on the line, nm. */
  flownNm: number;
  remainingNm: number;
  /** 0 to 1 along the line. */
  fraction: number;
  /** How far the aircraft is from the line, nm. Large values mean the flight is not on this route. */
  offLineNm: number;
}

/**
 * Where an aircraft is along the line from a to b: the closest of `samples` points on the line. Cheap and
 * good enough for a label; it is not cross-track navigation.
 */
export function routeProgress(a: LatLon, b: LatLon, p: LatLon, samples = 200): RouteProgress {
  const total = distanceNm(a, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const q = intermediatePoint(a, b, i / samples);
    const d = distanceNm(q, p);
    if (d < bestD) {
      bestD = d;
      best = i / samples;
    }
  }
  return {
    totalNm: total,
    flownNm: total * best,
    remainingNm: total * (1 - best),
    fraction: best,
    offLineNm: bestD,
  };
}

/** A route is drawable when both ends have finite coordinates and are not the same place. */
export function isDrawableRoute(
  a: LatLon | null | undefined,
  b: LatLon | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return false;
  return distanceNm(a, b) > 1;
}
