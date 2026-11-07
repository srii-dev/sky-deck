import { describe, expect, it } from "vitest";
import {
  haversineNm,
  MAX_CIRCLES,
  planCoverage,
  SOURCE_MAX_RADIUS_NM,
  wideCircleDue,
} from "@/lib/coverage";

describe("coverage planning", () => {
  it("uses one snapped circle for mid-size views that fit within the source maximum", () => {
    const p = planCoverage({
      lat: 40.7,
      lon: -74,
      radiusNm: 130,
      bounds: { north: 42.2, south: 39.2, east: -72, west: -76 },
    });
    expect(p.tier).toBe("single");
    expect(p.circles).toHaveLength(1);
    expect(p.circles[0]!.radiusNm % 25).toBe(0);
    expect(p.circles[0]!.radiusNm).toBeLessThanOrEqual(250);
    expect(p.partial).toBe(false);
  });

  it("shares one circle between mid-size views a few nm apart", () => {
    const view = (lat: number, lon: number) =>
      planCoverage({
        lat,
        lon,
        radiusNm: 130,
        bounds: { north: lat + 1.5, south: lat - 1.5, east: lon + 2, west: lon - 2 },
      });
    expect(view(40.6, -74).circles[0]!.key).toBe(view(40.55, -73.95).circles[0]!.key);
  });

  it("uses a fixed fine lattice for zoomed-in views", () => {
    const p = planCoverage({
      lat: 40.7,
      lon: -74,
      radiusNm: 25,
      bounds: { north: 40.9, south: 40.5, east: -73.7, west: -74.3 },
    });
    expect(p.tier).toBe("fine");
    expect(p.circles.length).toBeGreaterThanOrEqual(1);
    expect(p.circles.length).toBeLessThanOrEqual(4);
    for (const c of p.circles) expect(c.radiusNm).toBe(75);
  });

  it("gives two nearby zoomed-in views the same tile keys", () => {
    const view = (lat: number, lon: number) =>
      planCoverage({
        lat,
        lon,
        radiusNm: 20,
        bounds: { north: lat + 0.25, south: lat - 0.25, east: lon + 0.3, west: lon - 0.3 },
      })
        .circles.map((c) => c.key)
        .sort();
    // about 1.5 nm apart: same tiles
    expect(view(40.7, -74)).toEqual(view(40.72, -74.02));
  });

  it("covers every corner of the view with its tiles (fine and medium)", () => {
    const cases = [
      { lat: 40.7, lon: -74, radiusNm: 25, d: [0.2, 0.3] as const },
      { lat: 51.5, lon: -0.1, radiusNm: 60, d: [0.5, 0.9] as const },
      { lat: -33.9, lon: 151.2, radiusNm: 80, d: [0.7, 1.0] as const },
    ];
    for (const c of cases) {
      const bounds = {
        north: c.lat + c.d[0],
        south: c.lat - c.d[0],
        east: c.lon + c.d[1],
        west: c.lon - c.d[1],
      };
      const p = planCoverage({ lat: c.lat, lon: c.lon, radiusNm: c.radiusNm, bounds });
      expect(["fine", "medium"]).toContain(p.tier);
      for (const [la, lo] of [
        [bounds.north, bounds.east],
        [bounds.north, bounds.west],
        [bounds.south, bounds.east],
        [bounds.south, bounds.west],
        [c.lat, c.lon],
      ] as const) {
        const covered = p.circles.some((k) => haversineNm(la, lo, k.lat, k.lon) <= k.radiusNm);
        expect(covered).toBe(true);
      }
    }
  });

  it("keeps the wide lattice for views over 250 nm", () => {
    const p = planCoverage({
      lat: 40,
      lon: -90,
      radiusNm: 600,
      bounds: { north: 48, south: 32, east: -75, west: -105 },
    });
    expect(p.tier).toBe("wide");
  });

  it("splits large views into several circles no bigger than 250 nm", () => {
    const p = planCoverage({
      lat: 40,
      lon: -90,
      radiusNm: 250,
      bounds: { north: 45, south: 35, east: -82, west: -98 },
    });
    expect(p.circles.length).toBeGreaterThan(1);
    expect(p.circles.length).toBeLessThanOrEqual(MAX_CIRCLES);
    for (const c of p.circles) expect(c.radiusNm).toBeLessThanOrEqual(SOURCE_MAX_RADIUS_NM);
  });

  it("caps at 6 circles, keeps the nearest to center, and flags partial coverage", () => {
    const v = {
      lat: 40,
      lon: -90,
      radiusNm: 250,
      bounds: { north: 70, south: 10, east: -30, west: -150 },
    };
    const p = planCoverage(v);
    expect(p.circles).toHaveLength(6);
    expect(p.partial).toBe(true);
    const d = p.circles.map((c) => haversineNm(v.lat, v.lon, c.lat, c.lon));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("reuses the same circles when panning slightly (stable cache keys)", () => {
    const a = planCoverage({
      lat: 40,
      lon: -90,
      radiusNm: 250,
      bounds: { north: 45, south: 35, east: -82, west: -98 },
    });
    const b = planCoverage({
      lat: 40.1,
      lon: -90.1,
      radiusNm: 250,
      bounds: { north: 45.1, south: 35.1, east: -82.1, west: -98.1 },
    });
    const shared = a.circles.filter((c) => b.circles.some((d) => d.key === c.key));
    expect(shared.length).toBeGreaterThan(0);
  });

  it("covers about 20 degrees of latitude over eastern North America", () => {
    const p = planCoverage({
      lat: 42,
      lon: -77.5,
      radiusNm: 250,
      bounds: { north: 52, south: 32, east: -70, west: -85 },
    });
    expect(p.circles.length).toBeGreaterThan(1);
    expect(p.circles.length).toBeLessThanOrEqual(MAX_CIRCLES);
    for (const c of p.circles) expect(c.radiusNm).toBeLessThanOrEqual(SOURCE_MAX_RADIUS_NM);
  });

  it("plans a view that crosses the antimeridian", () => {
    const p = planCoverage({
      lat: 10,
      lon: 175,
      radiusNm: 250,
      bounds: { north: 20, south: 0, east: 200, west: 170 },
    });
    expect(p.circles.length).toBeGreaterThan(0);
    expect(p.circles.length).toBeLessThanOrEqual(MAX_CIRCLES);
    for (const c of p.circles) {
      expect(c.radiusNm).toBeLessThanOrEqual(SOURCE_MAX_RADIUS_NM);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
    }
  });

  it("keeps circles inside the latitude limit near a pole", () => {
    const p = planCoverage({
      lat: 84,
      lon: 25,
      radiusNm: 250,
      bounds: { north: 89, south: 78, east: 40, west: 10 },
    });
    expect(p.circles.length).toBeGreaterThan(0);
    for (const c of p.circles) {
      expect(c.radiusNm).toBeLessThanOrEqual(SOURCE_MAX_RADIUS_NM);
      expect(c.lat).toBeGreaterThanOrEqual(-85);
      expect(c.lat).toBeLessThanOrEqual(85);
    }
  });

  it("keeps the same circle keys when the view pans by a small fraction of a cell", () => {
    const a = planCoverage({
      lat: 40,
      lon: -90,
      radiusNm: 250,
      bounds: { north: 45, south: 35, east: -82, west: -98 },
    });
    const b = planCoverage({
      lat: 40.02,
      lon: -90.02,
      radiusNm: 250,
      bounds: { north: 45.02, south: 35.02, east: -82.02, west: -98.02 },
    });
    expect(b.circles.map((c) => c.key).sort()).toEqual(a.circles.map((c) => c.key).sort());
  });
});

describe("wide-view fetch alternation", () => {
  it("requests the nearest circles every poll", () => {
    expect(wideCircleDue(0, true, 1)).toBe(true);
    expect(wideCircleDue(2, true, 1)).toBe(true);
  });

  it("requests a cached far circle only on even polls", () => {
    expect(wideCircleDue(3, true, 0)).toBe(true);
    expect(wideCircleDue(5, true, 1)).toBe(false);
    expect(wideCircleDue(5, true, 2)).toBe(true);
  });

  it("requests a far circle that has never been cached", () => {
    expect(wideCircleDue(4, false, 1)).toBe(true);
  });
});
