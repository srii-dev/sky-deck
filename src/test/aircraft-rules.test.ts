import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  flightStatus,
  isConfirmedEmergency,
  isEmergency,
  nextEmergencyMemory,
  passesFilters,
  pickFresherAircraft,
  presentEmergency,
  resolveFeedNotices,
  type Aircraft,
  type EmergencyObservation,
} from "@/lib/aircraft";
import { fmtAltitude, fmtSpeed, fmtVerticalRate } from "@/lib/units";

const base: Aircraft = {
  hex: "abc123", callsign: "UAL130", registration: "N24973", type: "B789", description: null,
  operator: null, lat: 0, lon: 0, altFt: 35000, onGround: false, gs: 450, track: 90, vRate: 0,
  squawk: "1200", category: "A5", kind: "widebody", kindLabel: "Heavy jet", seenPos: 0,
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

describe("emergency confirmation", () => {
  const obs = (over: Partial<EmergencyObservation> = {}): EmergencyObservation => ({
    hex: "abc123",
    squawk: "7700",
    seenPos: 1,
    freshlyFetched: true,
    observedAt: 0,
    ...over,
  });
  const ac = { hex: "abc123", squawk: "7700", seenPos: 1 };

  it("does not confirm the first fresh sample", () => {
    const memory = nextEmergencyMemory({}, [obs()]);
    expect(memory["abc123"]?.count).toBe(1);
    expect(isConfirmedEmergency(memory, ac)).toBe(false);
    const shown = presentEmergency({ ...base, squawk: "7700" }, memory);
    expect(shown.squawk).toBeNull();
    expect(shown.reportedSquawk).toBe("7700");
  });

  it("confirms the same code on a second fresh sample at least 5s later", () => {
    const first = nextEmergencyMemory({}, [obs()]);
    const second = nextEmergencyMemory(first, [obs({ observedAt: 5000 })]);
    expect(second["abc123"]?.count).toBe(2);
    expect(isConfirmedEmergency(second, ac)).toBe(true);
    expect(presentEmergency({ ...base, squawk: "7700" }, second).squawk).toBe("7700");
  });

  it("does not count a fresh sample from an immediate refresh inside 5s", () => {
    const first = nextEmergencyMemory({}, [obs()]);
    const second = nextEmergencyMemory(first, [obs({ observedAt: 4999 })]);
    expect(second["abc123"]?.count).toBe(1);
    expect(isConfirmedEmergency(second, ac)).toBe(false);
  });

  it("does not count a cached circle response", () => {
    const first = nextEmergencyMemory({}, [obs()]);
    const inside = nextEmergencyMemory(first, [obs({ observedAt: 1000, freshlyFetched: false })]);
    const later = nextEmergencyMemory(inside, [obs({ observedAt: 8000, freshlyFetched: false })]);
    expect(inside["abc123"]?.count).toBe(1);
    expect(later["abc123"]?.count).toBe(1);
  });

  it("ignores an emergency squawk with seenPos over 30s", () => {
    const memory = nextEmergencyMemory({}, [obs({ seenPos: 31 })]);
    expect(memory["abc123"]).toBeUndefined();
    const counted = nextEmergencyMemory({}, [obs({ seenPos: 30 })]);
    expect(counted["abc123"]?.count).toBe(1);
    expect(isConfirmedEmergency(
      { abc123: { code: "7700", count: 2, lastCountedAt: 0 } },
      { ...ac, seenPos: 31 },
    )).toBe(false);
  });

  it("resets when the code changes and clears when the code is normal or the hex leaves", () => {
    const first = nextEmergencyMemory({}, [obs()]);
    const changed = nextEmergencyMemory(first, [obs({ observedAt: 5000, squawk: "7600" })]);
    expect(changed["abc123"]).toEqual({ code: "7600", count: 1, lastCountedAt: 5000 });
    expect(nextEmergencyMemory(first, [obs({ squawk: "1200", observedAt: 5000 })])["abc123"]).toBeUndefined();
    expect(nextEmergencyMemory(first, [])["abc123"]).toBeUndefined();
  });
});

describe("overlap merge", () => {
  it("keeps the whole fresher record, including its squawk", () => {
    const older = { ...base, seenPos: 8, squawk: "7700", lat: 2 };
    const newer = { ...base, seenPos: 1, squawk: "1200", lat: 1 };
    expect(pickFresherAircraft(older, newer)).toEqual(newer);
    expect(pickFresherAircraft(newer, older)).toEqual(newer);
    const fresherEmergency = { ...base, seenPos: 1, squawk: "7700", lat: 3 };
    expect(pickFresherAircraft(older, fresherEmergency)).toMatchObject({ squawk: "7700", lat: 3, seenPos: 1 });
  });

  it("keeps the first record when seenPos ties", () => {
    const first = { ...base, seenPos: 4, squawk: "1200", lat: 1 };
    const second = { ...base, seenPos: 4, squawk: "7700", lat: 9 };
    expect(pickFresherAircraft(first, second)).toBe(first);
  });
});

describe("feed notices", () => {
  it("uses the hard message only when every circle failed", () => {
    expect(resolveFeedNotices({ circles: 3, failed: 3, fallbackBusy: true })).toEqual({
      error: "Data provider busy",
      backup: false,
      areasMissing: false,
    });
  });

  it("shows a backup notice when a fallback answered and data arrived", () => {
    expect(resolveFeedNotices({ circles: 2, failed: 0, fallbackBusy: true })).toEqual({
      error: null,
      backup: true,
      areasMissing: false,
    });
  });

  it("shows a soft notice when some circles failed", () => {
    expect(resolveFeedNotices({ circles: 3, failed: 1, fallbackBusy: false })).toEqual({
      error: null,
      backup: false,
      areasMissing: true,
    });
  });

  it("shows nothing when every circle succeeded on the primary source", () => {
    expect(resolveFeedNotices({ circles: 2, failed: 0, fallbackBusy: false })).toEqual({
      error: null,
      backup: false,
      areasMissing: false,
    });
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
