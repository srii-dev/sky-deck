import type { GeoJSONSource, LayerSpecification, Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

import { RADAR_MAX_ZOOM } from "@/lib/radar";
import { hazardColor, SEVERITY_COLORS, type Advisory, type Pirep } from "@/lib/weather-advisories";

/*
 * Weather map layers (Phase 7): precipitation radar, echo tops, SIGMET/AIRMET polygons and pilot reports.
 *
 * Like every overlay these are removed by a basemap switch, so applyWeather is called again from the map's
 * style.load handler as well as whenever the wanted state changes. It adds what is wanted, updates what exists
 * and removes what is not wanted, so calling it twice with the same state changes nothing.
 *
 * Radar: RainViewer raster tiles (one source whose tile list is swapped to show another frame).
 * Echo tops: the Iowa Environmental Mesonet NEXRAD echo-top WMS layer `nexrad-eet-900913-conus` (US only, current
 * frame only; checked 2026-11-08: the capabilities list it and a GetMap request returned a PNG with CORS open).
 */

export interface WeatherMapState {
  /** Tile URL template for the chosen radar frame, or null when radar is off. */
  radarUrl: string | null;
  radarOpacity: number;
  echoTops: boolean;
  advisories: Advisory[] | null;
  pireps: Pirep[] | null;
}

export const NO_WEATHER: WeatherMapState = {
  radarUrl: null,
  radarOpacity: 0.7,
  echoTops: false,
  advisories: null,
  pireps: null,
};

export const ECHO_TOPS_URL =
  "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/eet.cgi?service=WMS&version=1.1.1&request=GetMap" +
  "&layers=nexrad-eet-900913-conus&styles=&srs=EPSG:3857&format=image/png&transparent=true" +
  "&width=256&height=256&bbox={bbox-epsg-3857}";

export const WEATHER_IDS = {
  radarSource: "sd-radar",
  radarLayer: "sd-radar",
  echoSource: "sd-echotops",
  echoLayer: "sd-echotops",
  advisorySource: "sd-advisories",
  advisoryFill: "sd-advisory-fill",
  advisoryLine: "sd-advisory-line",
  pirepSource: "sd-pireps",
  pirepLayer: "sd-pirep",
} as const;

/** Layers that answer a click with a card. */
export const PICKABLE_WEATHER_LAYERS = [WEATHER_IDS.pirepLayer, WEATHER_IDS.advisoryFill] as const;

export function advisoryCollection(list: readonly Advisory[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = list.map((a) => ({
    type: "Feature",
    properties: { id: a.id, color: hazardColor(a.hazard) },
    geometry: { type: "Polygon", coordinates: [a.ring] },
  }));
  return { type: "FeatureCollection", features };
}

export function pirepCollection(list: readonly Pirep[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = list.map((p) => ({
    type: "Feature",
    properties: { id: p.id, color: SEVERITY_COLORS[p.severity] },
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
  }));
  return { type: "FeatureCollection", features };
}

const advisoryFill = (): LayerSpecification => ({
  id: WEATHER_IDS.advisoryFill,
  type: "fill",
  source: WEATHER_IDS.advisorySource,
  paint: { "fill-color": ["get", "color"], "fill-opacity": 0.16 },
});
const advisoryLine = (): LayerSpecification => ({
  id: WEATHER_IDS.advisoryLine,
  type: "line",
  source: WEATHER_IDS.advisorySource,
  paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.85 },
});
const pirepLayer = (): LayerSpecification => ({
  id: WEATHER_IDS.pirepLayer,
  type: "circle",
  source: WEATHER_IDS.pirepSource,
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 9, 6],
    "circle-color": ["get", "color"],
    "circle-stroke-width": 1,
    "circle-stroke-color": "rgba(5,10,18,0.9)",
    "circle-opacity": 0.95,
  },
});

function removeLayerAndSource(map: MLMap, layers: string[], source: string) {
  for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(source)) map.removeSource(source);
}

