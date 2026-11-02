import { describe, expect, it } from "vitest";
import { haversineNm, MAX_CIRCLES, planCoverage, SOURCE_MAX_RADIUS_NM } from "@/lib/coverage";

describe("coverage planning", () => {
  it("uses one circle when the view fits within the source maximum", () => {
    const p = planCoverage({
      lat: 40.7, lon: -74, radiusNm: 80,
      bounds: { north: 41.5, south: 39.9, east: -72.8, west: -75.2 },
    });
    expect(p.circles).toHaveLength(1);
    expect(p.partial).toBe(false);
  });

  it("splits large views into several circles no bigger than 250 nm", () => {
    const p = planCoverage({
      lat: 40, lon: -90, radiusNm: 250,
      bounds: { north: 45, south: 35, east: -82, west: -98 },
    });
    expect(p.circles.length).toBeGreaterThan(1);
    expect(p.circles.length).toBeLessThanOrEqual(MAX_CIRCLES);
    for (const c of p.circles) expect(c.radiusNm).toBeLessThanOrEqual(SOURCE_MAX_RADIUS_NM);
  });

  it("caps at 6 circles, keeps the nearest to center, and flags partial coverage", () => {
    const v = { lat: 40, lon: -90, radiusNm: 250, bounds: { north: 70, south: 10, east: -30, west: -150 } };
    const p = planCoverage(v);
    expect(p.circles).toHaveLength(6);
    expect(p.partial).toBe(true);
    const d = p.circles.map((c) => haversineNm(v.lat, v.lon, c.lat, c.lon));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("reuses the same circles when panning slightly (stable cache keys)", () => {
    const a = planCoverage({ lat: 40, lon: -90, radiusNm: 250, bounds: { north: 45, south: 35, east: -82, west: -98 } });
    const b = planCoverage({ lat: 40.1, lon: -90.1, radiusNm: 250, bounds: { north: 45.1, south: 35.1, east: -82.1, west: -98.1 } });
    const shared = a.circles.filter((c) => b.circles.some((d) => d.key === c.key));
    expect(shared.length).toBeGreaterThan(0);
  });
});
