// Browser-safe map configuration shared by the route and the lazily loaded map.

export type Basemap = "dark" | "satellite" | "light";

export interface Viewport {
  lat: number;
  lon: number;
  radiusNm: number;
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
}

export const DEFAULT_VIEW = { lat: 40.72, lon: -73.95, zoom: 8.3, pitch: 45, bearing: -15 };
