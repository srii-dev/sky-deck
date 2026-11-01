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
import { buildPlaneSdf } from "./plane-icon";
import { DEFAULT_VIEW, type Basemap, type FlyTarget, type TrailPoint, type Viewport } from "./map-config";

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
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
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
const EXTRAPOLATE_MAX_S = 40;
const CORRECTION_MS = 1600;
const FRAME_MS = 90;

interface Track {
  a: Aircraft;
  lat: number;
  lon: number;
  t0: number;
  offLat: number;
  offLon: number;
  offT: number;
  color: string;
  emg: boolean;
}

function extrapolate(tr: Pick<Track, "a" | "lat" | "lon" | "t0">, now: number): [number, number] {
  const { a } = tr;
  if (a.onGround || !a.gs || a.track == null || a.gs < 30) return [tr.lat, tr.lon];
  const dt = Math.min(EXTRAPOLATE_MAX_S, Math.max(0, (now - tr.t0) / 1000));
  const d = a.gs * KT_TO_MS * dt;
  const rad = (a.track * Math.PI) / 180;
  const dLat = (d * Math.cos(rad)) / M_PER_DEG;
  const dLon = (d * Math.sin(rad)) / (M_PER_DEG * Math.max(0.05, Math.cos((tr.lat * Math.PI) / 180)));
  return [tr.lat + dLat, tr.lon + dLon];
}

function renderPos(tr: Track, now: number): [number, number] {
  const [lat, lon] = extrapolate(tr, now);
  const k = Math.max(0, 1 - (now - tr.offT) / CORRECTION_MS);
  const e = k * k * (3 - 2 * k); // smoothstep easing
  return [lat + tr.offLat * e, lon + tr.offLon * e];
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
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
      geometry: { type: "LineString", coordinates: [[p.lon, p.lat], [q.lon, q.lat]] },
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
}

