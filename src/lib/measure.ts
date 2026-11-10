/*
 * Distance and bearing ruler (Phase 22d): two clicked points on the map. Straight-line (great
 * circle) distance, an estimate only.
 */

import { haversineNm } from "./coverage";
import { fmtRange } from "./glide-ring";
import { compassPoint, type UnitSystem } from "./units";

export type LngLat = [number, number];

/** Initial bearing from a to b in degrees, 0 to 360 (0 = north). Points are [lon, lat]. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const toR = Math.PI / 180;
  const [lon1, lat1] = [a[0] * toR, a[1] * toR];
  const [lon2, lat2] = [b[0] * toR, b[1] * toR];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (((Math.atan2(y, x) / toR) % 360) + 360) % 360;
}

export function distanceNm(a: LngLat, b: LngLat): number {
  return haversineNm(a[1], a[0], b[1], b[0]);
}

/** Text for the ruler readout, or null until there are two points. */
export function rulerSummary(points: LngLat[], units: UnitSystem): string | null {
  const a = points[0];
  const b = points[1];
  if (!a || !b) return null;
  const bearing = Math.round(bearingDeg(a, b)) % 360;
  return `${fmtRange(distanceNm(a, b), units)} · ${String(bearing).padStart(3, "0")}° ${compassPoint(bearing)}`;
}

/** The ruler point at an aircraft's position (Phase 22d: measure from the selected aircraft). */
export function pointAtAircraft(a: { lat: number; lon: number }): LngLat | null {
  return Number.isFinite(a.lat) && Number.isFinite(a.lon) ? [a.lon, a.lat] : null;
}

/** The next set of points after a click: a third click starts a new measurement. */
export function nextRulerPoints(points: LngLat[], click: LngLat): LngLat[] {
  return points.length >= 2 ? [click] : [...points, click];
}
