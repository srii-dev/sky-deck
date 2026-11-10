import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import { nightRing } from "@/lib/sun";

/*
 * Day and night shading (Phase 24d): a translucent dark polygon over the part of the earth where the sun is below the
 * horizon, and a thin line along the day and night line. Re-applied after every basemap switch and every minute.
 */

export const NIGHT_IDS = {
  source: "sd-night",
  fill: "sd-night-fill",
  line: "sd-night-line",
} as const;

export function nightCollection(date: Date): FeatureCollection<Polygon> {
  const ring = nightRing(date);
  const feature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
  return { type: "FeatureCollection", features: [feature] };
}

/** Make the map show the night shading (or none). Safe to call repeatedly and after every style load. */
export function applyNight(map: MLMap, on: boolean, now: Date, before?: string): void {
  if (map._removed) return;
  const ids = NIGHT_IDS;
  try {
    if (!on) {
      if (map.getLayer(ids.line)) map.removeLayer(ids.line);
      if (map.getLayer(ids.fill)) map.removeLayer(ids.fill);
      if (map.getSource(ids.source)) map.removeSource(ids.source);
      return;
    }
    const beforeId = before && map.getLayer(before) ? before : undefined;
    const data = nightCollection(now);
    const src = map.getSource(ids.source) as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(ids.source, { type: "geojson", data });
    if (!map.getLayer(ids.fill)) {
      map.addLayer(
        {
          id: ids.fill,
          type: "fill",
          source: ids.source,
          paint: { "fill-color": "#020617", "fill-opacity": 0.38 },
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
          paint: { "line-color": "#f5b83d", "line-opacity": 0.35, "line-width": 1 },
        },
        beforeId,
      );
    }
  } catch {
    // The style was swapped or the map was removed; the next style.load applies it again.
  }
}
