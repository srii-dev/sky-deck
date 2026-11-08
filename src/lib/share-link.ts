/*
 * Shareable links (Phase 22a): the page address holds the map view, the selected aircraft and the
 * basemap, so a link reopens the same view. Pure functions, validated, no personal data.
 *   ?lat=40.7128&lon=-74.006&z=9.5&p=45&b=-15&hex=a835af&base=satellite
 */

import type { Basemap } from "@/components/skydeck/map-config";

export interface ShareState {
  lat: number;
  lon: number;
  zoom: number;
  pitch?: number | undefined;
  bearing?: number | undefined;
  hex?: string | undefined;
  basemap?: Basemap | undefined;
}

const KEYS = ["lat", "lon", "z", "p", "b", "hex", "base"] as const;

const num = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const inRange = (n: number | null, min: number, max: number): number | undefined =>
  n != null && n >= min && n <= max ? n : undefined;

/** Read and validate the share parameters. Anything missing or out of range is left out. */
export function parseShareParams(search: string): Partial<ShareState> {
  const p = new URLSearchParams(search);
  const out: Partial<ShareState> = {};
  const lat = inRange(num(p.get("lat")), -90, 90);
  const lon = inRange(num(p.get("lon")), -180, 180);
  // A view needs both coordinates.
  if (lat !== undefined && lon !== undefined) {
    out.lat = lat;
    out.lon = lon;
    const zoom = inRange(num(p.get("z")), 0, 22);
    if (zoom !== undefined) out.zoom = zoom;
    const pitch = inRange(num(p.get("p")), 0, 85);
    if (pitch !== undefined) out.pitch = pitch;
    const bearing = inRange(num(p.get("b")), -360, 360);
    if (bearing !== undefined) out.bearing = bearing;
  }
  const hex = p.get("hex");
  if (hex && /^[0-9a-f]{6}$/i.test(hex)) out.hex = hex.toLowerCase();
  const base = p.get("base");
  if (base === "dark" || base === "light" || base === "satellite") out.basemap = base;
  return out;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/**
 * The query string for a state, keeping any parameters that are not ours (for example `mock`).
 * Returns the string without a leading "?" ("" when empty).
 */
export function buildShareSearch(state: ShareState, existing = ""): string {
  const p = new URLSearchParams(existing);
  for (const k of KEYS) p.delete(k);
  p.set("lat", String(round(state.lat, 4)));
  p.set("lon", String(round(state.lon, 4)));
  p.set("z", String(round(state.zoom, 2)));
  if (state.pitch !== undefined) p.set("p", String(round(state.pitch, 0)));
  if (state.bearing !== undefined) p.set("b", String(round(state.bearing, 0)));
  if (state.hex) p.set("hex", state.hex.toLowerCase());
  if (state.basemap) p.set("base", state.basemap);
  return p.toString();
}
