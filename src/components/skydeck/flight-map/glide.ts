import type { GeoJSONSource } from "maplibre-gl";

import {
  buildRingPolygon,
  clampGlideRatio,
  computeAGL,
  ELEV_UNAVAILABLE_GENERIC,
  ELEV_UNAVAILABLE_TERRAIN_OFF,
  glideRatioBounds,
  isElevationCacheValid,
  rangeNm,
} from "@/lib/glide-ring";
import { currentAirportList, isLargeLoaded, loadLargeAirports } from "@/lib/airport-list";
import {
  REACHABLE_LIMIT,
  reachableAirports,
  reachableAirportsGeoJSON,
} from "@/lib/reachable-airports";
import { empty } from "./common";
import type { GlideStatus, MapCtx } from "./types";

function emitGlideStatus(ctx: MapCtx, status: GlideStatus): void {
  const prev = ctx.lastGlideStatusRef.current;
  if (
    prev &&
    prev.aglFt === status.aglFt &&
    prev.rangeNm === status.rangeNm &&
    prev.elevationAvailable === status.elevationAvailable &&
    prev.reason === status.reason
  ) {
    return;
  }
  ctx.lastGlideStatusRef.current = status;
  ctx.propsRef.current.onGlideStatus?.(status);
}

/** Refreshes the ring, then the airport markers that depend on the ring's range. */
export function updateGlideRing(ctx: MapCtx): void {
  drawGlideRing(ctx);
  updateReachMarkers(ctx);
}

// Markers for the airports inside the ring: the same set the panel lists. Cleared whenever
// the ring is off or has no usable range.
function updateReachMarkers(ctx: MapCtx): void {
  const map = ctx.mapRef.current;
  if (!map) return;
  const src = map.getSource("sd-reach-airports") as GeoJSONSource | undefined;
  if (!src) return;
  const p = ctx.propsRef.current;
  const status = ctx.lastGlideStatusRef.current;
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
        const m = ctx.mapRef.current;
        if (m && !m._removed) updateReachMarkers(ctx);
      })
      .catch(() => {});
  }
  src.setData(
    reachableAirportsGeoJSON(
      reachableAirports(ac.lat, ac.lon, status.rangeNm, REACHABLE_LIMIT, currentAirportList()),
    ),
  );
}

function drawGlideRing(ctx: MapCtx): void {
  const map = ctx.mapRef.current;
  if (!map) return;
  const p = ctx.propsRef.current;
  const src = map.getSource("sd-glide-ring") as GeoJSONSource | undefined;
  if (!src) return;

  const selectedHex = p.selectedHex;
  const activeAircraft = selectedHex ? p.aircraft.find((a) => a.hex === selectedHex) : undefined;

  if (!p.glideRing || !activeAircraft) {
    src.setData(empty());
    emitGlideStatus(ctx, { aglFt: null, rangeNm: null, elevationAvailable: false });
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
    emitGlideStatus(ctx, {
      aglFt: null,
      rangeNm: null,
      elevationAvailable: false,
      reason: "No glide ratio for category",
    });
    return;
  }

  if (activeAircraft.onGround || activeAircraft.altFt == null) {
    src.setData(empty());
    emitGlideStatus(ctx, {
      aglFt: null,
      rangeNm: null,
      elevationAvailable: false,
      reason: "Aircraft on ground",
    });
    return;
  }

  if (!p.terrain) {
    src.setData(empty());
    emitGlideStatus(ctx, {
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
    ctx.elevCacheRef.current.set(activeAircraft.hex, {
      elevM: rawElevM,
      lat: activeAircraft.lat,
      lon: activeAircraft.lon,
      sampledAt: now,
    });
  } else {
    const cached = ctx.elevCacheRef.current.get(activeAircraft.hex);
    if (isElevationCacheValid(cached, activeAircraft.lat, activeAircraft.lon, now)) {
      rawElevM = cached!.elevM;
    }
  }

  if (rawElevM == null) {
    src.setData(empty());
    emitGlideStatus(ctx, {
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
    emitGlideStatus(ctx, {
      aglFt: null,
      rangeNm: null,
      elevationAvailable: false,
    });
    return;
  }

  const effectiveRatio = clampGlideRatio(p.glideRatio ?? bounds.defaultRatio, activeAircraft.kind);
  const range = rangeNm(aglFt, effectiveRatio);
  const polygon = buildRingPolygon(activeAircraft.lat, activeAircraft.lon, range);
  src.setData(polygon);
  emitGlideStatus(ctx, {
    aglFt,
    rangeNm: range,
    elevationAvailable: true,
  });
}
