import { describe, expect, it } from "vitest";
import type { Map as MLMap } from "maplibre-gl";

import {
  advisoryCollection,
  applyWeather,
  ECHO_TOPS_URL,
  NO_WEATHER,
  pirepCollection,
  WEATHER_IDS,
} from "@/components/skydeck/weather-layers";
import type { Advisory, Pirep } from "@/lib/weather-advisories";

/* A tiny stand-in for the parts of a MapLibre map that applyWeather uses. */
function fakeMap() {
  const sources = new Map<
    string,
    { spec: Record<string, unknown>; data?: unknown; tiles?: string[] | undefined }
  >();
  const layers: { id: string; before: string | undefined; paint: Record<string, unknown> }[] = [];
  const map = {
    _removed: false,
    getSource: (id: string) => {
      const s = sources.get(id);
      if (!s) return undefined;
      return {
        tiles: s.tiles,
        setData: (d: unknown) => {
          s.data = d;
        },
        setTiles: (t: string[]) => {
          s.tiles = t;
        },
      };
    },
    addSource: (id: string, spec: Record<string, unknown>) => {
      sources.set(id, { spec, tiles: spec["tiles"] as string[] | undefined, data: spec["data"] });
    },
    removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (spec: { id: string; paint?: Record<string, unknown> }, before?: string) => {
      layers.push({ id: spec.id, before, paint: spec.paint ?? {} });
    },
    removeLayer: (id: string) => {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
    },
    setPaintProperty: (id: string, key: string, value: unknown) => {
      const l = layers.find((x) => x.id === id);
      if (l) l.paint[key] = value;
    },
  };
  return { map: map as unknown as MLMap, sources, layers };
}

const ADV: Advisory = {
  id: "a1",
  kind: "sigmet",
  hazard: "TS",
  label: "Thunderstorms",
  severity: "high",
  ring: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ],
  baseFt: null,
  topFt: null,
  validFrom: null,
  validTo: null,
  text: "",
};
const PIREP: Pirep = {
  id: "p1",
  lat: 42,
  lon: -71,
  obsAt: null,
  aircraft: null,
  flightLevel: null,
  turbulence: "MOD",
  icing: null,
  severity: "moderate",
  raw: "UA",
};

describe("applyWeather", () => {
  it("adds nothing for the empty state", () => {
    const { map, sources, layers } = fakeMap();
    applyWeather(map, NO_WEATHER);
    expect(sources.size).toBe(0);
    expect(layers).toHaveLength(0);
  });

  it("adds radar under the given layer and swaps frames without a second layer", () => {
    const { map, sources, layers } = fakeMap();
    (map as unknown as { addLayer: (s: { id: string }) => void }).addLayer({ id: "sd-trail-line" });
    applyWeather(map, { ...NO_WEATHER, radarUrl: "https://t/1/{z}/{x}/{y}.png" }, "sd-trail-line");
    expect(layers.map((l) => l.id)).toEqual(["sd-trail-line", WEATHER_IDS.radarLayer]);
    expect(layers[1]?.before).toBe("sd-trail-line");
    applyWeather(map, { ...NO_WEATHER, radarUrl: "https://t/2/{z}/{x}/{y}.png" }, "sd-trail-line");
    expect(layers.filter((l) => l.id === WEATHER_IDS.radarLayer)).toHaveLength(1);
    expect(sources.get(WEATHER_IDS.radarSource)?.tiles).toEqual(["https://t/2/{z}/{x}/{y}.png"]);
  });

  it("is idempotent and removes layers that are switched off", () => {
    const { map, sources, layers } = fakeMap();
    const on = {
      ...NO_WEATHER,
      radarUrl: "https://t/1/{z}/{x}/{y}.png",
      echoTops: true,
      advisories: [ADV],
      pireps: [PIREP],
    };
    applyWeather(map, on);
    applyWeather(map, on);
    expect(layers.map((l) => l.id).sort()).toEqual(
      [
        WEATHER_IDS.radarLayer,
        WEATHER_IDS.echoLayer,
        WEATHER_IDS.advisoryFill,
        WEATHER_IDS.advisoryLine,
        WEATHER_IDS.pirepLayer,
      ].sort(),
    );
    expect(sources.size).toBe(4);
    applyWeather(map, NO_WEATHER);
    expect(layers).toHaveLength(0);
    expect(sources.size).toBe(0);
  });

  it("rebuilds everything after a style swap", () => {
    const { map, sources, layers } = fakeMap();
    const on = { ...NO_WEATHER, echoTops: true, pireps: [PIREP] };
    applyWeather(map, on);
    // A basemap switch drops every source and layer.
    sources.clear();
    layers.length = 0;
    applyWeather(map, on);
    expect(layers.map((l) => l.id).sort()).toEqual(
      [WEATHER_IDS.echoLayer, WEATHER_IDS.pirepLayer].sort(),
    );
  });

  it("does nothing on a removed map", () => {
    const { map, layers } = fakeMap();
    (map as unknown as { _removed: boolean })._removed = true;
    applyWeather(map, { ...NO_WEATHER, echoTops: true });
    expect(layers).toHaveLength(0);
  });
});

describe("weather geojson", () => {
  it("builds polygon and point collections with colours and ids", () => {
    const a = advisoryCollection([ADV]);
    expect(a.features[0]?.properties).toMatchObject({ id: "a1", color: "#ef4444" });
    expect(a.features[0]?.geometry.coordinates[0]).toHaveLength(4);
    const p = pirepCollection([PIREP]);
    expect(p.features[0]?.geometry.coordinates).toEqual([-71, 42]);
    expect(p.features[0]?.properties).toMatchObject({ id: "p1", color: "#f59e0b" });
  });

  it("uses a transparent EPSG:3857 WMS url for echo tops", () => {
    expect(ECHO_TOPS_URL).toContain("transparent=true");
    expect(ECHO_TOPS_URL).toContain("{bbox-epsg-3857}");
    expect(ECHO_TOPS_URL.startsWith("https://")).toBe(true);
  });
});
