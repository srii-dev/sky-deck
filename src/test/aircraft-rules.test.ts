import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, flightStatus, isEmergency, passesFilters, type Aircraft } from "@/lib/aircraft";
import { fmtAltitude, fmtSpeed, fmtVerticalRate } from "@/lib/units";

const base: Aircraft = {
  hex: "abc123", callsign: "UAL130", registration: "N24973", type: "B789", description: null,
  operator: null, lat: 0, lon: 0, altFt: 35000, onGround: false, gs: 450, track: 90, vRate: 0,
  squawk: "1200", category: "A5", seenPos: 0,
};

describe("emergency squawks", () => {
  it("flags 7500, 7600 and 7700 only", () => {
    expect(["7500", "7600", "7700"].every(isEmergency)).toBe(true);
    expect(isEmergency("1200")).toBe(false);
  });
  it("emergency-only filter hides normal traffic", () => {
    const f = { ...DEFAULT_FILTERS, emergencyOnly: true };
    expect(passesFilters(base, f)).toBe(false);
    expect(passesFilters({ ...base, squawk: "7700" }, f)).toBe(true);
  });
});

describe("flight status", () => {
  it("classifies by vertical rate and ground state", () => {
    expect(flightStatus({ onGround: true, vRate: 0 })).toBe("ground");
    expect(flightStatus({ onGround: false, vRate: 1500 })).toBe("climbing");
    expect(flightStatus({ onGround: false, vRate: -1200 })).toBe("descending");
    expect(flightStatus({ onGround: false, vRate: 100 })).toBe("cruising");
  });
});

describe("filters", () => {
  it("hide ground traffic removes aircraft on ground", () => {
    expect(passesFilters({ ...base, onGround: true }, { ...DEFAULT_FILTERS, hideGround: true })).toBe(false);
  });
  it("altitude range and airline", () => {
    expect(passesFilters(base, { ...DEFAULT_FILTERS, altMax: 30000 })).toBe(false);
    expect(passesFilters(base, { ...DEFAULT_FILTERS, airline: "UAL" })).toBe(true);
    expect(passesFilters(base, { ...DEFAULT_FILTERS, airline: "DAL" })).toBe(false);
  });
});

describe("units", () => {
  it("converts across aviation, metric and imperial", () => {
    expect(fmtAltitude(10000, "metric")).toBe("3,048 m");
    expect(fmtSpeed(100, "aviation")).toBe("100 kt");
    expect(fmtSpeed(100, "metric")).toBe("185 km/h");
    expect(fmtSpeed(100, "imperial")).toBe("115 mph");
    expect(fmtVerticalRate(1000, "metric")).toBe("+5.1 m/s");
  });
});
