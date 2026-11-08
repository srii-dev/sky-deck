import { describe, expect, it, vi } from "vitest";
import type { Map as MLMap } from "maplibre-gl";
import {
  AIRPORT_DETAIL_LAYER_IDS,
  airportDetailLayers,
  installAirportDetail,
} from "@/components/skydeck/airport-detail-layers";

function fakeMap(opts: { hasSource?: boolean; existing?: string[]; removed?: boolean } = {}) {
  const layers = new Set(opts.existing ?? []);
  const added: { id: string; before: string | undefined }[] = [];
  const map = {
    _removed: opts.removed ?? false,
    getSource: (id: string) =>
      opts.hasSource === false ? undefined : id === "openmaptiles" ? {} : undefined,
    getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    addLayer: vi.fn((spec: { id: string }, before?: string) => {
      layers.add(spec.id);
      added.push({ id: spec.id, before });
    }),
  };
  return { map: map as unknown as MLMap, added };
}

describe("airport detail layers", () => {
  it("defines the five layers for every basemap, all reading the aeroway layer", () => {
    for (const basemap of ["dark", "light", "satellite"] as const) {
      const specs = airportDetailLayers(basemap);
      expect(specs.map((s) => s.id)).toEqual([...AIRPORT_DETAIL_LAYER_IDS]);
      for (const s of specs) {
        expect(s.id.startsWith("sd-")).toBe(true);
        expect(s).toMatchObject({ source: "openmaptiles", "source-layer": "aeroway" });
      }
    }
  });

  it("only shows detail when zoomed in close", () => {
    const specs = airportDetailLayers("dark");
    for (const s of specs) expect(s.minzoom ?? 0).toBeGreaterThanOrEqual(12);
    const gateLabel = specs.find((s) => s.id === "sd-apt-gate-label");
    expect(gateLabel?.minzoom).toBeGreaterThan(
      specs.find((s) => s.id === "sd-apt-gate-dot")!.minzoom!,
    );
  });

  it("adds each layer below the given layer, in order", () => {
    const { map, added } = fakeMap();
    installAirportDetail(map, "dark", "sd-trail-line");
    expect(added.map((a) => a.id)).toEqual([...AIRPORT_DETAIL_LAYER_IDS]);
    expect(added.every((a) => a.before === "sd-trail-line")).toBe(true);
  });

  it("can run again after every style load without adding duplicates", () => {
    const { map, added } = fakeMap({ existing: ["sd-apt-apron-fill", "sd-apt-gate-dot"] });
    installAirportDetail(map, "light");
    expect(added.map((a) => a.id)).toEqual([
      "sd-apt-apron-outline",
      "sd-apt-taxiway-ref",
      "sd-apt-gate-label",
    ]);
  });

  it("does nothing without the vector source or on a removed map", () => {
    const noSource = fakeMap({ hasSource: false });
    installAirportDetail(noSource.map, "dark");
    expect(noSource.added).toHaveLength(0);
    const gone = fakeMap({ removed: true });
    installAirportDetail(gone.map, "dark");
    expect(gone.added).toHaveLength(0);
  });
});
