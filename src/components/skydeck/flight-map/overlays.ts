import type { ExpressionSpecification, Map as MLMap } from "maplibre-gl";

import { EMERGENCY_COLOR } from "@/lib/aircraft";
import { applyAlertAreas } from "../alert-area-layers";
import { applyNight } from "../night-layers";
import { buildPlaneSdf, buildSvgSdf } from "../plane-icon";
import { LEGEND_SHAPES, svgMarkup } from "../aircraft-icons";
import { installAirportDetail } from "../airport-detail-layers";
import { applyWeather, NO_WEATHER } from "../weather-layers";
import { applyRouteAirspace, NO_ROUTE_AIRSPACE } from "../route-airspace-layers";
import { empty, terrainBeforeId } from "./common";
import { updateGlideRing } from "./glide";
import { applyRuler } from "./ruler";
import { applyTrail } from "./trail";
import type { MapCtx } from "./types";

/** Draw order: higher on top, so the selected plane and emergencies stay visible. */
const SORT_ON_TOP: ExpressionSpecification = [
  "case",
  ["get", "sel"],
  1000,
  ["get", "emg"],
  900,
  ["get", "alt"],
];

// Category icon SDFs, rasterised once per session and re-added after each style change.
type SdfImage = { width: number; height: number; data: Uint8Array };
const kindImages = new Map<string, SdfImage>();
let kindImagesLoading: Promise<void> | null = null;
function loadKindImages(): Promise<void> {
  kindImagesLoading ??= Promise.all(
    LEGEND_SHAPES.map(async (k) => {
      const img = await buildSvgSdf(svgMarkup(k));
      if (img) kindImages.set(`sd-kind-${k}`, img);
    }),
  ).then(() => undefined);
  return kindImagesLoading;
}
export function addKindImages(map: MLMap): void {
  // StrictMode cleanup calls map.remove(); adding to that instance throws or recreates a style.
  if (map._removed) return;
  for (const [id, img] of kindImages) {
    if (map._removed) return;
    try {
      if (map.hasImage(id)) continue;
      map.addImage(id, img, { sdf: true, pixelRatio: 2 });
    } catch {
      // The style was swapped or the map was removed. The next style.load adds the image.
    }
  }
}

/**
 * Adds the aircraft, trail, ruler and glide ring sources and layers, then the airport detail, alert area, night,
 * weather and route/airspace layers. Runs on every style.load, because switching basemaps replaces the whole style.
 */
