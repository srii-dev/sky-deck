import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import type { AlertArea } from "@/lib/alert-rules";
import { EARTH_RADIUS_NM } from "@/lib/glide-ring";

/*
 * Alert areas on the map (Phase 10c): a dashed circle and a label for every area used by an alert rule, and a
 * preview of the area being drawn. Re-applied after every basemap switch like the other overlays.
 */

export interface AlertAreaDrawing {
  id: string;
  area: AlertArea;
  /** The area being drawn or edited, drawn brighter. */
  preview?: boolean | undefined;
}

export const ALERT_AREA_IDS = {
  source: "sd-alert-areas",
  fill: "sd-alert-area-fill",
  line: "sd-alert-area-line",
  label: "sd-alert-area-label",
} as const;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** The point `nm` nautical miles from `center` along `bearingDeg`. */
export function destinationPoint(
  center: { lat: number; lon: number },
  bearingDeg: number,
  nm: number,
): [number, number] {
  const d = nm / EARTH_RADIUS_NM;
  const b = toRad(bearingDeg);
  const lat1 = toRad(center.lat);
  const lon1 = toRad(center.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [((toDeg(lon2) + 540) % 360) - 180, toDeg(lat2)];
}

/** A closed ring of [lon, lat] points around the area (a circle on the globe). */
export function circleRing(area: AlertArea, points = 64): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++)
    ring.push(destinationPoint(area, (360 * i) / points, area.radiusNm));
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return ring;
}

export function alertAreaCollection(list: readonly AlertAreaDrawing[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = list.map((d) => ({
    type: "Feature",
    properties: {
      id: d.id,
      label: d.area.label + " " + d.area.radiusNm + " nm",
      preview: !!d.preview,
    },
    geometry: { type: "Polygon", coordinates: [circleRing(d.area)] },
  }));
  return { type: "FeatureCollection", features };
}

/** Make the map show exactly these areas. Safe to call repeatedly and after every style load. */
export function applyAlertAreas(
  map: MLMap,
  areas: readonly AlertAreaDrawing[],
  before?: string,
): void {
  if (map._removed) return;
  const ids = ALERT_AREA_IDS;
  const beforeId = before && map.getLayer(before) ? before : undefined;
  if (areas.length === 0) {
    for (const id of [ids.label, ids.line, ids.fill]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(ids.source)) map.removeSource(ids.source);
    return;
  }
  const data = alertAreaCollection(areas);
  const src = map.getSource(ids.source) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(ids.source, { type: "geojson", data });
  if (!map.getLayer(ids.fill)) {
    map.addLayer(
      {
        id: ids.fill,
        type: "fill",
        source: ids.source,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": ["case", ["get", "preview"], 0.18, 0.07],
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(ids.line)) {
    map.addLayer(
      {
        id: ids.line,
        type: "line",
        source: ids.source,
        paint: {
          "line-color": "#f59e0b",
          "line-width": 1.6,
          "line-dasharray": [3, 2],
          "line-opacity": 0.9,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(ids.label)) {
    map.addLayer(
      {
        id: ids.label,
        type: "symbol",
        source: ids.source,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-optional": true,
        },
        paint: {
          "text-color": "#fbbf24",
          "text-halo-color": "rgba(5,10,18,0.9)",
          "text-halo-width": 1.3,
        },
      },
      beforeId,
    );
  }
}
