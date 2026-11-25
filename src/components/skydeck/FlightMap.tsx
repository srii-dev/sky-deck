import { useEffect, useRef, useState } from "react";
import { Map as MLMap, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import type { ElevationCacheEntry } from "@/lib/glide-ring";
import { initialDelay, median, observeUpdate, type DelayState } from "@/lib/smooth-motion";
import { applyAlertAreas } from "./alert-area-layers";
import { applyNight } from "./night-layers";
import { applyWeather, NO_WEATHER } from "./weather-layers";
import { applyRouteAirspace, NO_ROUTE_AIRSPACE } from "./route-airspace-layers";
import { startAnimationLoop } from "./flight-map/animation-loop";
import { initialView, installViewportReporting, useCamera } from "./flight-map/camera";
import { terrainBeforeId } from "./flight-map/common";
import { updateGlideRing } from "./flight-map/glide";
import { installInteractions, installRulerMouseLeave } from "./flight-map/interactions";
import { installOverlays } from "./flight-map/overlays";
import { applyRuler } from "./flight-map/ruler";
import { applyTerrain, deferredSceneScheduler } from "./flight-map/scene";
import { installStyleFallback, styleFor } from "./flight-map/styles";
import { mergeAircraft, replayTracks } from "./flight-map/tracks";
import { applyTrail } from "./flight-map/trail";
import type { FlightMapProps, GlideStatus, MapCtx, Track } from "./flight-map/types";

export type { FlightMapProps, GlideStatus } from "./flight-map/types";

setWorkerUrl(workerUrl);

/*
 * The live map. This component owns the MapLibre instance and its refs; the work is split into ./flight-map/:
 * styles (basemaps and the plain fallback), overlays and scene (layers re-installed on every style.load), trail,
 * ruler and glide (data layers), interactions (clicks and hover), camera (viewport, follow, camera moves), tracks
 * (aircraft samples) and animation-loop (drawing aircraft at the delayed clock).
 */
export default function FlightMap(props: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerLabelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const tracksRef = useRef(new Map<string, Track>());
  const delayRef = useRef<DelayState>(initialDelay("smooth"));
  const replayTracksRef = useRef<Map<string, Track> | null>(null);
  const lastReceivedRef = useRef<number | null>(null);
  const lastDelaySecRef = useRef<number | null>(null);
  const elevCacheRef = useRef<Map<string, ElevationCacheEntry>>(new Map());
  const lastGlideStatusRef = useRef<GlideStatus | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const styleReadyRef = useRef(false);
  const sceneReadyRef = useRef(false);
  const firstStyleRef = useRef(true);
  // Built once: every field is a stable ref.
  const [ctx] = useState<MapCtx>(() => ({
    mapRef,
    propsRef,
    rulerLabelRef,
    tracksRef,
    replayTracksRef,
    delayRef,
    lastDelaySecRef,
    elevCacheRef,
    lastGlideStatusRef,
    styleReadyRef,
    sceneReadyRef,
  }));

  // ---------- map init ----------
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = initialView();

    const map = new MLMap({
      container: containerRef.current,
      style: styleFor(propsRef.current.basemap),
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: initial.bearing,
      maxPitch: 80,
      attributionControl: { compact: true },
      // No label cross-fade. The aircraft layer is a symbol layer, so with the default 300 ms fade every aircraft
      // update kept MapLibre repainting the whole map for the next 300 ms; at a few updates a second that was a
      // nearly continuous 30 fps render on a phone. Labels now appear and hide at once instead of fading.
      fadeDuration: 0,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __skydeckMap?: MLMap }).__skydeckMap = map;
    map.addControl(
      new NavigationControl({ visualizePitch: true, showCompass: true }),
      "bottom-right",
    );
    map.addControl(new ScaleControl({ unit: "nautical" }), "bottom-right");

    const deferredScene = deferredSceneScheduler(ctx, map);
    installStyleFallback(ctx, map);

    map.on("style.load", () => {
      styleReadyRef.current = false;
      sceneReadyRef.current = false;
      installOverlays(ctx);
      deferredScene.schedule();
    });

    installViewportReporting(ctx, map);
    installInteractions(ctx, map);
    const stopAnimation = startAnimationLoop(ctx, map);

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === "sd-dem" && e.isSourceLoaded) {
        updateGlideRing(ctx);
      }
    };
    map.on("sourcedata", onSourceData);
    installRulerMouseLeave(ctx, map);

    return () => {
      stopAnimation();
      deferredScene.cancel();
      map.off("sourcedata", onSourceData);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- replay source → tracks ----------
  useEffect(() => {
    const rp = props.replay;
    if (!rp) {
      replayTracksRef.current = null;
      // Back to live: draw the live trail again.
      applyTrail(ctx);
      return;
    }
    replayTracksRef.current = replayTracks(rp);
  }, [ctx, props.replay]);

  // ---------- data updates → sample buffers ----------
  useEffect(() => {
    const received = props.receivedAt ?? Date.now();
    const { tracks, ages } = mergeAircraft(
      tracksRef.current,
      props.aircraft,
      received,
      props.presentHexes,
    );
    tracksRef.current = tracks;
    // Measure how late updates really arrive, once per update (not on filter changes).
    if (props.receivedAt != null && props.receivedAt !== lastReceivedRef.current && ages.length) {
      lastReceivedRef.current = props.receivedAt;
      delayRef.current = observeUpdate(delayRef.current, props.receivedAt, median(ages));
    }
    applyTrail(ctx);
    updateGlideRing(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.aircraft]);

  useEffect(() => {
    applyTrail(ctx);
  }, [ctx, props.trail, props.trail3d, props.selectedHex, props.showTrail]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    applyAlertAreas(map, props.alertAreas ?? [], terrainBeforeId(map));
  }, [props.alertAreas]);

  // Day and night: drawn now and refreshed every minute while it is on (the line moves a quarter degree a minute).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    applyNight(map, !!props.nightShade, new Date(), terrainBeforeId(map));
    if (!props.nightShade) return;
    const id = window.setInterval(() => {
      const m = mapRef.current;
      if (m && styleReadyRef.current) applyNight(m, true, new Date(), terrainBeforeId(m));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [props.nightShade]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = props.pickMode ? "crosshair" : "";
  }, [props.pickMode]);

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
    applyRuler(ctx);
    // The cursor label is only for the first point; a second click or leaving the ruler hides it.
    if (rulerLabelRef.current && (props.rulerPoints?.length !== 1 || !props.rulerActive))
      rulerLabelRef.current.hidden = true;
    const map = mapRef.current;
    if (map && !props.rulerActive) map.getCanvas().style.cursor = "";
  }, [ctx, props.rulerPoints, props.rulerActive]);

  useEffect(() => {
    applyTerrain(ctx);
    updateGlideRing(ctx);
  }, [ctx, props.terrain]);

  useEffect(() => {
    updateGlideRing(ctx);
  }, [ctx, props.glideRing, props.glideRatio, props.selectedHex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstStyleRef.current) {
      firstStyleRef.current = false;
      return;
    }
    styleReadyRef.current = false;
    sceneReadyRef.current = false;
    map.setStyle(styleFor(props.basemap), { diff: false });
  }, [props.basemap]);

  // Chase tilt, panel padding, fly-to targets and the 3D trail's pitch.
  useCamera(ctx, props);

  return (
    <div className="absolute inset-0" role="region" aria-label="Live flight map">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={rulerLabelRef}
        hidden
        aria-hidden="true"
        className="glass-panel data-value pointer-events-none absolute left-0 top-0 z-10 rounded px-2 py-1 text-xs whitespace-nowrap"
      />
    </div>
  );
}
