import type { GeoJSONSource } from "maplibre-gl";

import type { MapCtx } from "./types";

/** Draws the ruler's points and line. With one point set, `hover` is the cursor the line follows. */
export function applyRuler(ctx: MapCtx, hover?: [number, number]): void {
  const map = ctx.mapRef.current;
  const src = map?.getSource("sd-ruler") as GeoJSONSource | undefined;
  if (!src) return;
  const set = ctx.propsRef.current.rulerPoints ?? [];
  // One point set: the line follows the cursor until the second click.
  const pts = set.length === 1 && hover ? [set[0]!, hover] : set;
  const features: GeoJSON.Feature[] = pts.map((p) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: p },
  }));
  if (pts.length === 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: pts },
    });
  }
  src.setData({ type: "FeatureCollection", features });
}