export function installOverlays(ctx: MapCtx): void {
  const map = ctx.mapRef.current;
  if (!map) return;

  if (!map.hasImage("sd-plane")) {
    const img = buildPlaneSdf();
    if (img) map.addImage("sd-plane", img, { sdf: true, pixelRatio: 2 });
  }
  addKindImages(map);
  void loadKindImages().then(() => {
    const m = ctx.mapRef.current;
    if (!m || m._removed) return;
    addKindImages(m);
  });

  if (!map.getSource("sd-glide-ring"))
    map.addSource("sd-glide-ring", { type: "geojson", data: empty() });
  if (!map.getSource("sd-reach-airports"))
    map.addSource("sd-reach-airports", { type: "geojson", data: empty() });
  if (!map.getSource("sd-trail")) map.addSource("sd-trail", { type: "geojson", data: empty() });
  if (!map.getSource("sd-trail-ribbon"))
    map.addSource("sd-trail-ribbon", { type: "geojson", data: empty() });
  if (!map.getSource("sd-trail-curtain"))
    map.addSource("sd-trail-curtain", { type: "geojson", data: empty() });
  if (!map.getSource("sd-aircraft"))
    map.addSource("sd-aircraft", { type: "geojson", data: empty() });
  if (!map.getSource("sd-ruler")) map.addSource("sd-ruler", { type: "geojson", data: empty() });

  if (!map.getLayer("sd-glide-ring-fill")) {
    map.addLayer(
      {
        id: "sd-glide-ring-fill",
        type: "fill",
        source: "sd-glide-ring",
        paint: {
          "fill-color": "#f5b83d",
          "fill-opacity": 0.08,
        },
      },
      map.getLayer("sd-trail-line") ? "sd-trail-line" : undefined,
    );
  }
  if (!map.getLayer("sd-glide-ring-line")) {
    map.addLayer(
      {
        id: "sd-glide-ring-line",
        type: "line",
        source: "sd-glide-ring",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f5b83d",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
          "line-opacity": 0.7,
        },
      },
      map.getLayer("sd-trail-line") ? "sd-trail-line" : undefined,
    );
  }

  if (!map.getLayer("sd-trail-line")) {
    map.addLayer({
      id: "sd-trail-line",
      type: "line",
      source: "sd-trail",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 12, 4],
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("sd-trail-curtain")) {
    map.addLayer({
      id: "sd-trail-curtain",
      type: "fill-extrusion",
      source: "sd-trail-curtain",
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-opacity": 0.22,
      },
    });
  }
  if (!map.getLayer("sd-trail-ribbon")) {
    map.addLayer({
      id: "sd-trail-ribbon",
      type: "fill-extrusion",
      source: "sd-trail-ribbon",
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-opacity": 0.92,
      },
    });
  }

  // Ruler: a dashed line between two clicked points, above trails, below the aircraft.
  if (!map.getLayer("sd-ruler-line")) {
    map.addLayer({
      id: "sd-ruler-line",
      type: "line",
      source: "sd-ruler",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#38bdf8", "line-width": 2.5, "line-dasharray": [2, 2] },
    });
  }
  if (!map.getLayer("sd-ruler-dot")) {
    map.addLayer({
      id: "sd-ruler-dot",
      type: "circle",
      source: "sd-ruler",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#38bdf8",
        "circle-stroke-color": "#0b1220",
        "circle-stroke-width": 2,
      },
    });
  }
  applyRuler(ctx);

  // Airports inside the glide ring: above the ring and trails, below the aircraft.
  if (!map.getLayer("sd-reach-airports-dot")) {
    map.addLayer({
      id: "sd-reach-airports-dot",
      type: "circle",
      source: "sd-reach-airports",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 12, 6],
        "circle-color": "#f5b83d",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(5,10,18,0.9)",
      },
    });
  }
  if (!map.getLayer("sd-reach-airports-label")) {
    map.addLayer({
      id: "sd-reach-airports-label",
      type: "symbol",
      source: "sd-reach-airports",
      layout: {
        "text-field": ["coalesce", ["get", "iata"], ""],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 0.9],
        "text-anchor": "top",
        "text-optional": true,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#f5b83d",
        "text-halo-color": "rgba(5,10,18,0.9)",
        "text-halo-width": 1.4,
      },
    });
  }

  if (!map.getLayer("sd-selected-ring")) {
    map.addLayer({
      id: "sd-selected-ring",
      type: "circle",
      source: "sd-aircraft",
      filter: ["==", ["get", "sel"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 14, 12, 26],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f5b83d",
        "circle-pitch-alignment": "map",
      },
    });
  }

  if (!map.getLayer("sd-aircraft")) {
    map.addLayer({
      id: "sd-aircraft",
      type: "symbol",
      source: "sd-aircraft",
      layout: {
        // Category icon when known and loaded; otherwise the generic plane.
        "icon-image": [
          "coalesce",
          ["image", ["concat", "sd-kind-", ["get", "shape"]]],
          ["image", "sd-plane"],
        ],
        "icon-rotate": ["get", "track"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": SORT_ON_TOP,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          ["case", ["get", "sel"], 0.55, 0.32],
          8,
          ["case", ["get", "sel"], 0.85, 0.55],
          13,
          ["case", ["get", "sel"], 1.25, 0.9],
        ],
      },
      paint: {
        "icon-color": ["get", "color"],
        "icon-halo-color": ["case", ["get", "sel"], "#f5b83d", "rgba(5,10,18,0.85)"],
        "icon-halo-width": ["case", ["get", "sel"], 0.8, 1],
        "icon-opacity": ["coalesce", ["get", "fade"], 1],
      },
    });
  }

  if (!map.getLayer("sd-aircraft-label")) {
    map.addLayer({
      id: "sd-aircraft-label",
      type: "symbol",
      source: "sd-aircraft",
      minzoom: 8.5,
      layout: {
        "text-field": ["coalesce", ["get", "cs"], ""],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.7],
        "text-anchor": "top",
        "text-optional": true,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["case", ["get", "emg"], EMERGENCY_COLOR, "#dbe7f0"],
        "text-halo-color": "rgba(5,10,18,0.9)",
        "text-halo-width": 1.4,
        "text-opacity": ["coalesce", ["get", "fade"], 1],
      },
    });
  }

  // Aprons, taxiway names and gates at high zoom (Phase 4e), below trails and aircraft.
  installAirportDetail(map, ctx.propsRef.current.basemap, terrainBeforeId(map));
  applyAlertAreas(map, ctx.propsRef.current.alertAreas ?? [], terrainBeforeId(map));
  applyNight(map, !!ctx.propsRef.current.nightShade, new Date(), terrainBeforeId(map));
  // Radar, echo tops, advisories and pilot reports (Phase 7), below trails and aircraft.
  applyWeather(map, ctx.propsRef.current.weather ?? NO_WEATHER, terrainBeforeId(map));
  applyRouteAirspace(
    map,
    ctx.propsRef.current.routeAirspace ?? NO_ROUTE_AIRSPACE,
    terrainBeforeId(map),
  );
  applyTrail(ctx);
  updateGlideRing(ctx);
  ctx.styleReadyRef.current = true;
}
