import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft";
import type { RunwayInfo } from "@/lib/airport-data";
import { likelyRunwaysWithTraffic, runwayGuessText } from "@/lib/runway-traffic";

const APT = { lat: 40.64, lon: -73.78 };
// One runway, 13/31: end 13 points to 130 degrees, end 31 to 310 degrees.
const RW: RunwayInfo[] = [
  { id: "13/31", lengthFt: 10000, widthFt: 150, surface: null, alignment: 130 },
];

/** A point `nm` nautical miles from the airport on a bearing (flat-earth approximation, fine for a few nm). */
function at(bearing: number, nm: number): { lat: number; lon: number } {
  const r = (bearing * Math.PI) / 180;
  return {
    lat: APT.lat + (nm / 60) * Math.cos(r),
    lon: APT.lon + ((nm / 60) * Math.sin(r)) / Math.cos((APT.lat * Math.PI) / 180),
  };
}

function ac(p: Partial<Aircraft>): Aircraft {
  return {
    hex: "a",
    callsign: null,
    registration: null,
    type: null,
    description: null,
    operator: null,
    lat: APT.lat,
    lon: APT.lon,
    altFt: 2000,
    onGround: false,
    gs: 150,
    track: 310,
    vRate: -700,
    squawk: null,
    category: null,
    kind: "jet",
    kindLabel: "Jet",
    seenPos: 1,
    ...p,
  } as Aircraft;
}

/** On final for end 31: behind it (bearing 130 from the airport), flying 310. */
const final31 = (nm: number, p: Partial<Aircraft> = {}) =>
  ac({ hex: "f" + nm, ...at(130, nm), track: 310, vRate: -700, ...p });
/** Climbing out from end 13: ahead of it (bearing 130), flying 130. */
const depart13 = (nm: number, p: Partial<Aircraft> = {}) =>
  ac({ hex: "d" + nm, ...at(130, nm), track: 130, vRate: 1500, altFt: 3000, ...p });