function setGeoJson(map: MLMap, source: string, data: FeatureCollection) {
  (map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
}

/**
 * Make the map match `state`. `before` is the layer the weather goes under (so it stays below trails and
 * aircraft). Safe to call repeatedly and after every style load.
 */
export function applyWeather(map: MLMap, state: WeatherMapState, before?: string): void {
  if (map._removed) return;
  const beforeId = before && map.getLayer(before) ? before : undefined;
  const ids = WEATHER_IDS;

  // Radar
  if (state.radarUrl) {
    const url = state.radarUrl;
    const src = map.getSource(ids.radarSource) as
      | (ReturnType<MLMap["getSource"]> & { tiles?: string[]; setTiles?: (t: string[]) => void })
      | undefined;
    if (!src) {
      map.addSource(ids.radarSource, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        maxzoom: RADAR_MAX_ZOOM,
      });
    } else if (src.tiles?.[0] !== url) {
      src.setTiles?.([url]);
    }
    if (!map.getLayer(ids.radarLayer)) {
      map.addLayer(
        {
          id: ids.radarLayer,
          type: "raster",
          source: ids.radarSource,
          paint: { "raster-opacity": state.radarOpacity, "raster-fade-duration": 0 },
        },
        beforeId,
      );
    } else {
      map.setPaintProperty(ids.radarLayer, "raster-opacity", state.radarOpacity);
    }
  } else {
    removeLayerAndSource(map, [ids.radarLayer], ids.radarSource);
  }

  // Echo tops
  if (state.echoTops) {
    if (!map.getSource(ids.echoSource)) {
      map.addSource(ids.echoSource, { type: "raster", tiles: [ECHO_TOPS_URL], tileSize: 256 });
    }
    if (!map.getLayer(ids.echoLayer)) {
      map.addLayer(
        {
          id: ids.echoLayer,
          type: "raster",
          source: ids.echoSource,
          paint: { "raster-opacity": 0.7, "raster-fade-duration": 0 },
        },
        beforeId,
      );
    }
  } else {
    removeLayerAndSource(map, [ids.echoLayer], ids.echoSource);
  }

  // SIGMET and AIRMET polygons
  if (state.advisories) {
    const data = advisoryCollection(state.advisories);
    if (!map.getSource(ids.advisorySource)) {
      map.addSource(ids.advisorySource, { type: "geojson", data });
    } else {
      setGeoJson(map, ids.advisorySource, data);
    }
    if (!map.getLayer(ids.advisoryFill)) map.addLayer(advisoryFill(), beforeId);
    if (!map.getLayer(ids.advisoryLine)) map.addLayer(advisoryLine(), beforeId);
  } else {
    removeLayerAndSource(map, [ids.advisoryFill, ids.advisoryLine], ids.advisorySource);
  }

  // Pilot reports
  if (state.pireps) {
    const data = pirepCollection(state.pireps);
    if (!map.getSource(ids.pirepSource)) {
      map.addSource(ids.pirepSource, { type: "geojson", data });
    } else {
      setGeoJson(map, ids.pirepSource, data);
    }
    if (!map.getLayer(ids.pirepLayer)) map.addLayer(pirepLayer(), beforeId);
  } else {
    removeLayerAndSource(map, [ids.pirepLayer], ids.pirepSource);
  }
}

export interface WeatherPick {
  /** Advisory or PIREP id. */
  id: string;
}

/** The weather item under a click, if any (PIREP dots win over polygons). */
export function pickWeather(map: MLMap, point: { x: number; y: number }): WeatherPick | null {
  const layers = PICKABLE_WEATHER_LAYERS.filter((id) => map.getLayer(id));
  if (layers.length === 0) return null;
  const pad = 8;
  const feats = map.queryRenderedFeatures(
    [
      [point.x - pad, point.y - pad],
      [point.x + pad, point.y + pad],
    ],
    { layers: [...layers] },
  );
  const id = feats[0]?.properties?.["id"];
  return typeof id === "string" ? { id } : null;
}
