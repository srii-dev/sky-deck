import type { Map as MLMap, StyleSpecification } from "maplibre-gl";

import { serverFlags } from "@/lib/flags";
import type { Basemap } from "../map-config";
import type { MapCtx } from "./types";

export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const OFM_VECTOR = "https://tiles.openfreemap.org/planet";
export const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const DEM_ATTRIB = "Terrain: Mapzen / AWS Terrain Tiles";

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    sat: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community",
    },
    openmaptiles: { type: "vector", url: OFM_VECTOR },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }],
};

export function styleFor(b: Basemap): string | StyleSpecification {
  // Never reached with the flag off (callers fall back first); this keeps Esri unrequested even so.
  if (b === "satellite" && serverFlags().satellite) return SATELLITE_STYLE;
  if (b === "light") return "https://tiles.openfreemap.org/styles/positron";
  return "https://tiles.openfreemap.org/styles/dark";
}

/**
 * A plain background in the basemap's colours, used when the basemap style cannot be fetched (OpenFreeMap down, or a
 * network that blocks it). Without any loaded style MapLibre draws nothing and runs no camera moves, so no aircraft
 * would show and flying to a saved view, a search result or an airport would do nothing.
 */
export function fallbackStyle(b: Basemap): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {},
    layers: [
      {
        id: "sd-fallback-background",
        type: "background",
        paint: { "background-color": b === "light" ? "#e9ecef" : "#0b1018" },
      },
    ],
  };
}

/**
 * The basemap style could not be fetched: keep the tracker working on a plain background. Only the style's own
 * address counts (a failed tile, font or weather image is not a reason); the next basemap change tries again.
 */
export function installStyleFallback(ctx: MapCtx, map: MLMap): void {
  map.on("error", (e) => {
    const url = (e.error as { url?: unknown } | undefined)?.url;
    const basemap = ctx.propsRef.current.basemap;
    const wanted = styleFor(basemap);
    if (typeof wanted !== "string" || url !== wanted) return;
    console.warn(`[map] basemap style unavailable (${url}); using a plain background`);
    ctx.styleReadyRef.current = false;
    ctx.sceneReadyRef.current = false;
    map.setStyle(fallbackStyle(basemap), { diff: false });
  });
}
