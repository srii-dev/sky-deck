import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import type { Feature, Point } from "geojson";

import { altitudeColor, EMERGENCY_COLOR } from "@/lib/aircraft";
import { keepUprightWithoutHeading } from "@/lib/aircraft-kind";
import { airlineColor } from "@/lib/airline-colors";
import { iconShapeCached } from "@/lib/aircraft-shape";
import { declutter } from "@/lib/declutter";
import { metersPerPixel, needsRedraw, type DrawnPlane } from "@/lib/redraw-gate";
import { advanceClock, trailUpTo, visibleAt } from "@/lib/replay";
import { missingOpacity, stepDelay } from "@/lib/smooth-motion";
import { followSelected } from "./camera";
import { trackState } from "./tracks";
import { applyTrail } from "./trail";
import type { MapCtx } from "./types";

const FRAME_MS = 90;
/** Below this zoom, planes that sit on top of each other are thinned out (declutter). */
const DECLUTTER_BELOW_ZOOM = 8;

/**
 * Declutter cell in screen pixels: under half the drawn icon (64 px sprite times the icon-size at this zoom), so
 * icons may touch a little and the screen stays full instead of losing every plane whose box touches another.
 */
function declutterCellPx(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - 3) / 5));
  return 64 * (0.32 + t * (0.55 - 0.32)) * 0.45;
}

/**
 * Starts the loop that draws every aircraft at the delayed clock (or the replay clock), about 11 times a second.
 * Returns a function that stops it.
 */
export function startAnimationLoop(ctx: MapCtx, map: MLMap): () => void {
  // Paced by a timer, then aligned to the next frame. A bare requestAnimationFrame loop asks the browser for a new
  // frame 60 times a second even when the tick then does nothing, and each of those frames costs style, layout and
  // paint of the whole page: on a slow phone that alone kept the main thread busy for seconds after load.
  let raf = 0;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleTick = () => {
    tickTimer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, FRAME_MS);
  };
  let lastTickWall = 0;
  let lastSelectedEmit = 0;
  // What the aircraft source last received, and which source that was (a basemap switch replaces it). A tick
  // whose result would look the same is not sent: each setData repaints the whole map (see redraw-gate.ts).
  let lastDrawn: Map<string, DrawnPlane> | null = null;
  let lastDrawnSrc: GeoJSONSource | null = null;
  // Planes kept by the last declutter pass; they win ties next frame so nothing flickers.
  let shownRef = new Set<string>();
  const tick = () => {
    scheduleTick();
    if (!ctx.styleReadyRef.current) return;
    const src = map.getSource("sd-aircraft") as GeoJSONSource | undefined;
    if (!src) return;
    const wall = Date.now();
    const elapsed = lastTickWall ? wall - lastTickWall : 0;
    lastTickWall = wall;
    const mode = ctx.propsRef.current.smoothMotion === false ? "live" : "smooth";
    ctx.delayRef.current = stepDelay(ctx.delayRef.current, mode, elapsed);
    const rp = ctx.propsRef.current.replay ?? null;
    if (rp) advanceClock(rp.clock, elapsed);
    const drawT = rp ? rp.clock.t : wall - ctx.delayRef.current.delayMs;
    const sec = Math.round(ctx.delayRef.current.delayMs / 1000);
    if (sec !== ctx.lastDelaySecRef.current) {
      ctx.lastDelaySecRef.current = sec;
      ctx.propsRef.current.onMotionDelay?.(sec);
    }
    const sel = ctx.propsRef.current.selectedHex;
    const features: Feature<Point>[] = [];
    let selPos: [number, number] | null = null;
    let selTrack: number | null = null;
    for (const [hex, tr] of rp ? (ctx.replayTracksRef.current ?? []) : ctx.tracksRef.current) {
      let fade = 1;
      if (rp && !visibleAt(tr.samples, drawT)) continue;
      if (!rp && tr.ghost) {
        const last = tr.samples[tr.samples.length - 1];
        const o = last ? missingOpacity(wall - last.t) : null;
        if (o == null) {
          ctx.tracksRef.current.delete(hex);
          continue;
        }
        fade = o;
      }
      const m = trackState(tr, drawT);
      // No new report for longer than dead reckoning is trusted: the aircraft is held and drawn dimmer.
      if (!rp && m.phase === "stale") fade = Math.min(fade, 0.55);
      const lat = m.lat;
      const lon = m.lon;
      const isSel = hex === sel;
      if (isSel) {
        selPos = [lat, lon];
        selTrack = m.track;
        if (wall - lastSelectedEmit >= 1000) {
          lastSelectedEmit = wall;
          if (!rp) ctx.propsRef.current.onSelectedMotion?.(hex, m);
          if (ctx.propsRef.current.showTrail !== false) {
            applyTrail(ctx, rp ? trailUpTo(tr.samples, drawT) : undefined);
          }
        }
      }
      features.push({
        type: "Feature",
        properties: {
          hex,
          cs: tr.a.callsign,
          kind: tr.a.kind,
          shape: iconShapeCached(tr.a.kind, tr.a.type),
          track: m.track == null && keepUprightWithoutHeading(tr.a.kind) ? 0 : (m.track ?? 0),
          color: rp
            ? altitudeColor(m.altFt, m.onGround)
            : tr.emg
              ? EMERGENCY_COLOR
              : ctx.propsRef.current.colorBy === "airline"
                ? airlineColor(tr.a.callsign)
                : tr.color,
          alt: m.altFt ?? 0,
          fade,
          sel: isSel,
          emg: tr.emg,
        },
        geometry: { type: "Point", coordinates: [lon, lat] },
      });
    }
    let drawn = features;
    if (map.getZoom() < DECLUTTER_BELOW_ZOOM && features.length > 1) {
      const items = features.map((f) => {
        const p = f.properties as { hex: string; sel: boolean; emg: boolean; alt: number };
        const px = map.project(f.geometry.coordinates as [number, number]);
        return {
          key: p.hex,
          x: px.x,
          y: px.y,
          priority: p.sel ? 3 : p.emg ? 2 : p.alt > 0 ? 1 : 0,
        };
      });
      shownRef = declutter(items, declutterCellPx(map.getZoom()), shownRef);
      const keep = shownRef;
      drawn = features.filter((f) => keep.has((f.properties as { hex: string }).hex));
    } else if (shownRef.size) {
      shownRef = new Set();
    }
    const next = new Map<string, DrawnPlane>();
    for (const f of drawn) {
      const p = f.properties as {
        hex: string;
        cs?: string;
        kind?: string;
        shape: string;
        track: number;
        color: string;
        alt: number;
        fade: number;
        sel: boolean;
        emg: boolean;
      };
      const [lon, lat] = f.geometry.coordinates as [number, number];
      next.set(p.hex, {
        lon,
        lat,
        track: p.track,
        fade: p.fade,
        alt: p.alt,
        look: `${p.cs ?? ""}|${p.kind ?? ""}|${p.shape}|${p.color}|${p.sel ? 1 : 0}|${p.emg ? 1 : 0}`,
      });
    }
    const centre = map.getCenter();
    const prev = src === lastDrawnSrc ? lastDrawn : null;
    if (needsRedraw(prev, next, metersPerPixel(centre.lat, map.getZoom()))) {
      src.setData({ type: "FeatureCollection", features: drawn });
      lastDrawn = next;
      lastDrawnSrc = src;
    }
    if (selPos) followSelected(ctx, map, selPos, selTrack);
  };
  scheduleTick();
  return () => {
    cancelAnimationFrame(raf);
    if (tickTimer) clearTimeout(tickTimer);
  };
}
