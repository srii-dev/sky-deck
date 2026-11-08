// Browser-safe map configuration shared by the route and the lazily loaded map.

export type Basemap = "dark" | "satellite" | "light";

export interface Viewport {
  lat: number;
  lon: number;
  radiusNm: number;
  /** Camera state, used for shareable links and saved views. */
  zoom?: number | undefined;
  pitch?: number | undefined;
  bearing?: number | undefined;
  /** Visible map bounds (longitudes may be unwrapped past ±180). */
  bounds?: { north: number; south: number; east: number; west: number } | undefined;
}

export interface FlyTarget {
  id: number;
  lat: number;
  lon: number;
  zoom?: number | undefined;
}

export interface TrailPoint {
  lat: number;
  lon: number;
  altFt: number | null;
  onGround: boolean;
  t: number;
  /** When the position was reported (ms), arrival time minus its age. Used to stop the trail at the drawn moment. */
  st?: number | undefined;
  /** Ground speed (kt) and vertical rate (ft/min) at this sample, for the flight charts. */
  gs?: number | null | undefined;
  vRate?: number | null | undefined;
}

export const DEFAULT_VIEW = { lat: 40.72, lon: -73.95, zoom: 8.3, pitch: 45, bearing: -15 };
