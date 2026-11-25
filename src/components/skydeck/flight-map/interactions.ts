import type { Map as MLMap } from "maplibre-gl";

import { rulerSummary } from "@/lib/measure";
import { pickWeather } from "../weather-layers";
import { pickAirspace } from "../route-airspace-layers";
import { applyRuler } from "./ruler";
import type { MapCtx } from "./types";

/**
 * Clicks (area drawing, ruler points, weather, airspace and aircraft picks), the hover cursor and the ruler's
 * live label that follows the cursor.
 */
export function installInteractions(ctx: MapCtx, map: MLMap): void {
  const { propsRef, rulerLabelRef } = ctx;

  map.on("click", (e) => {
    if (propsRef.current.pickMode) {
      propsRef.current.onPick?.([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    if (propsRef.current.rulerActive) {
      propsRef.current.onRulerPoint?.([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    const weatherPick = pickWeather(map, e.point);
    // Weather items sit above airspace areas, so an area is only picked when nothing else was.
    const airspacePick = weatherPick ? null : pickAirspace(map, e.point);
    if (!map.getLayer("sd-aircraft")) {
      propsRef.current.onWeatherPick?.(weatherPick?.id ?? null);
      propsRef.current.onAirspacePick?.(airspacePick);
      return;
    }
    const pad = 10;
    const feats = map.queryRenderedFeatures(
      [
        [e.point.x - pad, e.point.y - pad],
        [e.point.x + pad, e.point.y + pad],
      ],
      { layers: ["sd-aircraft"] },
    );
    const hex = feats[0]?.properties?.["hex"] as string | undefined;
    // An aircraft under the click wins; otherwise a weather item may be picked.
    propsRef.current.onWeatherPick?.(hex ? null : (weatherPick?.id ?? null));
    propsRef.current.onAirspacePick?.(hex ? null : airspacePick);
    propsRef.current.onSelect(hex ?? null);
  });

  map.on("mousemove", (e) => {
    if (propsRef.current.rulerActive) {
      map.getCanvas().style.cursor = "crosshair";
      const first =
        propsRef.current.rulerPoints?.length === 1 ? propsRef.current.rulerPoints[0] : null;
      const label = rulerLabelRef.current;
      if (first) {
        const hover: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        applyRuler(ctx, hover);
        if (label) {
          label.textContent = rulerSummary(
            [first, hover],
            propsRef.current.rulerUnits ?? "aviation",
          );
          label.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
          label.hidden = false;
        }
      } else if (label) label.hidden = true;
      return;
    }
    if (!map.getLayer("sd-aircraft")) return;
    const feats = map.queryRenderedFeatures(
      [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ],
      { layers: ["sd-aircraft"] },
    );
    map.getCanvas().style.cursor = feats.length ? "pointer" : "";
  });
}

/** Leaving the map hides the ruler's live label and drops the line that followed the cursor. */
export function installRulerMouseLeave(ctx: MapCtx, map: MLMap): void {
  const hideRulerLabel = () => {
    if (ctx.rulerLabelRef.current) ctx.rulerLabelRef.current.hidden = true;
    applyRuler(ctx);
  };
  map.getCanvas().addEventListener("mouseleave", hideRulerLabel);
}
