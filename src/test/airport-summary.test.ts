import { describe, expect, it } from "vitest";
import type { Metar } from "@/lib/airport-data";
import { airportSummary, windPhrase, type AirportSummaryInput } from "@/lib/airport-summary";

const METAR: Metar = {
  icao: "KJFK",
  obsAt: 0,
  windDir: 280,
  windVariable: false,
  windKt: 14,
  gustKt: 22,
  visibility: "10+",
  tempC: 16,
  dewpointC: 6,
  altimeterHpa: 1009,
  flightCategory: "VFR",
  raw: "METAR KJFK",
};

const TRAFFIC = { nearby: 7, onGround: 2, arriving: [], departing: [] } as never;

function input(p: Partial<AirportSummaryInput> = {}): AirportSummaryInput {
  return {
    metar: METAR,
    weatherFailed: false,
    nas: [],
    nasFailed: false,
    atis: null,
    traffic: TRAFFIC,
    runway: null,
    ...p,
  };
}

describe("wind phrase", () => {
  it("covers calm, variable, gusts and unknown", () => {
    expect(windPhrase({ ...METAR, windKt: 0 })).toBe("calm wind");
    expect(
      windPhrase({ ...METAR, windVariable: true, windDir: null, windKt: 5, gustKt: null }),
    ).toBe("variable wind at 5 kt");
    expect(windPhrase(METAR)).toBe("wind from 280° at 14 kt, gusting 22 kt");
    expect(windPhrase({ ...METAR, windKt: null })).toBeNull();
    expect(windPhrase({ ...METAR, windDir: 90, gustKt: 14 })).toBe("wind from 090° at 14 kt");
  });
});

describe("airport brief", () => {
  it("combines weather, FAA status and traffic", () => {
    const s = airportSummary(input());
    expect(s[0]).toContain("VFR");
    expect(s[0]).toContain("wind from 280° at 14 kt, gusting 22 kt");
    expect(s).toContain("The FAA reports no delays or closures.");
    expect(s[s.length - 1]).toBe("7 aircraft within 25 nm.");
  });

  it("describes IFR conditions and FAA delays with their reasons", () => {
    const s = airportSummary(
      input({
        metar: { ...METAR, flightCategory: "IFR" },
        nas: [
          {
            kind: "ground-delay",
            airport: "JFK",
            reason: "low ceilings",
            summary: "Ground delay program, average delay 1 hour",
          },
        ],
      }),
    );
    expect(s[0]).toContain("poor (IFR");
    expect(s[1]).toBe("FAA: Ground delay program, average delay 1 hour (low ceilings).");
  });

  it("includes the ATIS letter and time when there is one, and nothing when there is not", () => {
    const withAtis = airportSummary(
      input({
        atis: [{ kind: "combined", code: "C", text: "x", time: "1751", updatedAt: null }],
      }),
    );
    expect(withAtis).toContain("ATIS information C was broadcast at 1751Z.");
    expect(airportSummary(input()).some((x) => x.startsWith("ATIS"))).toBe(false);
  });

  it("says what is unavailable instead of guessing", () => {
    const s = airportSummary(
      input({ metar: null, weatherFailed: true, nas: null, nasFailed: true }),
    );
    expect(s).toContain("Weather is not available right now.");
    expect(s).toContain("FAA status is not available right now.");
    const none = airportSummary(input({ metar: null, nas: null }));
    expect(none[0]).toBe("There is no current weather report for this airport.");
    expect(none.some((x) => x.startsWith("FAA"))).toBe(false);
  });

  it("reports arrivals, departures and the runway guess, marked as inferred", () => {
    const a = { hex: "a" } as never;
    const s = airportSummary(
      input({
        traffic: { nearby: 12, onGround: 3, arriving: [a, a], departing: [a] },
        runway: {
          ends: [{ label: "31L", heading: 314 }],
          source: "traffic",
          headwindKt: null,
          windAgrees: null,
          evidence: [],
          arrivals: 2,
          departures: 1,
          rolling: 0,
        },
      }),
    );
    expect(s).toContain("Runway in use is probably 31L (a guess).");
    expect(s[s.length - 1]).toBe(
      "12 aircraft within 25 nm: 2 arriving and 1 departing (inferred).",
    );
  });

  it("handles an empty sky and a report without a flight category", () => {
    const s = airportSummary(
      input({
        metar: { ...METAR, flightCategory: null },
        traffic: { nearby: 0, onGround: 0, arriving: [], departing: [] },
      }),
    );
    expect(s[0]).toBe("Weather: wind from 280° at 14 kt, gusting 22 kt.");
    expect(s[s.length - 1]).toBe("This map sees no aircraft within 25 nm right now.");
  });
});
