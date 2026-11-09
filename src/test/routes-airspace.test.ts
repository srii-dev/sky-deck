import { afterEach, describe, expect, it } from "vitest";
import {
  distanceNm,
  greatCirclePoints,
  intermediatePoint,
  isDrawableRoute,
  routeLineParts,
  routeProgress,
} from "@/lib/route-geometry";
import {
  altitudeY,
  chartTopFt,
  decodeTerrarium,
  lonLatToTilePixel,
  profileAreaPath,
  sampleProfile,
  summarizeProfile,
  tileKey,
  tileUrl,
  TILE_SIZE,
  type TileLoader,
} from "@/lib/terrain-profile";
import { formatLimit, limitsText, parseAirspace } from "@/lib/airspace";
import {
  airspaceUrl,
  AIRSPACE_TTL_MS,
  loadAirspace,
  normalizeAirspaceBox,
  resetAirspaceState,
} from "@/lib/airspace-sources";

const JFK = { lat: 40.6413, lon: -73.7781 };
const LAX = { lat: 33.9416, lon: -118.4085 };

describe("route geometry", () => {
  it("measures the great-circle distance (JFK to LAX is about 2,150 nm)", () => {
    const d = distanceNm(JFK, LAX);
    expect(d).toBeGreaterThan(2100);
    expect(d).toBeLessThan(2200);
    expect(distanceNm(JFK, JFK)).toBeCloseTo(0, 6);
  });

  it("returns the ends and an even midpoint", () => {
    const pts = greatCirclePoints(JFK, LAX, 5);
    expect(pts).toHaveLength(5);
    expect(pts[0]?.lat).toBeCloseTo(JFK.lat, 6);
    expect(pts[4]?.lon).toBeCloseTo(LAX.lon, 6);
    const mid = intermediatePoint(JFK, LAX, 0.5);
    expect(distanceNm(JFK, mid)).toBeCloseTo(distanceNm(mid, LAX), 3);
  });

  it("curves north of the straight line on the map (great circle)", () => {
    const mid = intermediatePoint(JFK, LAX, 0.5);
    expect(mid.lat).toBeGreaterThan((JFK.lat + LAX.lat) / 2);
  });

  it("splits a line that crosses the date line", () => {
    const parts = routeLineParts({ lat: 35, lon: 140 }, { lat: 34, lon: -118 }, 80);
    expect(parts.length).toBe(2);
    for (const part of parts) {
      for (let i = 1; i < part.length; i++) {
        expect(Math.abs(part[i]![0] - part[i - 1]![0])).toBeLessThan(180);
      }
    }
    expect(routeLineParts(JFK, LAX, 20)).toHaveLength(1);
  });

  it("finds the progress of an aircraft along the line", () => {
    const mid = intermediatePoint(JFK, LAX, 0.25);
    const p = routeProgress(JFK, LAX, mid);
    expect(p.fraction).toBeCloseTo(0.25, 2);
    expect(p.remainingNm + p.flownNm).toBeCloseTo(p.totalNm, 6);
    expect(p.offLineNm).toBeLessThan(5);
    const far = routeProgress(JFK, LAX, { lat: 60, lon: -100 });
    expect(far.offLineNm).toBeGreaterThan(500);
  });

  it("only draws sensible routes", () => {
    expect(isDrawableRoute(JFK, LAX)).toBe(true);
    expect(isDrawableRoute(JFK, JFK)).toBe(false);
    expect(isDrawableRoute(null, LAX)).toBe(false);
    expect(isDrawableRoute({ lat: NaN, lon: 0 }, LAX)).toBe(false);
  });
});

