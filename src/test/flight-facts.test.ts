import { describe, expect, it } from "vitest";

import { angleDiff, bearingDeg, flightFacts } from "@/lib/flight-facts";

const LAX = { lat: 33.94, lon: -118.41 };
const JFK = { lat: 40.64, lon: -73.78 };
const ROUTE = { origin: LAX, destination: JFK };
const NOW = 1_800_000_000_000;

const air = (over: Partial<Parameters<typeof flightFacts>[0]> = {}) => ({
  onGround: false,
  gs: 450,
  altFt: 36000,
  vRate: 0,
  lat: 39.5,
  lon: -98,
  track: 75,
  ...over,
});

describe("bearing helpers", () => {
  it("gives compass bearings", () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 3);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 3);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 3);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 3);
  });

  it("wraps angle differences", () => {
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(angleDiff(180, 0)).toBe(-180);
    expect(angleDiff(90, 90)).toBe(0);
  });
});

describe("flightFacts", () => {
  it("describes a flight part way along its route", () => {
    const f = flightFacts(air(), ROUTE, NOW);
    expect(f.stage.stage).toBe("cruise");
    expect(f.route).not.toBeNull();
    expect(f.route!.totalNm).toBeGreaterThan(2000);
    expect(f.route!.flownNm + f.route!.remainingNm).toBeCloseTo(f.route!.totalNm, -2);
    expect(f.route!.fraction).toBeGreaterThan(0.4);
    expect(f.route!.fraction).toBeLessThan(0.7);
    expect(f.bearingToDestDeg).toBeGreaterThan(60);
    expect(f.bearingToDestDeg).toBeLessThan(90);
    expect(Math.abs(f.offDirectDeg!)).toBeLessThan(20);
    // Time to go is distance over ground speed, and the arrival time follows from it.
    expect(f.stage.etaMin).toBeGreaterThan(60);
    expect(f.arrivalAt).toBe(NOW + f.stage.etaMin! * 60_000);
  });

  it("keeps flown, to go and the percentage consistent near the destination", () => {
    const f = flightFacts(
      air({ lat: 40.5, lon: -74.6, altFt: 2500, vRate: -700, gs: 170 }),
      ROUTE,
      NOW,
    );
    const r = f.route!;
    expect(r.flownNm + r.remainingNm).toBeCloseTo(r.totalNm, 5);
    expect(r.fraction).toBeLessThan(1);
    expect(r.fraction).toBeGreaterThan(0.98);
  });

  it("reports a nose that points away from the destination", () => {
    const f = flightFacts(air({ track: 255 }), ROUTE, NOW);
    expect(Math.abs(f.offDirectDeg!)).toBeGreaterThan(150);
  });

  it("gives nothing about a route that is not there or does not fit", () => {
    const none = flightFacts(air(), null, NOW);
    expect(none.route).toBeNull();
    expect(none.arrivalAt).toBeNull();
    expect(none.bearingToDestDeg).toBeNull();
    expect(none.stage.stage).toBe("cruise");
    // Over New York on a flight listed as Los Angeles to Sacramento.
    const wrong = flightFacts(
      air({ lat: 40.7, lon: -74, altFt: 3000, vRate: -500, gs: 200 }),
      { origin: LAX, destination: { lat: 38.7, lon: -121.6 } },
      NOW,
    );
    expect(wrong.stage.routeMismatch).toBe(true);
    expect(wrong.route).toBeNull();
    expect(wrong.arrivalAt).toBeNull();
  });

  it("does not claim a heading or arrival time for an aircraft on the ground", () => {
    const f = flightFacts(
      air({ onGround: true, gs: 0, altFt: 0, lat: LAX.lat, lon: LAX.lon, track: null }),
      ROUTE,
      NOW,
    );
    expect(f.stage.stage).toBe("gate-out");
    expect(f.route!.fraction).toBeCloseTo(0, 1);
    expect(f.bearingToDestDeg).toBeNull();
    expect(f.offDirectDeg).toBeNull();
    expect(f.arrivalAt).toBeNull();
  });

  it("has no off-direct angle when the track is unknown", () => {
    const f = flightFacts(air({ track: null }), ROUTE, NOW);
    expect(f.bearingToDestDeg).not.toBeNull();
    expect(f.offDirectDeg).toBeNull();
  });
});
