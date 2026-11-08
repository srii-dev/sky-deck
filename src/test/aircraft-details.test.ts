import { afterEach, describe, expect, it } from "vitest";

import { loadFeedCircle, resetAdsbSourceState } from "@/lib/adsb-sources";
import {
  aircraftDetailFields,
  describeAge,
  isMilitaryFlag,
  parseYear,
  UNKNOWN,
} from "@/lib/aircraft-details";
import type { Aircraft } from "@/lib/aircraft";

afterEach(() => {
  resetAdsbSourceState();
});

const NOW = new Date("2026-11-08T12:00:00Z");

function aircraft(over: Partial<Aircraft> = {}): Aircraft {
  return {
    hex: "abc123",
    callsign: null,
    registration: null,
    type: null,
    description: null,
    operator: null,
    lat: 40,
    lon: -74,
    altFt: 1000,
    onGround: false,
    gs: 100,
    track: 90,
    vRate: 0,
    squawk: null,
    category: null,
    kind: "generic",
    kindLabel: "Aircraft",
    seenPos: 1,
    ...over,
  };
}

describe("parseYear", () => {
  it("accepts a number or a numeric string", () => {
    expect(parseYear(2014)).toBe(2014);
    expect(parseYear(" 1998 ")).toBe(1998);
  });
  it("rejects anything that is not a plausible year", () => {
    for (const v of ["", "abc", 0, 12, 1899, 2101, 2014.5, null, undefined, {}]) {
      expect(parseYear(v)).toBeNull();
    }
  });
});

describe("isMilitaryFlag", () => {
  it("reads only the military bit", () => {
    expect(isMilitaryFlag(1)).toBe(true);
    expect(isMilitaryFlag(3)).toBe(true);
    expect(isMilitaryFlag(8)).toBe(false); // a privacy flag, never shown
    expect(isMilitaryFlag(4)).toBe(false);
    expect(isMilitaryFlag("1")).toBe(false);
    expect(isMilitaryFlag(undefined)).toBe(false);
  });
});

describe("describeAge", () => {
  it("counts whole calendar years", () => {
    expect(describeAge(2014, NOW)).toBe("12 years (built 2014)");
    expect(describeAge(2025, NOW)).toBe("1 year (built 2025)");
    expect(describeAge(2026, NOW)).toBe("Less than a year (built 2026)");
  });
  it("returns null for a missing or future year", () => {
    expect(describeAge(null, NOW)).toBeNull();
    expect(describeAge(undefined, NOW)).toBeNull();
    expect(describeAge(2031, NOW)).toBeNull();
  });
});

describe("aircraftDetailFields", () => {
  it("says Unknown for everything the feed did not provide", () => {
    const f = aircraftDetailFields(aircraft(), NOW);
    expect(f.map((x) => x.label)).toEqual(["Type", "Operator", "Age", "Emitter category"]);
    expect(f.every((x) => x.value === UNKNOWN && !x.known)).toBe(true);
  });

  it("uses the feed values when present", () => {
    const f = aircraftDetailFields(
      aircraft({
        description: "BOEING 737-800",
        operator: "Example Air",
        year: 2010,
        category: "A3",
        kindLabel: "Large jet",
        military: true,
      }),
      NOW,
    );
    expect(f.find((x) => x.label === "Type")?.value).toBe("BOEING 737-800");
    expect(f.find((x) => x.label === "Operator")?.value).toBe("Example Air");
    expect(f.find((x) => x.label === "Age")?.value).toBe("16 years (built 2010)");
    expect(f.find((x) => x.label === "Emitter category")?.value).toBe("A3 · Large jet");
    expect(f.find((x) => x.label === "Flag")?.value).toContain("Military");
  });

  it("falls back to the type code, and to the callsign prefix for the operator", () => {
    const f = aircraftDetailFields(aircraft({ type: "B738", callsign: "DAL123" }), NOW);
    expect(f.find((x) => x.label === "Type")?.value).toBe("B738");
    const op = f.find((x) => x.label === "Operator");
    expect(op?.value).toBe("Delta Air Lines");
    expect(op?.note).toBe("From the callsign prefix");
  });
});

describe("feed parsing of year and military flag", () => {
  const run = async (ac: Record<string, unknown>) => {
    const res = await loadFeedCircle(40.7, -74, 25, {
      readsbTimeoutMs: 500,
      deadlineMs: 2000,
      paceGapMs: 0,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ac: [{ hex: "abc123", lat: 40.7, lon: -74, ...ac }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    return res.aircraft[0]!;
  };

  it("keeps year and the military flag when the feed has them", async () => {
    const a = await run({ year: "2009", dbFlags: 1 });
    expect(a.year).toBe(2009);
    expect(a.military).toBe(true);
  });

  it("leaves them out otherwise, and ignores non-military flags", async () => {
    const a = await run({ year: "n/a", dbFlags: 8 });
    expect(a.year).toBeUndefined();
    expect(a.military).toBeUndefined();
  });
});
