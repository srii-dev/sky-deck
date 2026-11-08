import { describe, expect, it } from "vitest";
import {
  parseAirportInfo,
  parseDimension,
  parseMetar,
  parseNasStatus,
  parseTaf,
} from "@/lib/airport-data";
import { angleDiff, likelyRunways, runwayEnds } from "@/lib/runway-wind";
import { airportTraffic } from "@/lib/airport-traffic";
import { nearbyAirports } from "@/lib/nearby-airports";
import type { Aircraft } from "@/lib/aircraft";

// Shapes copied from real answers received on 2026-11-08 (trimmed).
const AIRPORT = [
  {
    icaoId: "KJFK",
    iataId: "JFK",
    name: "NEW YORK/JOHN F KENNEDY INTL ",
    elev: 4,
    runways: [
      { id: "04L/22R", dimension: "12079x200", surface: "C", alignment: 31 },
      { id: "13R/31L", dimension: "14511x200", surface: "C", alignment: 121 },
    ],
  },
];
const METAR = [
  {
    icaoId: "KJFK",
    obsTime: 1794156660,
    temp: 15.6,
    dewp: 5,
    wdir: 280,
    wspd: 14,
    wgst: 24,
    visib: "10+",
    altim: 1010.6,
    rawOb: "METAR KJFK 081651Z 28014G24KT 10SM SCT039 SCT080 16/05 A2984 RMK AO2",
    fltCat: "VFR",
  },
];
const TAF = [
  {
    icaoId: "KJFK",
    validTimeFrom: 1794160800,
    validTimeTo: 1794268800,
    rawTAF: "TAF KJFK 081733Z 0818/0924 28014G25KT P6SM SCT040",
  },
];
const NAS =
  "<AIRPORT_STATUS_INFORMATION><Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List>" +
  "<Ground_Delay><ARPT>AUS</ARPT><Reason>runway construction</Reason><Avg>1 hour</Avg><Max>2 hours</Max></Ground_Delay>" +
  "</Ground_Delay_List></Delay_type><Delay_type><Name>General</Name><Arrival_Departure_Delay_List>" +
  '<Delay><ARPT>PHX</ARPT><Reason>VOL:Multi-taxi</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay>' +
  "</Arrival_Departure_Delay_List></Delay_type><Delay_type><Name>Airport Closures</Name><Airport_Closure_List>" +
  "<Airport><ARPT>SBN</ARPT><Reason>!SBN AD AP CLSD</Reason><Start>Nov 08</Start><Reopen>Nov 09 at 22:00 UTC.</Reopen></Airport>" +
  "</Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>";

describe("airport parsers", () => {
  it("parses airport info", () => {
    const a = parseAirportInfo(AIRPORT);
    expect(a?.icao).toBe("KJFK");
    expect(a?.name).toBe("NEW YORK/JOHN F KENNEDY INTL");
    expect(a?.elevM).toBe(4);
    expect(a?.runways[0]).toMatchObject({
      id: "04L/22R",
      lengthFt: 12079,
      widthFt: 200,
      alignment: 31,
    });
  });

  it("returns null for empty or wrong shapes", () => {
    expect(parseAirportInfo([])).toBeNull();
    expect(parseAirportInfo({})).toBeNull();
    expect(parseMetar([{ icaoId: "KJFK" }])).toBeNull();
    expect(parseTaf(null)).toBeNull();
  });

  it("parses dimensions defensively", () => {
    expect(parseDimension("100x50")).toEqual([100, 50]);
    expect(parseDimension("abc")).toEqual([null, null]);
    expect(parseDimension(undefined)).toEqual([null, null]);
  });

  it("parses a METAR", () => {
    const m = parseMetar(METAR);
    expect(m).toMatchObject({
      windDir: 280,
      windKt: 14,
      gustKt: 24,
      flightCategory: "VFR",
      visibility: "10+",
    });
    expect(m?.obsAt).toBe(1794156660000);
  });

  it("treats zero wind as calm and VRB as variable", () => {
    const calm = parseMetar([{ ...METAR[0], wdir: 0, wspd: 0 }]);
    expect(calm?.windDir).toBeNull();
    const vrb = parseMetar([{ ...METAR[0], wdir: "VRB", wspd: 4 }]);
    expect(vrb?.windDir).toBeNull();
    expect(vrb?.windVariable).toBe(true);
  });

  it("ignores an unknown flight category", () => {
    expect(parseMetar([{ ...METAR[0], fltCat: "XYZ" }])?.flightCategory).toBeNull();
  });

  it("parses a TAF", () => {
    expect(parseTaf(TAF)).toMatchObject({ icao: "KJFK", validFrom: 1794160800000 });
  });
});