export default function FlightMap(props: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const tracksRef = useRef(new Map<string, Track>());
  const propsRef = useRef(props);
  propsRef.current = props;
  const styleReadyRef = useRef(false);
  const firstStyleRef = useRef(true);

  // ---------- overlay installation (re-run after every style change) ----------
  const installOverlays = () => {
    const map = mapRef.current;
    if (!map) return;
    const p = propsRef.current;

    if (!map.hasImage("sd-plane")) {
      const img = buildPlaneSdf();
      if (img) map.addImage("sd-plane", img, { sdf: true, pixelRatio: 2 });
    }

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

    const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;

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
        firstSymbol,
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
        firstSymbol,
      );
    }

    if (!map.getSource("sd-trail")) map.addSource("sd-trail", { type: "geojson", data: empty() });
    if (!map.getSource("sd-trail-ribbon")) map.addSource("sd-trail-ribbon", { type: "geojson", data: empty() });
    if (!map.getSource("sd-trail-curtain")) map.addSource("sd-trail-curtain", { type: "geojson", data: empty() });
    if (!map.getSource("sd-aircraft")) map.addSource("sd-aircraft", { type: "geojson", data: empty() });

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
          "icon-image": "sd-plane",
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
        },
      });
    }

    applyTerrain();
    applyTrail();
    styleReadyRef.current = true;
  };

  const applyTerrain = () => {
    const map = mapRef.current;
    if (!map || !map.getSource("sd-dem")) return;
    if (propsRef.current.terrain) map.setTerrain({ source: "sd-dem", exaggeration: 1.3 });
    else map.setTerrain(null);
  };

  const applyTrail = () => {
    const map = mapRef.current;
    if (!map) return;
    const { trail, trail3d, selectedHex } = propsRef.current;
    const pts = selectedHex ? [...trail] : [];
    // Connect trail to the plane's current (interpolated) position.
    const tr = selectedHex ? tracksRef.current.get(selectedHex) : undefined;
    if (tr && pts.length) {
      const [lat, lon] = renderPos(tr, performance.now());
      pts.push({ lat, lon, altFt: tr.a.altFt, onGround: tr.a.onGround, t: Date.now() });
    }
    const f = trailFeatures(pts);
    (map.getSource("sd-trail") as GeoJSONSource | undefined)?.setData(trail3d ? empty() : f.lines);
    (map.getSource("sd-trail-ribbon") as GeoJSONSource | undefined)?.setData(trail3d ? f.ribbons : empty());
    (map.getSource("sd-trail-curtain") as GeoJSONSource | undefined)?.setData(trail3d ? f.curtains : empty());
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
    map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");
    map.addControl(new ScaleControl({ unit: "nautical" }), "bottom-right");

    map.on("style.load", () => {
      styleReadyRef.current = false;
      installOverlays();
    });

    const emitViewport = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      const r = Math.max(haversineNm(c.lat, c.lng, ne.lat, ne.lng), haversineNm(c.lat, c.lng, sw.lat, sw.lng));
      propsRef.current.onViewportChange({
        lat: c.lat,
        lon: ((((c.lng + 180) % 360) + 360) % 360) - 180,
        radiusNm: Math.max(5, Math.min(250, r)),
      });
      try {
        localStorage.setItem(
          "skydeck:view",
          JSON.stringify({ lat: c.lat, lon: c.lng, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }),
        );
      } catch {
        /* ignore */
      }
    };
    map.on("moveend", emitViewport);
    // Fetch immediately; don't wait for every terrain tile ("load") to arrive.
    emitViewport();

    map.on("click", (e) => {
      if (!map.getLayer("sd-aircraft")) return;
      const pad = 10;
      const feats = map.queryRenderedFeatures(
        [
          [e.point.x - pad, e.point.y - pad],
          [e.point.x + pad, e.point.y + pad],
        ],
        { layers: ["sd-aircraft"] },
      );
      const hex = feats[0]?.properties?.["hex"] as string | undefined;
      propsRef.current.onSelect(hex ?? null);
    });
    map.on("mousemove", (e) => {
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
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS || !styleReadyRef.current) return;
      last = ts;
      const src = map.getSource("sd-aircraft") as GeoJSONSource | undefined;
      if (!src) return;
      const now = performance.now();
      const sel = propsRef.current.selectedHex;
      const features: Feature<Point>[] = [];
      let selPos: [number, number] | null = null;
      for (const [hex, tr] of tracksRef.current) {
        const [lat, lon] = renderPos(tr, now);
        const isSel = hex === sel;
        if (isSel) selPos = [lat, lon];
        features.push({
          type: "Feature",
          properties: {
            hex,
            cs: tr.a.callsign,
            track: tr.a.track ?? 0,
            color: tr.emg ? EMERGENCY_COLOR : tr.color,
            alt: tr.a.altFt ?? 0,
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

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- data updates → interpolation tracks ----------
  useEffect(() => {
    const now = performance.now();
    const next = new Map<string, Track>();
    for (const a of props.aircraft) {
      const base = { a, lat: a.lat, lon: a.lon, t0: now - a.seenPos * 1000 };
      const prev = tracksRef.current.get(a.hex);
      let offLat = 0;
      let offLon = 0;
      if (prev) {
        const [rLat, rLon] = renderPos(prev, now);
        const [nLat, nLon] = extrapolate(base, now);
        offLat = rLat - nLat;
        offLon = rLon - nLon;
        // Don't smooth over big jumps (bad data / teleport).
        if (Math.abs(offLat) > 0.3 || Math.abs(offLon) > 0.3) {
          offLat = 0;
          offLon = 0;
        }
      }
      next.set(a.hex, {
        ...base,
        offLat,
        offLon,
        offT: now,
        color: altitudeColor(a.altFt, a.onGround),
        emg: isEmergency(a.squawk),
      });
    }
    tracksRef.current = next;
    applyTrail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aircraft]);

  useEffect(() => {
    applyTrail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trail, props.trail3d, props.selectedHex]);

  useEffect(() => {
    applyTerrain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.terrain]);

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
    map.flyTo({ center: [t.lon, t.lat], zoom: t.zoom ?? Math.max(map.getZoom(), 9), speed: 1.4, essential: true });
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
