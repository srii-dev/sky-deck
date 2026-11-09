import { useEffect, useRef } from "react";
import {
  Map as MLMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection, Feature, Point, LineString, Polygon } from "geojson";

import { altitudeColor, EMERGENCY_COLOR, isEmergency, type Aircraft } from "@/lib/aircraft";
import { keepUprightWithoutHeading } from "@/lib/aircraft-kind";
import {
  buildRingPolygon,
  clampGlideRatio,
  computeAGL,
  ELEV_UNAVAILABLE_GENERIC,
  ELEV_UNAVAILABLE_TERRAIN_OFF,
  glideRatioBounds,
  isElevationCacheValid,
  rangeNm,
  TERRAIN_EXAGGERATION,
  type ElevationCacheEntry,
} from "@/lib/glide-ring";
import { currentAirportList, isLargeLoaded, loadLargeAirports } from "@/lib/airport-list";
import {
  REACHABLE_LIMIT,
  reachableAirports,
  reachableAirportsGeoJSON,
} from "@/lib/reachable-airports";
import { parseShareParams } from "@/lib/share-link";
import { buildPlaneSdf, buildSvgSdf } from "./plane-icon";
import { LEGEND_KINDS, svgMarkup } from "./aircraft-icons";
import { installAirportDetail } from "./airport-detail-layers";
import { applyWeather, NO_WEATHER, pickWeather, type WeatherMapState } from "./weather-layers";
import {
  applyRouteAirspace,
  NO_ROUTE_AIRSPACE,
  pickAirspace,
  type RouteAirspaceState,
} from "./route-airspace-layers";
import {
  appendSample,
  initialDelay,
  missingOpacity,
  motionAt,
  observeUpdate,
  median,
  stepDelay,
  type DelayState,
  type MotionSample,
  type MotionState,
} from "@/lib/smooth-motion";
import {
  DEFAULT_VIEW,
  type Basemap,
  type FlyTarget,
  type TrailPoint,
  type Viewport,
} from "./map-config";

setWorkerUrl(workerUrl);

const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const OFM_VECTOR = "https://tiles.openfreemap.org/planet";
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DEM_ATTRIB = "Terrain: Mapzen / AWS Terrain Tiles";

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

function styleFor(b: Basemap): string | StyleSpecification {
  if (b === "satellite") return SATELLITE_STYLE;
  if (b === "light") return "https://tiles.openfreemap.org/styles/positron";
  return "https://tiles.openfreemap.org/styles/dark";
}

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const M_PER_DEG = 111320;
const FRAME_MS = 90;

/*
 * Aircraft motion (Phase 20). Each aircraft keeps its recent position reports as samples with their true
 * times. The map draws the world `delay` milliseconds in the past, so a drawn position is interpolated between
 * two real reports and not guessed. See src/lib/smooth-motion.ts for the rules (delay, gaps, dead reckoning).
 */
interface Track {
  /** Latest data for this aircraft (labels, colour source, panel). */
  a: Aircraft;
  samples: readonly MotionSample[];
  color: string;
  emg: boolean;
  /** Missing from the data (not just filtered out): kept for a while, then faded and removed. */
  ghost: boolean;
}

function toSample(a: Aircraft, receivedAt: number): MotionSample {
  return {
    t: receivedAt - a.seenPos * 1000,
    lat: a.lat,
    lon: a.lon,
    altFt: a.altFt,
    track: a.track,
    gs: a.gs,
    vRate: a.vRate,
    onGround: a.onGround,
  };
}

/** Where a track is drawn at time T (the delayed clock). */
function trackState(tr: Track, T: number): MotionState {
  return (
    motionAt(tr.samples, T) ?? {
      lat: tr.a.lat,
      lon: tr.a.lon,
      altFt: tr.a.altFt,
      track: tr.a.track,
      gs: tr.a.gs,
      vRate: tr.a.vRate,
      onGround: tr.a.onGround,
      phase: "stale",
      beyondNewestMs: 0,
    }
  );
}

