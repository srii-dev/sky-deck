import { describe, expect, it } from "vitest";
import { chartCycle, faaChartsUrl, isUsAirport } from "@/lib/airport-charts";

const at = (iso: string) => Date.parse(iso);

describe("chart cycle", () => {
  it("matches the cycle the FAA page showed on 2026-11-08", () => {
    // The FAA search form listed 2611 as current (0901Z October 29 to 0901Z November 26, 2026).
    expect(chartCycle(at("2026-11-08T18:00:00Z"))).toBe("2611");
    expect(chartCycle(at("2026-10-29T09:02:00Z"))).toBe("2611");
    expect(chartCycle(at("2026-10-29T09:00:00Z"))).toBe("2610");
    expect(chartCycle(at("2026-11-26T09:02:00Z"))).toBe("2612");
  });

  it("numbers cycles within the year and restarts in the new year", () => {
    expect(chartCycle(at("2026-01-22T10:00:00Z"))).toBe("2601");
    expect(chartCycle(at("2026-12-24T10:00:00Z"))).toBe("2613");
    expect(chartCycle(at("2027-01-21T10:00:00Z"))).toBe("2701");
    expect(chartCycle(at("2025-12-25T10:00:00Z"))).toBe("2513");
  });
});

describe("FAA charts link", () => {
  const now = at("2026-11-08T18:00:00Z");

  it("builds the results URL for a US airport", () => {
    expect(faaChartsUrl("kjfk", now)).toBe(
      "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?cycle=2611&ident=KJFK",
    );
    expect(faaChartsUrl("PHNL", now)).toContain("ident=PHNL");
  });

  it("gives no link outside the US", () => {
    expect(faaChartsUrl("EGLL", now)).toBeNull();
    expect(faaChartsUrl("CYYZ", now)).toBeNull();
    expect(isUsAirport("KJF")).toBe(false);
    expect(isUsAirport("")).toBe(false);
  });
});