describe("terrain profile", () => {
  it("decodes the Terrarium colour encoding", () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 10, 128)).toBeCloseTo(10.5, 6);
    expect(decodeTerrarium(127, 255, 0)).toBe(-1);
  });

  it("maps a coordinate to a tile and pixel", () => {
    const r = lonLatToTilePixel({ lat: 0, lon: 0 }, 1);
    expect(r.tile).toEqual({ z: 1, x: 1, y: 1 });
    expect(r.px).toBe(0);
    const nyc = lonLatToTilePixel(JFK, 7);
    expect(nyc.tile).toEqual({ z: 7, x: 37, y: 48 });
    expect(nyc.px).toBeGreaterThanOrEqual(0);
    expect(nyc.px).toBeLessThan(TILE_SIZE);
    expect(tileKey(nyc.tile)).toBe("7/37/48");
    expect(tileUrl(nyc.tile)).toBe(
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/7/37/48.png",
    );
  });

  /** A fake tile whose every pixel is `metres` above sea level. */
  function flatTile(metres: number) {
    const data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    const v = metres + 32768;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.floor(v / 256);
      data[i + 1] = Math.floor(v % 256);
      data[i + 2] = Math.floor((v - Math.floor(v)) * 256);
      data[i + 3] = 255;
    }
    return { data };
  }

  it("samples a profile, loading each tile once, and keeps unreadable points as null", async () => {
    const calls: string[] = [];
    const load: TileLoader = async (t) => {
      calls.push(tileKey(t));
      return t.x < 30 ? null : flatTile(1000);
    };
    const pts = await sampleProfile(JFK, LAX, distanceNm(JFK, LAX), 40, load);
    expect(pts).toHaveLength(40);
    expect(new Set(calls).size).toBe(calls.length);
    expect(pts[0]?.elevFt).toBeCloseTo(3280.84, 0);
    expect(pts[39]?.elevFt).toBeNull();
    expect(pts[39]?.nm).toBeCloseTo(distanceNm(JFK, LAX), 6);
    const s = summarizeProfile(pts);
    expect(s?.maxFt).toBeCloseTo(3280.84, 0);
    expect(s?.missing).toBeGreaterThan(0);
  });

  it("survives a loader that throws", async () => {
    const pts = await sampleProfile(JFK, LAX, 2150, 10, async () => {
      throw new Error("network");
    });
    expect(pts.every((p) => p.elevFt === null)).toBe(true);
    expect(summarizeProfile(pts)).toBeNull();
  });

  it("builds chart geometry", () => {
    const pts = [
      { nm: 0, lat: 0, lon: 0, elevFt: 0 },
      { nm: 50, lat: 0, lon: 0, elevFt: 5000 },
      { nm: 100, lat: 0, lon: 0, elevFt: 1000 },
    ];
    const d = profileAreaPath(pts, 200, 100, 10000);
    expect(d.startsWith("M0.0 100.0")).toBe(true);
    expect(d).toContain("L100.0 50.0");
    expect(d.endsWith("Z")).toBe(true);
    expect(profileAreaPath([pts[0]!], 200, 100, 10000)).toBe("");
    expect(altitudeY(5000, 100, 10000)).toBe(50);
    expect(altitudeY(20000, 100, 10000)).toBeNull();
    expect(chartTopFt(5200, 35000)).toBe(35000);
    expect(chartTopFt(300, null)).toBe(2000);
    expect(chartTopFt(5200, 8000)).toBe(8000);
  });
});

// Shapes copied from real answers received on 2026-11-09 (trimmed).
const ring = [
  [-74, 40],
  [-73.9, 40],
  [-73.9, 40.1],
  [-74, 40.1],
  [-74, 40],
];
const CLASS_JSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        OBJECTID: 7,
        NAME: "NEW YORK CLASS B",
        CLASS: "B",
        ICAO_ID: "KJFK",
        LOWER_VAL: 1200,
        LOWER_UOM: "FT",
        LOWER_CODE: "MSL",
        UPPER_VAL: 7000,
        UPPER_UOM: "FT",
        UPPER_CODE: "MSL",
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    },
    {
      type: "Feature",
      properties: {
        OBJECTID: 8,
        NAME: "CALDWELL CLASS D",
        CLASS: "D",
        ICAO_ID: "KCDW",
        LOWER_VAL: 0,
        LOWER_UOM: "FT",
        LOWER_CODE: "SFC",
        UPPER_VAL: 2700,
        UPPER_UOM: "FT",
        UPPER_CODE: "MSL",
      },
      geometry: { type: "MultiPolygon", coordinates: [[ring], [ring]] },
    },
    {
      type: "Feature",
      properties: {
        OBJECTID: 9,
        NAME: "BRIDGEPORT CLASS E5",
        CLASS: "E",
        LOWER_VAL: 700,
        LOWER_CODE: "SFC",
        UPPER_VAL: -9998,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    },
    { type: "Feature", properties: { OBJECTID: 10, CLASS: "B" }, geometry: null },
  ],
};
// The special use layer stores its altitudes as text (checked against a real answer on 2026-11-09).
const SPECIAL_JSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        OBJECTID: 1,
        NAME: "R-5802D",
        TYPE_CODE: "R",
        LOWER_VAL: "17000",
        LOWER_UOM: "FT",
        LOWER_CODE: "MSL",
        UPPER_VAL: "220",
        UPPER_UOM: "FL",
        UPPER_CODE: "STD",
        TIMESOFUSE: "FEB 15 - MAY 10, 0800 - 2300",
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    },
    {
      type: "Feature",
      properties: {
        OBJECTID: 2,
        NAME: "W-106A",
        TYPE_CODE: "W",
        LOWER_VAL: "0",
        LOWER_UOM: "FT",
        LOWER_CODE: "SFC",
        UPPER_VAL: "3000",
        UPPER_UOM: "FT",
        UPPER_CODE: "MSL",
        TIMESOFUSE: "INTERMITTENT BY NOTAM",
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    },
    {
      type: "Feature",
      properties: { OBJECTID: 3, NAME: "X", TYPE_CODE: "XYZ" },
      geometry: { type: "Polygon", coordinates: [ring] },
    },
  ],
};

