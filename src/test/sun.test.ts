import { describe, expect, it } from "vitest";

import { isNight, nightRing, sunPosition, sunTimes } from "@/lib/sun";

const minutesApart = (a: Date | null, iso: string) =>
  a ? Math.abs(a.getTime() - new Date(iso).getTime()) / 60_000 : Infinity;

describe("sunPosition", () => {
  it("has the sun over the tropics at the solstices and the equator at the equinox", () => {
    expect(sunPosition(new Date("2026-06-21T12:00:00Z")).declinationDeg).toBeCloseTo(23.44, 0);
    expect(sunPosition(new Date("2026-12-21T12:00:00Z")).declinationDeg).toBeCloseTo(-23.44, 0);
    expect(Math.abs(sunPosition(new Date("2026-03-20T14:46:00Z")).declinationDeg)).toBeLessThan(
      0.3,
    );
  });

  it("puts the sun over the Greenwich meridian near noon UTC, and moves it west by 15 degrees an hour", () => {
    const noon = sunPosition(new Date("2026-03-20T12:00:00Z")).subsolarLonDeg;
    expect(Math.abs(noon)).toBeLessThan(4);
    const next = sunPosition(new Date("2026-03-20T13:00:00Z")).subsolarLonDeg;
    expect(noon - next).toBeCloseTo(15, 0);
  });

  it("has an equation of time within its known range", () => {
    // About -14 minutes in mid February and +16 in early November.
    expect(sunPosition(new Date("2026-02-11T12:00:00Z")).equationOfTimeMin).toBeCloseTo(-14, 0);
    expect(sunPosition(new Date("2026-11-03T12:00:00Z")).equationOfTimeMin).toBeCloseTo(16.4, 0);
  });
});

describe("sunTimes", () => {
  it("matches published sunrise and sunset to within a few minutes", () => {
    const june21 = new Date("2026-06-21T12:00:00Z");
    // London: 04:43 and 21:21 BST.
    const london = sunTimes(june21, 51.5, -0.12);
    expect(minutesApart(london.sunrise, "2026-06-21T03:43:00Z")).toBeLessThan(5);
    expect(minutesApart(london.sunset, "2026-06-21T20:21:00Z")).toBeLessThan(5);
    // New York: 5:25 and 8:31 pm EDT, so the sunset is after midnight UTC.
    const ny = sunTimes(june21, 40.71, -74.0);
    expect(minutesApart(ny.sunrise, "2026-06-21T09:25:00Z")).toBeLessThan(5);
    expect(minutesApart(ny.sunset, "2026-06-22T00:31:00Z")).toBeLessThan(5);
    // Sydney in midwinter: 07:00 and 16:54 AEST.
    const sydney = sunTimes(june21, -33.87, 151.2);
    expect(minutesApart(sydney.sunrise, "2026-06-20T21:00:00Z")).toBeLessThan(6);
    expect(minutesApart(sydney.sunset, "2026-06-21T06:54:00Z")).toBeLessThan(6);
  });

  it("has a day about twelve hours long at the equator all year", () => {
    const t = sunTimes(new Date("2026-03-20T12:00:00Z"), 0, 30);
    const hours = (t.sunset!.getTime() - t.sunrise!.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(12);
    expect(hours).toBeLessThan(12.2);
  });

  it("says when the sun does not set or rise", () => {
    expect(sunTimes(new Date("2026-06-21T12:00:00Z"), 80, 0)).toMatchObject({
      polar: "day",
      sunrise: null,
      sunset: null,
    });
    expect(sunTimes(new Date("2026-12-21T12:00:00Z"), 80, 0).polar).toBe("night");
  });
});

describe("night shading", () => {
  const date = new Date("2026-11-10T12:00:00Z");

  it("makes a closed ring from the dark pole, along the line from west to east and back", () => {
    const ring = nightRing(date);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // In November the sun is south of the equator, so the north pole is the dark one.
    expect(ring[0]![1]).toBe(90);
    expect(ring.length).toBeGreaterThan(180);
    for (const [lon, lat] of ring) {
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });

  it("closes through the south pole in northern summer", () => {
    expect(nightRing(new Date("2026-06-21T12:00:00Z"))[0]![1]).toBe(-90);
  });

  it("is dark opposite the sun and light under it", () => {
    const sun = sunPosition(date);
    expect(isNight(date, sun.declinationDeg, sun.subsolarLonDeg)).toBe(false);
    expect(isNight(date, -sun.declinationDeg, sun.subsolarLonDeg + 180)).toBe(true);
    // Noon UTC in November: London is light, the middle of the Pacific is dark.
    expect(isNight(date, 51.5, -0.12)).toBe(false);
    expect(isNight(date, 0, -170)).toBe(true);
  });

  it("agrees with the ring: the line is where the sun is on the horizon", () => {
    const sun = sunPosition(date);
    for (const [lon, lat] of nightRing(date, 10).slice(1, -2)) {
      // Points on the line are neither clearly light nor clearly dark: a small step towards the dark pole is night.
      expect(isNight(date, lat + Math.sign(sun.declinationDeg || 1) * -0.5, lon)).toBe(true);
      expect(isNight(date, lat + Math.sign(sun.declinationDeg || 1) * 0.5, lon)).toBe(false);
    }
  });
});
