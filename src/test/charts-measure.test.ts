import { describe, expect, it } from "vitest";
import { buildSeries, formatSpan, seriesPath } from "@/lib/chart-series";
import { bearingDeg, distanceNm, nextRulerPoints, rulerSummary } from "@/lib/measure";

describe("chart series", () => {
  it("needs at least two numeric samples and some elapsed time", () => {
    expect(buildSeries([])).toBeNull();
    expect(buildSeries([{ t: 0, value: 1 }])).toBeNull();
    expect(
      buildSeries([
        { t: 0, value: null },
        { t: 10, value: undefined },
      ]),
    ).toBeNull();
    expect(
      buildSeries([
        { t: 5, value: 1 },
        { t: 5, value: 2 },
      ]),
    ).toBeNull();
  });

  it("sorts by time, drops missing values and finds the range", () => {
    const s = buildSeries([
      { t: 3000, value: 300 },
      { t: 1000, value: 100 },
      { t: 2000, value: null },
    ])!;
    expect(s.points.map((p) => p.t)).toEqual([1000, 3000]);
    expect([s.min, s.max, s.spanMs]).toEqual([100, 300, 2000]);
  });

  it("thins long series but keeps the first and last sample", () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ t: i * 1000, value: i }));
    const s = buildSeries(many, 50)!;
    expect(s.points).toHaveLength(50);
    expect(s.points[0]!.v).toBe(0);
    expect(s.points[49]!.v).toBe(999);
  });

  it("draws a path inside the box, and a flat series mid-height", () => {
    const s = buildSeries([
      { t: 0, value: 0 },
      { t: 10, value: 10 },
    ])!;
    expect(seriesPath(s, 100, 40, 0)).toBe("M0.0,40.0 L100.0,0.0");
    const flat = buildSeries([
      { t: 0, value: 5 },
      { t: 10, value: 5 },
    ])!;
    expect(seriesPath(flat, 100, 40, 0)).toBe("M0.0,20.0 L100.0,20.0");
  });

  it("formats spans", () => {
    expect(formatSpan(45_000)).toBe("45 s");
    expect(formatSpan(180_000)).toBe("3 min");
    expect(formatSpan(3_900_000)).toBe("1 h 5 min");
    expect(formatSpan(7_200_000)).toBe("2 h");
  });
});

describe("ruler", () => {
  it("computes bearings in the four compass directions", () => {
    const o: [number, number] = [0, 0];
    expect(Math.round(bearingDeg(o, [0, 1]))).toBe(0);
    expect(Math.round(bearingDeg(o, [1, 0]))).toBe(90);
    expect(Math.round(bearingDeg(o, [0, -1]))).toBe(180);
    expect(Math.round(bearingDeg(o, [-1, 0]))).toBe(270);
  });

  it("measures one degree of latitude as about 60 nm", () => {
    expect(distanceNm([0, 0], [0, 1])).toBeGreaterThan(59.5);
    expect(distanceNm([0, 0], [0, 1])).toBeLessThan(60.5);
  });

  it("summarises distance and bearing in the chosen units, and waits for two points", () => {
    expect(rulerSummary([[0, 0]], "aviation")).toBeNull();
    expect(
      rulerSummary(
        [
          [0, 0],
          [0, 1],
        ],
        "aviation",
      ),
    ).toBe("60.0 nm · 000° N");
    expect(
      rulerSummary(
        [
          [0, 0],
          [1, 0],
        ],
        "metric",
      ),
    ).toMatch(/^111 km · 090° E$/);
  });

  it("a third click starts a new measurement", () => {
    const a: [number, number] = [1, 1];
    const b: [number, number] = [2, 2];
    const c: [number, number] = [3, 3];
    expect(nextRulerPoints([], a)).toEqual([a]);
    expect(nextRulerPoints([a], b)).toEqual([a, b]);
    expect(nextRulerPoints([a, b], c)).toEqual([c]);
  });
});
