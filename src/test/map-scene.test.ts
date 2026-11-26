import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEGEND_SHAPES } from "@/components/skydeck/aircraft-icons";
import { ALERT_AREA_IDS } from "@/components/skydeck/alert-area-layers";
import { NIGHT_IDS } from "@/components/skydeck/night-layers";
import { terrainBeforeId } from "@/components/skydeck/flight-map/common";
import { addKindImages, installOverlays } from "@/components/skydeck/flight-map/overlays";
import {
  applyTerrain,
  deferredSceneScheduler,
  installDeferredScene,
} from "@/components/skydeck/flight-map/scene";
import type { MapCtx } from "@/components/skydeck/flight-map/types";
import { fakeMap } from "./fake-map";

/* What is installed on the map after a style load: overlays at once, then buildings and terrain. */

// Icons need a canvas, and the glide ring, ruler and trail draw from live state: none of that is under test.
vi.mock("@/components/skydeck/plane-icon", () => {
  const img = { width: 1, height: 1, data: new Uint8Array(4) };
  return { buildPlaneSdf: () => img, buildSvgSdf: async () => img };
});
vi.mock("@/components/skydeck/flight-map/glide", () => ({ updateGlideRing: vi.fn() }));
vi.mock("@/components/skydeck/flight-map/ruler", () => ({ applyRuler: vi.fn() }));
vi.mock("@/components/skydeck/flight-map/trail", () => ({ applyTrail: vi.fn() }));

const ROADS = { id: "roads", type: "line" };
const LABELS = { id: "place-names", type: "symbol" };

function setup(props: Record<string, unknown> = {}, basemap = [ROADS, LABELS]) {
  const m = fakeMap(basemap);
  const ctx = {
    mapRef: { current: m.map },
    propsRef: { current: { basemap: "dark", terrain: false, ...props } },
    styleReadyRef: { current: false },
    sceneReadyRef: { current: false },
  } as unknown as MapCtx;
  return { ...m, ctx };
}

describe("terrainBeforeId", () => {
  it("is the first basemap label or flight overlay, ignoring our own labels", () => {
    expect(terrainBeforeId(fakeMap([ROADS, LABELS]).map)).toBe(LABELS.id);
    const ours = [ROADS, { id: "sd-airport", type: "symbol" }, { id: "sd-trail-line" }, LABELS];
    expect(terrainBeforeId(fakeMap(ours).map)).toBe("sd-trail-line");
    expect(terrainBeforeId(fakeMap([ROADS]).map)).toBeUndefined();
  });
});

describe("installOverlays", () => {
  const area = { id: "a", area: { label: "Home", lat: 42, lon: -71, radiusNm: 5 } };

  it("installs once, aircraft on top and shading under the flight overlays", () => {
    const m = setup({ alertAreas: [area], nightShade: true });
    installOverlays(m.ctx);
    installOverlays(m.ctx);
    const ids = m.ids();
    expect(ids.slice(-2)).toEqual(["sd-aircraft", "sd-aircraft-label"]);
    const at = (id: string) => ids.indexOf(id);
    expect(at("sd-glide-ring-fill")).toBeLessThan(at("sd-trail-line"));
    for (const id of [ALERT_AREA_IDS.fill, NIGHT_IDS.fill]) {
      expect(at(id)).toBeGreaterThanOrEqual(0);
      expect(at(id)).toBeLessThan(at(LABELS.id));
    }
    expect(m.images.has("sd-plane")).toBe(true);
    expect(m.ctx.styleReadyRef.current).toBe(true);
  });

  it("puts everything back after a basemap switch", async () => {
    const m = setup({ alertAreas: [area] });
    installOverlays(m.ctx);
    const before = m.ids();
    await vi.waitFor(() => expect(m.images.size).toBe(LEGEND_SHAPES.length + 1));

    m.swapStyle();
    installOverlays(m.ctx);
    expect(m.ids()).toEqual(before);
    // Rasterised icons are kept, so they return at once.
    expect(m.images.size).toBe(LEGEND_SHAPES.length + 1);
  });

  it("does nothing without a map, and adds no icons to a removed one", () => {
    const m = setup();
    m.raw._removed = true;
    addKindImages(m.map);
    expect(m.images.size).toBe(0);
    m.ctx.mapRef.current = null;
    installOverlays(m.ctx);
    expect(m.sources.size).toBe(0);
  });
});

describe("deferred scene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the style", () => {
    const m = setup();
    m.state.styleLoaded = false;
    installDeferredScene(m.ctx);
    expect(m.sources.size).toBe(0);
    expect(m.ctx.sceneReadyRef.current).toBe(false);
  });

  it("adds buildings under the labels and asks for no elevation while terrain is off", () => {
    const m = setup();
    installDeferredScene(m.ctx);
    installDeferredScene(m.ctx);
    expect(m.ids()).toEqual([ROADS.id, "sd-buildings", LABELS.id]);
    expect([...m.sources.keys()]).toEqual(["openmaptiles"]);
    expect(m.state.terrain).toBeNull();
  });

  it("switches terrain and hill shading on and off", () => {
    const m = setup({ terrain: true });
    applyTerrain(m.ctx);
    expect(m.sources.size).toBe(0);

    installDeferredScene(m.ctx);
    expect(m.state.terrain).toMatchObject({ source: "sd-dem" });
    expect(m.ids()).toContain("sd-hillshade");

    m.ctx.propsRef.current.terrain = false;
    applyTerrain(m.ctx);
    expect(m.state.terrain).toBeNull();
    expect(m.layers.find((l) => l.id === "sd-hillshade")!.layout).toEqual({ visibility: "none" });
  });

  it("has terrain but no hill shading over satellite imagery", () => {
    const m = setup({ terrain: true, basemap: "satellite" });
    installDeferredScene(m.ctx);
    expect(m.state.terrain).not.toBeNull();
    expect(m.ids()).not.toContain("sd-hillshade");
  });

  it("installs once, on idle or after three seconds", () => {
    for (const trigger of ["idle", "timeout"]) {
      const m = setup();
      deferredSceneScheduler(m.ctx, m.map).schedule();
      expect(m.sources.size).toBe(0);
      if (trigger === "idle") m.fireIdle();
      else vi.advanceTimersByTime(3000);
      expect(m.sources.size).toBe(1);

      m.swapStyle();
      m.fireIdle();
      vi.advanceTimersByTime(3000);
      expect(m.sources.size).toBe(0);
    }
  });

  it("tries again on the timer when the style was not ready at idle", () => {
    const m = setup();
    deferredSceneScheduler(m.ctx, m.map).schedule();
    m.state.styleLoaded = false;
    m.fireIdle();
    m.state.styleLoaded = true;
    vi.advanceTimersByTime(3000);
    expect(m.sources.size).toBe(1);
  });

  it("drops a pending install when cancelled", () => {
    const m = setup();
    const scene = deferredSceneScheduler(m.ctx, m.map);
    scene.schedule();
    scene.cancel();
    m.fireIdle();
    vi.advanceTimersByTime(3000);
    expect(m.sources.size).toBe(0);
  });
});
