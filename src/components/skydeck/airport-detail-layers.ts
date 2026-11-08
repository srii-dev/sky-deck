import type { LayerSpecification, Map as MLMap } from "maplibre-gl";

import type { Basemap } from "./map-config";

/*
 * Airport map detail (Phase 4e): aprons, taxiway names and gate numbers at high zoom.
 *
 * Checked on 2026-11-08 against the OpenFreeMap vector tiles (tilejson and real z14 tiles for KJFK, KSFO,
 * EGLL, KBOS and KPAO): the `aeroway` layer (zoom 10 to 14, overzoomed beyond) holds runway, taxiway
 * (about two thirds with a `ref` such as "B"), apron, aerodrome and gate (points with a `ref` such as "B27").
 * The Dark and Light styles already draw runways and taxiways but not aprons, taxiway names or gates, so
 * those are added here. The Satellite style has no vector layers, so it gets the same overlays on top of the
 * imagery. There is no terminal class in the tiles: terminal buildings are ordinary `building` features,
 * which the 3D buildings layer already shows.
 *
 * These layers read the shared `openmaptiles` source and are added by installAirportDetail, which the map
 * calls whenever a style (re)loads, because switching the basemap replaces the whole style.
 */

const SOURCE = "openmaptiles";
const FONT = ["Noto Sans Regular"];

export const AIRPORT_DETAIL_LAYER_IDS = [
  "sd-apt-apron-fill",
  "sd-apt-apron-outline",
  "sd-apt-taxiway-ref",
  "sd-apt-gate-dot",
  "sd-apt-gate-label",
] as const;

const isClass = (name: string) => ["==", ["get", "class"], name] as never;

export function airportDetailLayers(basemap: Basemap): LayerSpecification[] {
  const dark = basemap === "dark";
  const light = basemap === "light";
  const apron = dark ? "#2a3644" : light ? "#d9dce2" : "#ffffff";
  const apronOpacity = dark ? 0.8 : light ? 0.85 : 0.1;
  const outline = dark ? "#3b4a5c" : light ? "#b8bec8" : "rgba(255,255,255,0.35)";
  return [
    {
      id: "sd-apt-apron-fill",
      type: "fill",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 12,
      filter: isClass("apron"),
      paint: {
        "fill-color": apron,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13.5, apronOpacity],
      },
    },
    {
      id: "sd-apt-apron-outline",
      type: "line",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 14,
      filter: isClass("apron"),
      paint: { "line-color": outline, "line-width": 1 },
    },
    {
      id: "sd-apt-taxiway-ref",
      type: "symbol",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 15,
      filter: ["all", isClass("taxiway"), ["has", "ref"]] as never,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 350,
        "text-field": ["get", "ref"],
        "text-font": FONT,
        "text-size": 11,
        "text-keep-upright": true,
      },
      paint: {
        // Yellow like the taxiway signs on the ground, with a dark outline so it reads on any basemap.
        "text-color": "#f5d34a",
        "text-halo-color": "rgba(5,10,18,0.95)",
        "text-halo-width": 1.6,
      },
    },
    {
      id: "sd-apt-gate-dot",
      type: "circle",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 15.5,
      filter: isClass("gate"),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15.5, 2, 19, 4.5],
        "circle-color": "#38bdf8",
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(5,10,18,0.9)",
      },
    },
    {
      id: "sd-apt-gate-label",
      type: "symbol",
      source: SOURCE,
      "source-layer": "aeroway",
      minzoom: 16.5,
      filter: ["all", isClass("gate"), ["has", "ref"]] as never,
      layout: {
        "text-field": ["get", "ref"],
        "text-font": FONT,
        "text-size": 10,
        "text-offset": [0, 0.9],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": "#bae6fd",
        "text-halo-color": "rgba(5,10,18,0.95)",
        "text-halo-width": 1.4,
      },
    },
  ];
}

/**
 * Adds the airport detail layers that are missing, below `before` (so below trails and aircraft). Safe to
 * call again after every style load. Does nothing if the vector source is not in the style.
 */
export function installAirportDetail(map: MLMap, basemap: Basemap, before?: string): void {
  if (map._removed || !map.getSource(SOURCE)) return;
  for (const layer of airportDetailLayers(basemap)) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  }
}
