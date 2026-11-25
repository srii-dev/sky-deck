import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

export const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Below basemap labels when those sit under the trails, and always below trails and aircraft. */
export function terrainBeforeId(map: MLMap): string | undefined {
  const layers = map.getStyle().layers ?? [];
  let idx = -1;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer) continue;
    const basemapSymbol = layer.type === "symbol" && !layer.id.startsWith("sd-");
    if (layer.id === "sd-glide-ring-fill" || layer.id === "sd-trail-line" || basemapSymbol)
      idx = idx < 0 ? i : Math.min(idx, i);
  }
  return idx >= 0 ? layers[idx]?.id : undefined;
}
