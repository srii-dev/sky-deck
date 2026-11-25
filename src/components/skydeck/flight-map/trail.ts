import type { GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Feature, LineString, Polygon } from "geojson";

import { altitudeColor } from "@/lib/aircraft";
import type { TrailPoint } from "../map-config";
import { empty } from "./common";
import { trackState } from "./tracks";
import type { MapCtx } from "./types";

const FT_TO_M = 0.3048;
const M_PER_DEG = 111320;

function ribbon(p: TrailPoint, q: TrailPoint, halfWidthM: number): number[][] {
  const cos = Math.max(0.05, Math.cos((p.lat * Math.PI) / 180));
  const dx = (q.lon - p.lon) * M_PER_DEG * cos;
  const dy = (q.lat - p.lat) * M_PER_DEG;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * halfWidthM;
  const py = (dx / len) * halfWidthM;
  const oLon = px / (M_PER_DEG * cos);
  const oLat = py / M_PER_DEG;
  return [
    [p.lon + oLon, p.lat + oLat],
    [q.lon + oLon, q.lat + oLat],
    [q.lon - oLon, q.lat - oLat],
    [p.lon - oLon, p.lat - oLat],
    [p.lon + oLon, p.lat + oLat],
  ];
}

export function trailFeatures(trail: TrailPoint[]) {
  const lines: Feature<LineString>[] = [];
  const ribbons: Feature<Polygon>[] = [];
  const curtains: Feature<Polygon>[] = [];
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i - 1];
    const q = trail[i];
    if (!p || !q) continue;
    if (Math.abs(p.lat - q.lat) < 1e-7 && Math.abs(p.lon - q.lon) < 1e-7) continue;
    const altFt = q.onGround ? 0 : (q.altFt ?? 0);
    const color = altitudeColor(q.altFt, q.onGround);
    lines.push({
      type: "Feature",
      properties: { color },
      geometry: {
        type: "LineString",
        coordinates: [
          [p.lon, p.lat],
          [q.lon, q.lat],
        ],
      },
    });
    const altM = altFt * FT_TO_M;
    ribbons.push({
      type: "Feature",
      properties: { color, base: altM, top: altM + 90 },
      geometry: { type: "Polygon", coordinates: [ribbon(p, q, 140)] },
    });
    curtains.push({
      type: "Feature",
      properties: { color, base: 0, top: altM },
      geometry: { type: "Polygon", coordinates: [ribbon(p, q, 25)] },
    });
  }
  return {
    lines: { type: "FeatureCollection", features: lines } as FeatureCollection,
    ribbons: { type: "FeatureCollection", features: ribbons } as FeatureCollection,
    curtains: { type: "FeatureCollection", features: curtains } as FeatureCollection,
  };
}

/** Draws the selected aircraft's trail, or `override` (the replay's own trail) when given. */
export function applyTrail(ctx: MapCtx, override?: TrailPoint[]): void {
  const map = ctx.mapRef.current;
  if (!map) return;
  // While replaying, only the replay's own trail is drawn (the live trail would flicker over it).
  if (ctx.propsRef.current.replay && !override) return;
  const { trail, trail3d, selectedHex, showTrail } = ctx.propsRef.current;
  // The trail stops at the drawn moment (the icon is a few seconds behind the newest data) and joins the icon.
  const drawT = Date.now() - ctx.delayRef.current.delayMs;
  const pts =
    override ??
    (selectedHex && showTrail !== false ? trail.filter((p) => (p.st ?? p.t) <= drawT) : []);
  const tr = selectedHex && !override ? ctx.tracksRef.current.get(selectedHex) : undefined;
  if (tr && pts.length) {
    const m = trackState(tr, drawT);
    pts.push({ lat: m.lat, lon: m.lon, altFt: m.altFt, onGround: m.onGround, t: Date.now() });
  }
  const f = trailFeatures(pts);
  (map.getSource("sd-trail") as GeoJSONSource | undefined)?.setData(trail3d ? empty() : f.lines);
  (map.getSource("sd-trail-ribbon") as GeoJSONSource | undefined)?.setData(
    trail3d ? f.ribbons : empty(),
  );
  (map.getSource("sd-trail-curtain") as GeoJSONSource | undefined)?.setData(
    trail3d ? f.curtains : empty(),
  );
}
