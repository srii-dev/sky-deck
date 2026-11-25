import { useEffect } from "react";
import type { Map as MLMap } from "maplibre-gl";

import { panelPadding } from "@/lib/panel-padding";
import { parseShareParams } from "@/lib/share-link";
import { DEFAULT_VIEW } from "../map-config";
import type { FlightMapProps, MapCtx } from "./types";

export const cameraPadding = (selected: boolean) => panelPadding(selected, window.innerWidth);

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The first view: a shared link, else the view remembered in this browser, else the default. */
export function initialView() {
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
  return initial;
}

/** Reports the viewport (and remembers it in this browser) after every move, and once now. */
export function installViewportReporting(ctx: MapCtx, map: MLMap): void {
  const emitViewport = () => {
    const c = map.getCenter();
    const b = map.getBounds();
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const r = Math.max(
      haversineNm(c.lat, c.lng, ne.lat, ne.lng),
      haversineNm(c.lat, c.lng, sw.lat, sw.lng),
    );
    ctx.propsRef.current.onViewportChange({
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
}

/** Follow: keep the selected aircraft centred; the chase camera also turns towards its heading. Once per frame. */
export function followSelected(
  ctx: MapCtx,
  map: MLMap,
  selPos: [number, number],
  selTrack: number | null,
): void {
  if (!ctx.propsRef.current.follow || map.isMoving()) return;
  map.setCenter([selPos[1], selPos[0]]);
  // Chase camera: turn towards the heading a little each frame, so the view follows turns smoothly.
  if (ctx.propsRef.current.chase && selTrack != null) {
    const cur = map.getBearing();
    const diff = ((((selTrack - cur) % 360) + 540) % 360) - 180;
    map.setBearing(cur + diff * 0.06);
  }
}

/** Camera moves driven by props: chase tilt, panel padding, fly-to targets and the 3D trail's pitch. */
export function useCamera(ctx: MapCtx, props: FlightMapProps): void {
  const { mapRef, propsRef } = ctx;

  // Turning the chase camera on tilts the map and moves in close behind the aircraft.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.chase || !props.follow) return;
    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ pitch: 68, zoom: Math.max(map.getZoom(), 12), duration: reduce ? 0 : 900 });
  }, [mapRef, props.chase, props.follow]);

  // With the side panel open the map's centre moves to the middle of the part that is still visible, so a
  // selected aircraft (and Follow, which uses the centre) is not hidden under the panel.
  useEffect(() => {
    const apply = (toAircraft: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      const hex = propsRef.current.selectedHex;
      const pad = cameraPadding(!!hex);
      if (map.getPadding().right === pad.right) return;
      const ac = toAircraft ? propsRef.current.aircraft.find((a) => a.hex === hex) : undefined;
      // Changing the padding alone moves every map point; ease to the aircraft, or else to the point that is
      // already at the new visible centre, so the view stays put.
      const c = map.getContainer();
      const center: [number, number] = ac
        ? [ac.lon, ac.lat]
        : (() => {
            const ll = map.unproject([(c.clientWidth - pad.right) / 2, c.clientHeight / 2]);
            return [ll.lng, ll.lat];
          })();
      map.easeTo({ padding: pad, center, duration: 300 });
    };
    apply(true);
    const onResize = () => apply(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mapRef, propsRef, props.selectedHex]);

  useEffect(() => {
    const map = mapRef.current;
    const t = props.flyTarget;
    if (!map || !t) return;
    map.flyTo({
      center: [t.lon, t.lat],
      zoom: t.zoom ?? Math.max(map.getZoom(), 9),
      // Read through the ref: selecting an aircraft must not repeat the flight.
      padding: cameraPadding(!!propsRef.current.selectedHex),
      speed: 1.4,
      // Not essential: a visitor who prefers reduced motion gets a jump instead of a flight (Phase 5f).
    });
  }, [mapRef, propsRef, props.flyTarget]);

  // 3D trail is easier to read with some pitch.
  useEffect(() => {
    const map = mapRef.current;
    if (map && props.trail3d && map.getPitch() < 40) map.easeTo({ pitch: 60, duration: 800 });
  }, [mapRef, props.trail3d]);
}