function renderPos(tr: Track, T: number): [number, number] {
  const m = trackState(tr, T);
  return [m.lat, m.lon];
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Category icon SDFs, rasterised once per session and re-added after each style change.
type SdfImage = { width: number; height: number; data: Uint8Array };
const kindImages = new Map<string, SdfImage>();
let kindImagesLoading: Promise<void> | null = null;
function loadKindImages(): Promise<void> {
  kindImagesLoading ??= Promise.all(
    LEGEND_KINDS.map(async (k) => {
      const img = await buildSvgSdf(svgMarkup(k));
      if (img) kindImages.set(`sd-kind-${k}`, img);
    }),
  ).then(() => undefined);
  return kindImagesLoading;
}
function addKindImages(map: MLMap) {
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

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

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

function trailFeatures(trail: TrailPoint[]) {
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

export interface GlideStatus {
  aglFt: number | null;
  rangeNm: number | null;
  elevationAvailable: boolean;
  reason?: string;
}

export interface FlightMapProps {
  aircraft: Aircraft[];
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
  trail: TrailPoint[];
  trail3d: boolean;
  basemap: Basemap;
  terrain: boolean;
  follow: boolean;
  flyTarget: FlyTarget | null;
  onViewportChange: (v: Viewport) => void;
  glideRing?: boolean | undefined;
  glideRatio?: number | null | undefined;
  onGlideStatus?: ((status: GlideStatus) => void) | undefined;
  /** Draw the selected aircraft's trail (default on). */
  showTrail?: boolean | undefined;
  /** Ruler: while active, a map click adds a point instead of selecting an aircraft. */
  rulerActive?: boolean | undefined;
  rulerPoints?: [number, number][] | undefined;
  onRulerPoint?: ((point: [number, number]) => void) | undefined;
  /** When the aircraft data arrived (ms, Date.now()). Sample times are measured from it. */
  receivedAt?: number | null | undefined;
  /** Every aircraft in the data, before filters. One missing from here (not just filtered out) fades out. */
  presentHexes?: ReadonlySet<string> | undefined;
  /** Smooth (about 10 s behind, no guessing) or Live (shorter delay, more guessing). Default smooth. */
  smoothMotion?: boolean | undefined;
  /** The delay in use, in whole seconds, when it changes. */
  onMotionDelay?: ((seconds: number) => void) | undefined;
  /** The selected aircraft at the drawn moment, about once a second, so the panel can match the icon. */
  onSelectedMotion?: ((hex: string, m: MotionState) => void) | undefined;
  /** Weather layers to draw (radar, echo tops, advisories, pilot reports). */
  weather?: WeatherMapState | undefined;
  /** A click on a weather item (its id), or null when the click hit none. */
  onWeatherPick?: ((id: string | null) => void) | undefined;
  /** The route line and airspace areas to draw (Phase 8). */
  routeAirspace?: RouteAirspaceState | undefined;
  /** A click on an airspace area (its id), or null when the click hit none. */
  onAirspacePick?: ((id: string | null) => void) | undefined;
}

export default function FlightMap(props: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const tracksRef = useRef(new Map<string, Track>());
  const delayRef = useRef<DelayState>(initialDelay("smooth"));
  const lastReceivedRef = useRef<number | null>(null);
  const lastDelaySecRef = useRef<number | null>(null);
  const elevCacheRef = useRef<Map<string, ElevationCacheEntry>>(new Map());
  const lastGlideStatusRef = useRef<GlideStatus | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const styleReadyRef = useRef(false);
  const firstStyleRef = useRef(true);

  // ---------- overlay installation (re-run after every style change) ----------
  const installOverlays = () => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.hasImage("sd-plane")) {
      const img = buildPlaneSdf();
      if (img) map.addImage("sd-plane", img, { sdf: true, pixelRatio: 2 });
    }
    addKindImages(map);
    void loadKindImages().then(() => {
      const m = mapRef.current;
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
    applyRuler();

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
            ["image", ["concat", "sd-kind-", ["get", "kind"]]],
            ["image", "sd-plane"],
          ],
          "icon-rotate": ["get", "track"],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["case", ["get", "sel"], 1000, ["get", "emg"], 900, ["get", "alt"]],
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
    installAirportDetail(map, propsRef.current.basemap, terrainBeforeId(map));
    // Radar, echo tops, advisories and pilot reports (Phase 7), below trails and aircraft.
    applyWeather(map, propsRef.current.weather ?? NO_WEATHER, terrainBeforeId(map));
    applyRouteAirspace(
      map,
      propsRef.current.routeAirspace ?? NO_ROUTE_AIRSPACE,
      terrainBeforeId(map),
    );
    applyTrail();
    updateGlideRing();
    styleReadyRef.current = true;
  };

  // Below basemap labels when those sit under the trails, and always below trails and aircraft.
  const terrainBeforeId = (map: MLMap): string | undefined => {
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
  };

  const installDeferredScene = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const p = propsRef.current;
    const before = terrainBeforeId(map);

    if (!map.getSource("sd-dem")) {
      map.addSource("sd-dem", {
        type: "raster-dem",
        tiles: [TERRARIUM],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: DEM_ATTRIB,
      });
    }
    if (!map.getSource("sd-dem-hs")) {
      map.addSource("sd-dem-hs", {
        type: "raster-dem",
        tiles: [TERRARIUM],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
      });
    }
    if (!map.getLayer("sd-hillshade") && p.basemap !== "satellite") {
      map.addLayer(
        {
          id: "sd-hillshade",
          type: "hillshade",
          source: "sd-dem-hs",
          paint: {
            "hillshade-exaggeration": p.basemap === "dark" ? 0.35 : 0.25,
            "hillshade-shadow-color": p.basemap === "dark" ? "#000000" : "#5a6470",
            "hillshade-highlight-color": p.basemap === "dark" ? "#2a3a4a" : "#ffffff",
          },
        },
        before,
      );
    }
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
    applyTerrain();
    addKindImages(map);
    updateGlideRing();
  };

  const applyTerrain = () => {
    const map = mapRef.current;
    if (!map || !map.getSource("sd-dem")) return;
    if (propsRef.current.terrain)
      map.setTerrain({ source: "sd-dem", exaggeration: TERRAIN_EXAGGERATION });
    else map.setTerrain(null);
  };

  const applyRuler = () => {
    const map = mapRef.current;
    const src = map?.getSource("sd-ruler") as GeoJSONSource | undefined;
    if (!src) return;
    const pts = propsRef.current.rulerPoints ?? [];
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
  };

  const applyTrail = () => {
    const map = mapRef.current;
    if (!map) return;
    const { trail, trail3d, selectedHex, showTrail } = propsRef.current;
    // The trail stops at the drawn moment (the icon is a few seconds behind the newest data) and joins the icon.
    const drawT = Date.now() - delayRef.current.delayMs;
    const pts =
      selectedHex && showTrail !== false ? trail.filter((p) => (p.st ?? p.t) <= drawT) : [];
    const tr = selectedHex ? tracksRef.current.get(selectedHex) : undefined;
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
  };

  const emitGlideStatus = (status: GlideStatus) => {
    const prev = lastGlideStatusRef.current;
    if (
      prev &&
      prev.aglFt === status.aglFt &&
      prev.rangeNm === status.rangeNm &&
      prev.elevationAvailable === status.elevationAvailable &&
      prev.reason === status.reason
    ) {
      return;
    }
    lastGlideStatusRef.current = status;
    propsRef.current.onGlideStatus?.(status);
  };

  // Refreshes the ring, then the airport markers that depend on the ring's range.
  const updateGlideRing = () => {
    drawGlideRing();
    updateReachMarkers();
  };

  // Markers for the airports inside the ring: the same set the panel lists. Cleared whenever
  // the ring is off or has no usable range.
  const updateReachMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("sd-reach-airports") as GeoJSONSource | undefined;
    if (!src) return;
    const p = propsRef.current;
    const status = lastGlideStatusRef.current;
    const ac = p.selectedHex ? p.aircraft.find((a) => a.hex === p.selectedHex) : undefined;
    // The dev mock path draws its ring without publishing a status, so skip it here.
    const isMock = import.meta.env.DEV && !!ac?.hex.startsWith("mock-");
    if (!p.glideRing || !ac || isMock || !status?.elevationAvailable || status.rangeNm == null) {
      src.setData(empty());
      return;
    }
    if (!isLargeLoaded()) {
      // Show the short list now; redraw with the larger list as soon as it has loaded.
      loadLargeAirports()
        .then(() => {
          const m = mapRef.current;
          if (m && !m._removed) updateReachMarkers();
        })
        .catch(() => {});
    }
    src.setData(
      reachableAirportsGeoJSON(
        reachableAirports(ac.lat, ac.lon, status.rangeNm, REACHABLE_LIMIT, currentAirportList()),
      ),
    );
  };

  const drawGlideRing = () => {
    const map = mapRef.current;
    if (!map) return;
    const p = propsRef.current;
    const src = map.getSource("sd-glide-ring") as GeoJSONSource | undefined;
    if (!src) return;

    const selectedHex = p.selectedHex;
    const activeAircraft = selectedHex ? p.aircraft.find((a) => a.hex === selectedHex) : undefined;

    if (!p.glideRing || !activeAircraft) {
      src.setData(empty());
      emitGlideStatus({ aglFt: null, rangeNm: null, elevationAvailable: false });
      return;
    }

    if (import.meta.env.DEV && activeAircraft.hex.startsWith("mock-")) {
      const mbounds = glideRatioBounds(activeAircraft.kind);
      if (!mbounds || !p.terrain) {
        src.setData(empty());
        return;
      }
      const effectiveRatio = clampGlideRatio(
        p.glideRatio ?? mbounds.defaultRatio,
        activeAircraft.kind,
      );
      const range = rangeNm(activeAircraft.altFt ?? 0, effectiveRatio);
      const polygon = buildRingPolygon(activeAircraft.lat, activeAircraft.lon, range);
      src.setData(polygon);
      return;
    }

    const bounds = glideRatioBounds(activeAircraft.kind);
    if (!bounds) {
      src.setData(empty());
      emitGlideStatus({
        aglFt: null,
        rangeNm: null,
        elevationAvailable: false,
        reason: "No glide ratio for category",
      });
      return;
    }

    if (activeAircraft.onGround || activeAircraft.altFt == null) {
      src.setData(empty());
      emitGlideStatus({
        aglFt: null,
        rangeNm: null,
        elevationAvailable: false,
        reason: "Aircraft on ground",
      });
      return;
    }

    if (!p.terrain) {
      src.setData(empty());
      emitGlideStatus({
        aglFt: null,
        rangeNm: null,
        elevationAvailable: false,
        reason: ELEV_UNAVAILABLE_TERRAIN_OFF,
      });
      return;
    }

    let rawElevM: number | null = null;
    try {
      rawElevM = map.queryTerrainElevation([activeAircraft.lon, activeAircraft.lat]);
    } catch {
      rawElevM = null;
    }

    const now = Date.now();
    if (rawElevM != null) {
      elevCacheRef.current.set(activeAircraft.hex, {
        elevM: rawElevM,
        lat: activeAircraft.lat,
        lon: activeAircraft.lon,
        sampledAt: now,
      });
    } else {
      const cached = elevCacheRef.current.get(activeAircraft.hex);
      if (isElevationCacheValid(cached, activeAircraft.lat, activeAircraft.lon, now)) {
        rawElevM = cached!.elevM;
      }
    }

    if (rawElevM == null) {
      src.setData(empty());
      emitGlideStatus({
        aglFt: null,
        rangeNm: null,
        elevationAvailable: false,
        reason: ELEV_UNAVAILABLE_GENERIC,
      });
      return;
    }

    const aglFt = computeAGL(activeAircraft.altFt, activeAircraft.onGround, rawElevM);
    if (aglFt == null || aglFt <= 0) {
      src.setData(empty());
      emitGlideStatus({
        aglFt: null,
        rangeNm: null,
        elevationAvailable: false,
      });
      return;
    }

    const effectiveRatio = clampGlideRatio(
      p.glideRatio ?? bounds.defaultRatio,
      activeAircraft.kind,
    );
    const range = rangeNm(aglFt, effectiveRatio);
    const polygon = buildRingPolygon(activeAircraft.lat, activeAircraft.lon, range);
    src.setData(polygon);
    emitGlideStatus({
      aglFt,
      rangeNm: range,
      elevationAvailable: true,
    });
  };

  // ---------- map init ----------
  useEffect(() => {
    if (!containerRef.current) return;
    let initial = DEFAULT_VIEW;
    try {
      const saved = localStorage.getItem("skydeck:view");
      if (saved) initial = { ...DEFAULT_VIEW, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    // A shared link wins over the view remembered in this browser.
    const shared = parseShareParams(window.location.search);
    if (shared.lat !== undefined && shared.lon !== undefined) {
      initial = {
        ...initial,
        lat: shared.lat,
        lon: shared.lon,
        zoom: shared.zoom ?? initial.zoom,
        pitch: shared.pitch ?? initial.pitch,
        bearing: shared.bearing ?? initial.bearing,
      };
    }

    const map = new MLMap({
      container: containerRef.current,
      style: styleFor(propsRef.current.basemap),
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: initial.bearing,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __skydeckMap?: MLMap }).__skydeckMap = map;
    map.addControl(
      new NavigationControl({ visualizePitch: true, showCompass: true }),
      "bottom-right",
    );
    map.addControl(new ScaleControl({ unit: "nautical" }), "bottom-right");

    let terrainGen = 0;
    let terrainTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDeferredScene = () => {
      const gen = ++terrainGen;
      if (terrainTimer) clearTimeout(terrainTimer);
      let installed = false;
      const run = () => {
        if (installed || gen !== terrainGen) return;
        const current = mapRef.current;
        if (!current?.isStyleLoaded()) return;
        installed = true;
        if (terrainTimer) clearTimeout(terrainTimer);
        installDeferredScene();
      };
      map.once("idle", run);
      terrainTimer = setTimeout(run, 3000);
    };

    map.on("style.load", () => {
      styleReadyRef.current = false;
      installOverlays();
      scheduleDeferredScene();
    });

    const emitViewport = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      const r = Math.max(
        haversineNm(c.lat, c.lng, ne.lat, ne.lng),
        haversineNm(c.lat, c.lng, sw.lat, sw.lng),
      );
      propsRef.current.onViewportChange({
        lat: c.lat,
        lon: ((((c.lng + 180) % 360) + 360) % 360) - 180,
        radiusNm: Math.max(5, Math.min(250, r)),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        bounds: { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng },
      });
      try {
        localStorage.setItem(
          "skydeck:view",
          JSON.stringify({
            lat: c.lat,
            lon: c.lng,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
          }),
        );
      } catch {
        /* ignore */
      }
    };
    map.on("moveend", emitViewport);
    // Fetch immediately; don't wait for every terrain tile ("load") to arrive.
    emitViewport();

    map.on("click", (e) => {
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

    // ---------- animation loop ----------
    let raf = 0;
    let last = 0;
    let lastTickWall = 0;
    let lastSelectedEmit = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS || !styleReadyRef.current) return;
      last = ts;
      const src = map.getSource("sd-aircraft") as GeoJSONSource | undefined;
      if (!src) return;
      const wall = Date.now();
      const elapsed = lastTickWall ? wall - lastTickWall : 0;
      lastTickWall = wall;
      const mode = propsRef.current.smoothMotion === false ? "live" : "smooth";
      delayRef.current = stepDelay(delayRef.current, mode, elapsed);
      const drawT = wall - delayRef.current.delayMs;
      const sec = Math.round(delayRef.current.delayMs / 1000);
      if (sec !== lastDelaySecRef.current) {
        lastDelaySecRef.current = sec;
        propsRef.current.onMotionDelay?.(sec);
      }
      const sel = propsRef.current.selectedHex;
      const features: Feature<Point>[] = [];
      let selPos: [number, number] | null = null;
      for (const [hex, tr] of tracksRef.current) {
        let fade = 1;
        if (tr.ghost) {
          const last = tr.samples[tr.samples.length - 1];
          const o = last ? missingOpacity(wall - last.t) : null;
          if (o == null) {
            tracksRef.current.delete(hex);
            continue;
          }
          fade = o;
        }
        const m = trackState(tr, drawT);
        // No new report for longer than dead reckoning is trusted: the aircraft is held and drawn dimmer.
        if (m.phase === "stale") fade = Math.min(fade, 0.55);
        const lat = m.lat;
        const lon = m.lon;
        const isSel = hex === sel;
        if (isSel) {
          selPos = [lat, lon];
          if (wall - lastSelectedEmit >= 1000) {
            lastSelectedEmit = wall;
            propsRef.current.onSelectedMotion?.(hex, m);
            if (propsRef.current.showTrail !== false) applyTrail();
          }
        }
        features.push({
          type: "Feature",
          properties: {
            hex,
            cs: tr.a.callsign,
            kind: tr.a.kind,
            track: m.track == null && keepUprightWithoutHeading(tr.a.kind) ? 0 : (m.track ?? 0),
            color: tr.emg ? EMERGENCY_COLOR : tr.color,
            alt: m.altFt ?? 0,
            fade,
            sel: isSel,
            emg: tr.emg,
          },
          geometry: { type: "Point", coordinates: [lon, lat] },
        });
      }
      src.setData({ type: "FeatureCollection", features });
      if (selPos && propsRef.current.follow && !map.isMoving()) {
        map.setCenter([selPos[1], selPos[0]]);
      }
    };
    raf = requestAnimationFrame(tick);

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === "sd-dem" && e.isSourceLoaded) {
        updateGlideRing();
      }
    };
    map.on("sourcedata", onSourceData);

    return () => {
      cancelAnimationFrame(raf);
      if (terrainTimer) clearTimeout(terrainTimer);
      terrainGen += 1;
      map.off("sourcedata", onSourceData);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- data updates → sample buffers ----------
  useEffect(() => {
    const wall = Date.now();
    const received = props.receivedAt ?? wall;
    const seen = new Set<string>();
    const next = new Map(tracksRef.current);
    const ages: number[] = [];
    for (const a of props.aircraft) {
      seen.add(a.hex);
      const prev = next.get(a.hex);
      next.set(a.hex, {
        a,
        samples: appendSample(prev?.samples ?? [], toSample(a, received)),
        color: altitudeColor(a.altFt, a.onGround),
        emg: isEmergency(a.squawk),
        ghost: false,
      });
      ages.push(a.seenPos * 1000);
    }
    const present = props.presentHexes;
    for (const [hex, tr] of next) {
      if (seen.has(hex)) continue;
      // Filtered out: remove now. Missing from the data: keep as a fading ghost.
      if (present?.has(hex)) next.delete(hex);
      else next.set(hex, { ...tr, ghost: true });
    }
    tracksRef.current = next;
    // Measure how late updates really arrive, once per update (not on filter changes).
    if (props.receivedAt != null && props.receivedAt !== lastReceivedRef.current && ages.length) {
      lastReceivedRef.current = props.receivedAt;
      delayRef.current = observeUpdate(delayRef.current, props.receivedAt, median(ages));
    }
    applyTrail();
    updateGlideRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aircraft]);

  useEffect(() => {
    applyTrail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trail, props.trail3d, props.selectedHex, props.showTrail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    applyWeather(map, props.weather ?? NO_WEATHER, terrainBeforeId(map));
  }, [props.weather]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    applyRouteAirspace(map, props.routeAirspace ?? NO_ROUTE_AIRSPACE, terrainBeforeId(map));
  }, [props.routeAirspace]);

  useEffect(() => {
    applyRuler();
    const map = mapRef.current;
    if (map && !props.rulerActive) map.getCanvas().style.cursor = "";
  }, [props.rulerPoints, props.rulerActive]);

  useEffect(() => {
    applyTerrain();
    updateGlideRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.terrain]);

  useEffect(() => {
    updateGlideRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.glideRing, props.glideRatio, props.selectedHex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyleRef.current) {
      firstStyleRef.current = false;
      return;
    }
    styleReadyRef.current = false;
    map.setStyle(styleFor(props.basemap), { diff: false });
  }, [props.basemap]);

  useEffect(() => {
    const map = mapRef.current;
    const t = props.flyTarget;
    if (!map || !t) return;
    map.flyTo({
      center: [t.lon, t.lat],
      zoom: t.zoom ?? Math.max(map.getZoom(), 9),
      speed: 1.4,
      essential: true,
    });
  }, [props.flyTarget]);

  // 3D trail is easier to read with some pitch.
  useEffect(() => {
    const map = mapRef.current;
    if (map && props.trail3d && map.getPitch() < 40) map.easeTo({ pitch: 60, duration: 800 });
  }, [props.trail3d]);

  return (
    <div className="absolute inset-0" role="region" aria-label="Live flight map">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