describe("likely runway from traffic and wind", () => {
  it("falls back to the wind alone when nothing is flying", () => {
    const g = likelyRunwaysWithTraffic(RW, 310, 12, [], APT, 0);
    expect(g?.source).toBe("wind");
    expect(g?.ends.map((e) => e.label)).toEqual(["31"]);
    expect(g?.evidence).toEqual([]);
  });

  it("uses arrivals lined up with an end, and says the wind agrees", () => {
    const g = likelyRunwaysWithTraffic(RW, 310, 12, [final31(6), final31(9)], APT, 0);
    expect(g?.source).toBe("traffic+wind");
    expect(g?.ends.map((e) => e.label)).toEqual(["31"]);
    expect(g?.arrivals).toBe(2);
    expect(g?.windAgrees).toBe(true);
  });

  it("trusts two or more aircraft over the wind, and says the wind disagrees", () => {
    // Wind from 130 favours end 13, but two aircraft are landing on 31.
    const g = likelyRunwaysWithTraffic(RW, 130, 10, [final31(5), final31(8)], APT, 0);
    expect(g?.source).toBe("traffic");
    expect(g?.ends.map((e) => e.label)).toEqual(["31"]);
    expect(g?.windAgrees).toBe(false);
    expect(runwayGuessText(g!)).toContain("does not favour");
  });

  it("ignores a single aircraft that goes against the wind", () => {
    const g = likelyRunwaysWithTraffic(RW, 130, 10, [final31(6)], APT, 0);
    expect(g?.source).toBe("wind");
    expect(g?.ends.map((e) => e.label)).toEqual(["13"]);
  });

  it("accepts a single aircraft that the wind also favours", () => {
    const g = likelyRunwaysWithTraffic(RW, 310, 10, [final31(6)], APT, 0);
    expect(g?.source).toBe("traffic+wind");
  });

  it("counts climbing aircraft ahead of an end as departures", () => {
    const g = likelyRunwaysWithTraffic(RW, null, null, [depart13(3), depart13(5)], APT, 0);
    expect(g?.source).toBe("traffic");
    expect(g?.ends.map((e) => e.label)).toEqual(["13"]);
    expect(g?.departures).toBe(2);
    expect(g?.windAgrees).toBeNull();
    expect(g?.headwindKt).toBeNull();
  });

  it("counts a fast aircraft on the ground, lined up with a runway, as on its roll", () => {
    const roll = ac({ ...at(310, 0.5), onGround: true, altFt: 0, gs: 90, track: 130, vRate: 0 });
    const roll2 = ac({ ...at(130, 0.5), onGround: true, altFt: 0, gs: 70, track: 130, vRate: 0 });
    const taxi = ac({ onGround: true, altFt: 0, gs: 15, track: 130, vRate: 0 });
    const g = likelyRunwaysWithTraffic(RW, null, null, [roll, roll2, taxi], APT, 0);
    expect(g?.rolling).toBe(2);
    expect(g?.ends.map((e) => e.label)).toEqual(["13"]);
  });

  it("ignores level, high, off-centreline, wrong-side and unlined aircraft", () => {
    const level = final31(6, { hex: "level", vRate: 0 });
    const high = final31(6, { hex: "high", altFt: 9000 });
    const offLine = ac({ hex: "off", ...at(160, 8), track: 310, vRate: -700 }); // about 4 nm off the line
    const flyingAway = ac({ hex: "away", ...at(310, 6), track: 310, vRate: -700 });
    const crossing = final31(6, { hex: "cross", track: 40 });
    const g = likelyRunwaysWithTraffic(
      RW,
      null,
      null,
      [level, high, offLine, flyingAway, crossing],
      APT,
      0,
    );
    expect(g).toBeNull();
  });

  it("measures height above the field, not above sea level", () => {
    const high = final31(6, { altFt: 6500 });
    expect(
      likelyRunwaysWithTraffic(RW, null, null, [high, final31(8, { altFt: 7000 })], APT, 0),
    ).toBeNull();
    const g = likelyRunwaysWithTraffic(
      RW,
      null,
      null,
      [high, final31(8, { altFt: 7000 })],
      APT,
      5000,
    );
    expect(g?.ends.map((e) => e.label)).toEqual(["31"]);
  });

  it("keeps parallel runways together, since one position cannot tell them apart", () => {
    const par: RunwayInfo[] = [
      { id: "13L/31R", lengthFt: null, widthFt: null, surface: null, alignment: 130 },
      { id: "13R/31L", lengthFt: null, widthFt: null, surface: null, alignment: 130 },
    ];
    const g = likelyRunwaysWithTraffic(par, null, null, [final31(5), final31(7)], APT, 0);
    expect(g?.ends.map((e) => e.label).sort()).toEqual(["31L", "31R"]);
    expect(g?.arrivals).toBe(2);
  });

  it("drops an end with far less evidence than the busiest one", () => {
    // Crossing runways 13/31 and 04/22: five arrivals on 31, one aircraft lined up with 04.
    const cross: RunwayInfo[] = [
      ...RW,
      { id: "04/22", lengthFt: null, widthFt: null, surface: null, alignment: 40 },
    ];
    const four = [final31(4), final31(6), final31(8), final31(10), final31(11)];
    const lone = ac({ hex: "lone", ...at(220, 6), track: 40, vRate: -600 });
    const g = likelyRunwaysWithTraffic(cross, null, null, [...four, lone], APT, 0);
    expect(g?.ends.map((e) => e.label)).toEqual(["31"]);
  });

  it("returns null with no runway data and no wind", () => {
    expect(likelyRunwaysWithTraffic([], null, null, [final31(6)], APT, 0)).toBeNull();
  });

  it("always says air traffic control decides", () => {
    const wind = likelyRunwaysWithTraffic(RW, 310, 12, [], APT, 0);
    const traffic = likelyRunwaysWithTraffic(RW, 310, 12, [final31(6), final31(8)], APT, 0);
    for (const g of [wind, traffic]) {
      expect(runwayGuessText(g!)).toContain("air traffic control decides");
      expect(runwayGuessText(g!)).toContain("Likely in use");
    }
    expect(runwayGuessText(traffic!)).toContain("2 arriving");
  });
});
