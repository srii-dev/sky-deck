import type { Map as MLMap, RasterDEMSourceSpecification } from "maplibre-gl";

import { TERRAIN_EXAGGERATION } from "@/lib/glide-ring";
import { terrainBeforeId } from "./common";
import { updateGlideRing } from "./glide";
import { addKindImages } from "./overlays";
import { DEM_ATTRIB, OFM_VECTOR, TERRARIUM } from "./styles";
import type { MapCtx } from "./types";

/** Buildings and terrain, added once the style has settled so they do not hold up the first aircraft. */
export function installDeferredScene(ctx: MapCtx): void {
  const map = ctx.mapRef.current;
  if (!map || !map.isStyleLoaded()) return;
  const p = ctx.propsRef.current;
  const before = terrainBeforeId(map);

  if (!map.getSource("openmaptiles")) {
    map.addSource("openmaptiles", { type: "vector", url: OFM_VECTOR });
  }
  if (!map.getLayer("sd-buildings")) {
    map.addLayer(
      {
        id: "sd-buildings",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color":
            p.basemap === "dark" ? "#2b3644" : p.basemap === "light" ? "#d9dde2" : "#c9ced6",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, 0.85],
        },
      },
      before,
    );
  }
  ctx.sceneReadyRef.current = true;
  applyTerrain(ctx);
  addKindImages(map);
  updateGlideRing(ctx);
}

/**
 * Installs the deferred scene once the map is idle after a style load (or after 3 s, whichever comes first). A newer
 * call, or `cancel`, drops a pending one.
 */
export function deferredSceneScheduler(ctx: MapCtx, map: MLMap) {
  let terrainGen = 0;
  let terrainTimer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    const gen = ++terrainGen;
    if (terrainTimer) clearTimeout(terrainTimer);
    let installed = false;
    const run = () => {
      if (installed || gen !== terrainGen) return;
      const current = ctx.mapRef.current;
      if (!current?.isStyleLoaded()) return;
      installed = true;
      if (terrainTimer) clearTimeout(terrainTimer);
      installDeferredScene(ctx);
    };
    map.once("idle", run);
    terrainTimer = setTimeout(run, 3000);
  };
  const cancel = () => {
    if (terrainTimer) clearTimeout(terrainTimer);
    terrainGen += 1;
  };
  return { schedule, cancel };
}

// The elevation sources and hill shading exist only once terrain was switched on: with it off (the default)
// the map never requests an elevation tile.
function addTerrainSources(ctx: MapCtx, map: MLMap): void {
  // 256 px tiles shown at 512 px and no finer than zoom 12: about a quarter of the requests, relief looks the same.
  const dem: RasterDEMSourceSpecification = {
    type: "raster-dem",
    tiles: [TERRARIUM],
    encoding: "terrarium",
    tileSize: 512,
    maxzoom: 12,
  };
  if (!map.getSource("sd-dem")) map.addSource("sd-dem", { ...dem, attribution: DEM_ATTRIB });
  if (!map.getSource("sd-dem-hs")) map.addSource("sd-dem-hs", dem);
  const basemap = ctx.propsRef.current.basemap;
  if (!map.getLayer("sd-hillshade") && basemap !== "satellite") {
    map.addLayer(
      {
        id: "sd-hillshade",
        type: "hillshade",
        source: "sd-dem-hs",
        paint: {
          "hillshade-exaggeration": basemap === "dark" ? 0.35 : 0.25,
          "hillshade-shadow-color": basemap === "dark" ? "#000000" : "#5a6470",
          "hillshade-highlight-color": basemap === "dark" ? "#2a3a4a" : "#ffffff",
        },
      },
      terrainBeforeId(map),
    );
  }
}

export function applyTerrain(ctx: MapCtx): void {
  const map = ctx.mapRef.current;
  if (!map || !ctx.sceneReadyRef.current) return;
  const on = ctx.propsRef.current.terrain;
  if (on) {
    addTerrainSources(ctx, map);
    map.setTerrain({ source: "sd-dem", exaggeration: TERRAIN_EXAGGERATION });
  } else if (map.getTerrain()) {
    map.setTerrain(null);
  }
  if (map.getLayer("sd-hillshade"))
    map.setLayoutProperty("sd-hillshade", "visibility", on ? "visible" : "none");
}
