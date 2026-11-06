import { describe, expect, it } from "vitest";
import type { Airport } from "@/lib/airports";
import { haversineNm } from "@/lib/glide-ring";
import { initialBearingDeg, reachableAirports } from "@/lib/reachable-airports";

const apt = (iata: string, lat: number, lon: number): Airport => ({
  iata,
  icao: `K${iata}`,
  name: iata,
  city: iata,
  lat,
  lon,
});

// Points on the equator / a meridian so distances are easy to reason about (1 deg ~ 60 nm).
const EAST_60 = apt("EST", 0, 1);
const EAST_120 = apt("EST2", 0, 2);
const NORTH_180 = apt("NTH", 3, 0);
const FAR = apt("FAR", 0, 40);

describe("initialBearingDeg", () => {
  it("gives the four compass directions", () => {
    expect(initialBearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(initialBearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
    expect(initialBearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 5);
    expect(initialBearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });

  it("stays within 0-360 across the antimeridian", () => {
    const b = initialBearingDeg(0, 179.5, 0, -179.5);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(b).toBeCloseTo(90, 3);
  });
});

describe("reachableAirports", () => {
  const all = [FAR, NORTH_180, EAST_120, EAST_60];

  it("returns only airports inside the range, nearest first", () => {
    const res = reachableAirports(0, 0, 130, 5, all);
    expect(res.map((r) => r.airport.iata)).toEqual(["EST", "EST2"]);
    expect(res[0]!.distNm).toBeCloseTo(haversineNm(0, 0, 0, 1), 6);
    expect(res[0]!.bearingDeg).toBeCloseTo(90, 5);
  });

  it("includes an airport exactly at the range and excludes one just beyond it", () => {
    const d = haversineNm(0, 0, 0, 1);
    expect(reachableAirports(0, 0, d, 5, all).map((r) => r.airport.iata)).toEqual(["EST"]);
    expect(reachableAirports(0, 0, d - 0.01, 5, all)).toEqual([]);
  });

  it("returns an empty list for a missing, zero or negative range", () => {
    expect(reachableAirports(0, 0, null, 5, all)).toEqual([]);
    expect(reachableAirports(0, 0, 0, 5, all)).toEqual([]);
    expect(reachableAirports(0, 0, -10, 5, all)).toEqual([]);
    expect(reachableAirports(0, 0, Number.NaN, 5, all)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(reachableAirports(0, 0, 500, 2, all).map((r) => r.airport.iata)).toEqual([
      "EST",
      "EST2",
    ]);
    expect(reachableAirports(0, 0, 500, 0, all)).toEqual([]);
  });

  it("works across the antimeridian", () => {
    const west = apt("WST", 0, -179.5);
    const res = reachableAirports(0, 179.5, 80, 5, [west]);
    expect(res).toHaveLength(1);
    expect(res[0]!.distNm).toBeCloseTo(60, 0);
  });

  it("uses the built-in airport list by default", () => {
    // Over downtown New York with a 40 nm range: JFK, LGA and EWR are all inside.
    const codes = reachableAirports(40.75, -73.99, 40, 10).map((r) => r.airport.iata);
    expect(codes).toEqual(expect.arrayContaining(["JFK", "LGA", "EWR"]));
    // Nothing is within 40 nm of the middle of the Pacific.
    expect(reachableAirports(0, -140, 40, 10)).toEqual([]);
  });
});
