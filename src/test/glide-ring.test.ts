import { describe, expect, it } from "vitest";
import {
  buildRingPolygon,
  clampGlideRatio,
  computeAGL,
  DEFAULT_GLIDE_RATIOS,
  destinationPoint,
  ELEVATION_CACHE_TTL_MS,
  fmtRange,
  glideRatioBounds,
  isElevationCacheValid,
  rangeNm,
  TERRAIN_EXAGGERATION,
  type ElevationCacheEntry,
} from "@/lib/glide-ring";

describe("glide ring math and rules", () => {
  it("reproduces prompt sanity numbers: 35,000 ft at 17:1 ≈ 97.9 nm and 10,000 ft at 9:1 ≈ 14.8 nm", () => {
    const r1 = rangeNm(35000, 17);
    expect(r1).toBeCloseTo(97.9, 1);

    const r2 = rangeNm(10000, 9);
    expect(r2).toBeCloseTo(14.8, 1);
  });

  it("handles zero or negative altitude / ratio cleanly", () => {
    expect(rangeNm(0, 17)).toBe(0);
    expect(rangeNm(-1000, 17)).toBe(0);
    expect(rangeNm(10000, 0)).toBe(0);
    expect(rangeNm(10000, -5)).toBe(0);
  });

  it("assigns default glide ratios per category, hiding drone, balloon, and ground", () => {
    expect(DEFAULT_GLIDE_RATIOS.narrowbody).toBe(17);
    expect(DEFAULT_GLIDE_RATIOS.widebody).toBe(15);
    expect(DEFAULT_GLIDE_RATIOS.bizjet).toBe(14);
    expect(DEFAULT_GLIDE_RATIOS.light).toBe(9);
    expect(DEFAULT_GLIDE_RATIOS.helicopter).toBe(4);
    expect(DEFAULT_GLIDE_RATIOS.glider).toBe(35);
    expect(DEFAULT_GLIDE_RATIOS.generic).toBe(12);

    expect(DEFAULT_GLIDE_RATIOS.balloon).toBeNull();
    expect(DEFAULT_GLIDE_RATIOS.drone).toBeNull();
    expect(DEFAULT_GLIDE_RATIOS.ground).toBeNull();
  });

  it("computes slider bounds: glider explicitly 30-40, others 50%-150%", () => {
    const gliderBounds = glideRatioBounds("glider");
    expect(gliderBounds).toEqual({ min: 30, max: 40, step: 0.5, defaultRatio: 35 });

    const nbBounds = glideRatioBounds("narrowbody");
    expect(nbBounds).toEqual({ min: 8.5, max: 25.5, step: 0.5, defaultRatio: 17 });

    const wbBounds = glideRatioBounds("widebody");
    expect(wbBounds).toEqual({ min: 7.5, max: 22.5, step: 0.5, defaultRatio: 15 });

    expect(glideRatioBounds("drone")).toBeNull();
    expect(glideRatioBounds("balloon")).toBeNull();
  });

  it("computes AGL accounting for terrain exaggeration (rawElevM / TERRAIN_EXAGGERATION)", () => {
    // 130 meters raw elevation with 1.3 exaggeration = 100 meters true ground elevation.
    // 100 meters / 0.3048 = 328.084 feet ground elevation.
    // 10,000 ft baro altitude - 328.084 ft = 9671.916 ft AGL.
    const rawElevM = 130;
    expect(rawElevM / TERRAIN_EXAGGERATION).toBe(100);

    const agl = computeAGL(10000, false, rawElevM);
    expect(agl).not.toBeNull();
    expect(agl!).toBeCloseTo(9671.9, 1);
  });

  it("returns null for AGL when onGround, altFt is null, rawElevM is null, or agl <= 0", () => {
    expect(computeAGL(null, false, 100)).toBeNull();
    expect(computeAGL(5000, true, 100)).toBeNull();
    expect(computeAGL(5000, false, null)).toBeNull();

    // Aircraft altitude below terrain reading (100 ft alt vs ~328 ft ground)
    expect(computeAGL(100, false, 130)).toBeNull();
  });

  it("validates elevation cache by time (<= 20 s) and distance (<= 3 nm)", () => {
    const entry: ElevationCacheEntry = {
      elevM: 150,
      lat: 40.0,
      lon: -74.0,
      sampledAt: 1000,
    };

    // Valid when fresh and close
    expect(isElevationCacheValid(entry, 40.0, -74.01, 1000 + 5000)).toBe(true);
    expect(isElevationCacheValid(entry, 40.0, -74.0, 1000 + ELEVATION_CACHE_TTL_MS)).toBe(true);

    // Invalid when expired (> 20 s)
    expect(isElevationCacheValid(entry, 40.0, -74.0, 1000 + ELEVATION_CACHE_TTL_MS + 1)).toBe(
      false,
    );

    // Invalid when too far (> 3 nm)
    // 1 degree latitude is ~60 nm, so 0.1 deg lat is ~6 nm
    expect(isElevationCacheValid(entry, 40.1, -74.0, 1000 + 5000)).toBe(false);

    // Undefined entry
    expect(isElevationCacheValid(undefined, 40.0, -74.0, 1000)).toBe(false);
  });

  it("calculates exact destinationPoint across antimeridian: (0, 179, 100 nm, 90 deg)", () => {
    const [lat, lon] = destinationPoint(0, 179, 100, 90);
    expect(lat).toBeCloseTo(0, 3);
    // 100 nm east from 179 lon crosses 180 antimeridian to ~ -179.333
    expect(lon).toBeCloseTo(-179.333, 2);
  });

  it("buildRingPolygon outputs GeoJSON [lon, lat] order and closes polygon", () => {
    const poly = buildRingPolygon(40, -74, 10);
    expect(poly.type).toBe("Feature");
    expect(poly.geometry.type).toBe("Polygon");

    const coords = poly.geometry.coordinates[0];
    expect(coords).toBeDefined();
    // 72 segments + 1 closing point
    expect(coords!.length).toBe(73);

    // First coordinate is bearing 0 (due North from 40, -74):
    // GeoJSON order is [lon, lat]. Lon should be approx -74, lat should be > 40.
    const first = coords![0]!;
    expect(first[0]).toBeCloseTo(-74, 2);
    expect(first[1]).toBeGreaterThan(40);

    // Last coordinate equals first coordinate (closed ring)
    const last = coords![coords!.length - 1]!;
    expect(last[0]).toBe(first[0]);
    expect(last[1]).toBe(first[1]);
  });

  it("formats range in aviation, metric, and imperial units", () => {
    expect(fmtRange(97.9, "aviation")).toBe("97.9 nm");
    expect(fmtRange(97.9, "metric")).toBe("181 km");
    expect(fmtRange(97.9, "imperial")).toBe("113 mi");
    expect(fmtRange(0, "aviation")).toBe("0 nm");
  });

  it("clamps glide ratio within bounds for kind, returning unchanged for unbounded kinds", () => {
    // Narrowbody bounds: 8.5 - 25.5
    expect(clampGlideRatio(5, "narrowbody")).toBe(8.5);
    expect(clampGlideRatio(30, "narrowbody")).toBe(25.5);
    expect(clampGlideRatio(17, "narrowbody")).toBe(17);

    // Glider bounds: 30 - 40
    expect(clampGlideRatio(20, "glider")).toBe(30);
    expect(clampGlideRatio(50, "glider")).toBe(40);

    // Unbounded / hidden categories
    expect(clampGlideRatio(10, "drone")).toBe(10);
  });

  it("unwraps longitudes continuously across antimeridian so ring at lon 179 contains longitudes > 180", () => {
    const poly = buildRingPolygon(0, 179, 100);
    const coords = poly.geometry.coordinates[0]!;
    // Point east of 179 deg lon should unwrap to > 180 instead of jumping to -179
    const eastCoords = coords.filter((c) => (c[0] ?? 0) > 180);
    expect(eastCoords.length).toBeGreaterThan(0);
    // Bearing 90 is index 18 (72 points / 4 = 18)
    const bearing90Point = coords[18]!;
    expect(bearing90Point[0]!).toBeCloseTo(180.667, 2);
  });
});