describe("airspace parsing", () => {
  it("formats floors and ceilings", () => {
    expect(formatLimit(0, "FT", "SFC")).toBe("surface");
    expect(formatLimit(1200, "FT", "MSL")).toBe("1,200 ft MSL");
    expect(formatLimit(700, "FT", "SFC")).toBe("700 ft above ground");
    expect(formatLimit(220, "FL", "STD")).toBe("FL220");
    expect(formatLimit(-9998, null, null)).toBeNull();
    expect(formatLimit("x", "FT", "MSL")).toBeNull();
    // The special use layer stores altitudes as text.
    expect(formatLimit("17000", "FT", "MSL")).toBe("17,000 ft MSL");
    expect(formatLimit("220", "FL", "STD")).toBe("FL220");
    expect(formatLimit("", "FT", "MSL")).toBeNull();
    expect(limitsText({ lower: "surface", upper: "2,700 ft MSL" })).toBe("surface to 2,700 ft MSL");
    expect(limitsText({ lower: null, upper: null })).toBeNull();
  });

  it("parses class B, C and D areas and skips others and empty geometry", () => {
    const a = parseAirspace(CLASS_JSON, "class");
    expect(a.map((x) => x.kind)).toEqual(["B", "D", "D"]);
    expect(a[0]).toMatchObject({
      name: "NEW YORK CLASS B",
      icao: "KJFK",
      lower: "1,200 ft MSL",
      upper: "7,000 ft MSL",
    });
    expect(a[1]?.lower).toBe("surface");
    // A multipolygon becomes one area per polygon, each with its own id.
    expect(new Set(a.map((x) => x.id)).size).toBe(3);
  });

  it("parses special use areas with their times of use", () => {
    const a = parseAirspace(SPECIAL_JSON, "special");
    expect(a.map((x) => x.kind)).toEqual(["R", "W"]);
    expect(a[0]).toMatchObject({ upper: "FL220", hours: "FEB 15 - MAY 10, 0800 - 2300" });
  });

  it("handles junk", () => {
    expect(parseAirspace(null, "class")).toEqual([]);
    expect(parseAirspace({ features: "no" }, "class")).toEqual([]);
  });
});

describe("airspace loader", () => {
  afterEach(() => resetAirspaceState());
  const box = { south: 40.2, west: -74.6, north: 41.1, east: -73.2 };

  function makeFetch(body: unknown = CLASS_JSON, status = 200) {
    const urls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { impl, urls };
  }

  it("rounds the box, builds a bounded query and caches for 12 hours", async () => {
    const { impl, urls } = makeFetch();
    let t = 1_000_000;
    const deps = { fetchImpl: impl, now: () => t };
    const r = await loadAirspace("class", box, deps);
    expect(r?.box).toEqual({ south: 40, west: -75, north: 42, east: -73 });
    expect(r?.areas).toHaveLength(3);
    expect(urls[0]).toContain("Class_Airspace");
    expect(urls[0]).toContain("geometry=-75%2C40%2C-73%2C42");
    expect(urls[0]).toContain("maxAllowableOffset=0.001");
    await loadAirspace("class", { south: 40.5, west: -74.1, north: 41.9, east: -73.5 }, deps);
    expect(urls).toHaveLength(1);
    t += AIRSPACE_TTL_MS + 1;
    await loadAirspace("class", box, deps);
    expect(urls).toHaveLength(2);
  });

  it("uses the other service for special use areas", async () => {
    const { impl, urls } = makeFetch(SPECIAL_JSON);
    const r = await loadAirspace("special", box, { fetchImpl: impl });
    expect(urls[0]).toContain("Special_Use_Airspace");
    expect(r?.areas.map((a) => a.kind)).toEqual(["R", "W"]);
  });

  it("refuses big or invalid boxes", async () => {
    const { impl, urls } = makeFetch();
    expect(normalizeAirspaceBox({ south: 0, west: 0, north: 20, east: 5 })).toBeNull();
    expect(normalizeAirspaceBox({ south: 5, west: 0, north: 4, east: 5 })).toBeNull();
    expect(
      await loadAirspace("class", { south: 0, west: 0, north: 20, east: 5 }, { fetchImpl: impl }),
    ).toBeNull();
    expect(urls).toHaveLength(0);
    expect(airspaceUrl("class", { south: 0, west: 0, north: 1, east: 1 })).toContain("CLASS+IN");
  });

  it("treats an ArcGIS error object as a failure and does not cache it", async () => {
    const { impl, urls } = makeFetch({ error: { code: 400, message: "bad" } });
    await expect(loadAirspace("class", box, { fetchImpl: impl })).rejects.toThrow(
      "FAA service error",
    );
    await expect(loadAirspace("class", box, { fetchImpl: impl })).rejects.toThrow();
    expect(urls).toHaveLength(2);
  });

  it("retries once after a server error", async () => {
    let n = 0;
    const flaky = (async () => {
      n += 1;
      return n === 1
        ? new Response("x", { status: 503 })
        : new Response(JSON.stringify(CLASS_JSON));
    }) as typeof fetch;
    const r = await loadAirspace("class", box, { fetchImpl: flaky });
    expect(r?.areas.length).toBe(3);
    expect(n).toBe(2);
  });
});