describe("FAA NAS status", () => {
  it("finds a ground delay", () => {
    const e = parseNasStatus(NAS, "aus");
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      kind: "ground-delay",
      summary: "Ground delay program, average delay 1 hour",
    });
  });

  it("finds a departure delay with a range", () => {
    const e = parseNasStatus(NAS, "PHX");
    expect(e[0]?.kind).toBe("delay");
    expect(e[0]?.summary).toBe("Departure delays, 16 minutes to 30 minutes");
  });

  it("finds a closure", () => {
    const e = parseNasStatus(NAS, "SBN");
    expect(e[0]?.kind).toBe("closure");
    expect(e[0]?.summary).toContain("reopens Nov 09");
  });

  it("labels a closure that only restricts some aircraft", () => {
    const xml =
      "<Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>!LAX 05/277 LAX AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC 24HR PPR</Reason><Start>May 27</Start><Reopen>May 28</Reopen></Airport></Airport_Closure_List>";
    expect(parseNasStatus(xml, "LAX")[0]?.summary).toBe("Closed to some aircraft only (NOTAM)");
  });

  it("returns nothing for a quiet airport, bad xml or an empty code", () => {
    expect(parseNasStatus(NAS, "JFK")).toEqual([]);
    expect(parseNasStatus("not xml", "JFK")).toEqual([]);
    expect(parseNasStatus(NAS, " ")).toEqual([]);
  });
});

describe("likely runways", () => {
  const rw = parseAirportInfo(AIRPORT)?.runways ?? [];

  it("computes both ends", () => {
    const ends = runwayEnds(rw);
    expect(ends.map((e) => e.label)).toEqual(["04L", "22R", "13R", "31L"]);
    expect(ends[1]?.heading).toBe(211);
  });

  it("measures angles across north", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
  });

  it("picks runways facing a 280 degree wind", () => {
    const r = likelyRunways(rw, 280, 14);
    expect(r?.ends[0]?.label).toBe("31L");
    expect(r?.headwindKt).toBeGreaterThan(10);
  });

  it("says nothing for calm, variable or unknown wind", () => {
    expect(likelyRunways(rw, 280, 2)).toBeNull();
    expect(likelyRunways(rw, null, 10)).toBeNull();
    expect(likelyRunways([], 280, 14)).toBeNull();
  });

  it("keeps parallel runways together", () => {
    const par = [
      { id: "09L/27R", lengthFt: null, widthFt: null, surface: null, alignment: 90 },
      { id: "09R/27L", lengthFt: null, widthFt: null, surface: null, alignment: 90 },
    ];
    expect(
      likelyRunways(par, 270, 10)
        ?.ends.map((e) => e.label)
        .sort(),
    ).toEqual(["27L", "27R"]);
  });
});

function ac(p: Partial<Aircraft>): Aircraft {
  return {
    hex: "a",
    callsign: null,
    registration: null,
    type: null,
    description: null,
    operator: null,
    lat: 40.64,
    lon: -73.78,
    altFt: 3000,
    onGround: false,
    gs: 150,
    track: 0,
    vRate: 0,
    squawk: null,
    category: null,
    kind: "jet",
    kindLabel: "Jet",
    seenPos: 1,
    ...p,
  } as Aircraft;
}

describe("airport traffic", () => {
  const apt = { lat: 40.64, lon: -73.78 };
  it("classifies arrivals, departures and ground traffic", () => {
    // 0.1 degrees of latitude is 6 nm.
    const arriving = ac({ hex: "arr", lat: 40.74, track: 180, vRate: -700 });
    const departing = ac({ hex: "dep", lat: 40.74, track: 0, vRate: 1500 });
    const level = ac({ hex: "lvl", lat: 40.74, track: 180, vRate: 0 });
    const ground = ac({ hex: "gnd", onGround: true, altFt: 0 });
    const far = ac({ hex: "far", lat: 42, vRate: -700, track: 180 });
    const t = airportTraffic([arriving, departing, level, ground, far], apt);
    expect(t.nearby).toBe(4);
    expect(t.onGround).toBe(1);
    expect(t.arriving.map((a) => a.hex)).toEqual(["arr"]);
    expect(t.departing.map((a) => a.hex)).toEqual(["dep"]);
  });

  it("ignores high aircraft and missing data", () => {
    const high = ac({ altFt: 30000, vRate: -800, track: 180, lat: 40.74 });
    const unknown = ac({ vRate: null, lat: 40.74 });
    const t = airportTraffic([high, unknown], apt);
    expect(t.arriving).toHaveLength(0);
    expect(t.departing).toHaveLength(0);
  });
});

describe("nearby airports", () => {
  const list = [
    { iata: "JFK", icao: "KJFK", name: "JFK", city: "New York", lat: 40.64, lon: -73.78 },
    { iata: "LGA", icao: "KLGA", name: "LGA", city: "New York", lat: 40.78, lon: -73.87 },
    { iata: "LAX", icao: "KLAX", name: "LAX", city: "Los Angeles", lat: 33.94, lon: -118.41 },
  ];
  it("sorts by distance and drops far airports", () => {
    const r = nearbyAirports({ lat: 40.7, lon: -73.8 }, list, 5, 150);
    expect(r.map((n) => n.airport.iata)).toEqual(["JFK", "LGA"]);
    expect(r[0]?.distanceNm).toBeLessThan(r[1]?.distanceNm ?? 0);
  });
  it("respects the limit", () => {
    expect(nearbyAirports({ lat: 40.7, lon: -73.8 }, list, 1)).toHaveLength(1);
  });
});
