import { describe, expect, it } from "vitest";

import type { Aircraft } from "@/lib/aircraft";
import {
  aircraftListFilename,
  aircraftListToCsv,
  csvText,
  LIST_COLUMNS,
  LIST_MAX_ROWS,
} from "@/lib/aircraft-list-export";
import { actionForKey, escapeTarget, SHORTCUTS } from "@/lib/shortcuts";
import { trailFilename, trailToKml, type TrailExportMeta } from "@/lib/trail-export";

const NOW = new Date("2026-11-10T14:05:30Z");

const ac = (over: Partial<Aircraft> = {}): Aircraft => ({
  hex: "a1b2c3",
  callsign: "UAL123",
  registration: "N123UA",
  type: "B738",
  description: null,
  operator: "United Airlines",
  lat: 40.64,
  lon: -73.78,
  altFt: 12000,
  onGround: false,
  gs: 310,
  track: 270,
  vRate: -500,
  squawk: "1200",
  category: null,
  kind: "narrowbody",
  kindLabel: "Narrowbody jet",
  seenPos: 1,
  ...over,
});

describe("csvText", () => {
  it("defuses spreadsheet formulas from third-party text", () => {
    for (const bad of ["=HYPERLINK(1)", "+1+1", "-2+3", "@SUM(A1)"]) {
      expect(csvText(bad).startsWith("'")).toBe(true);
    }
    expect(csvText("UAL123")).toBe("UAL123");
  });

  it("quotes commas and quotes, drops control characters, caps the length and handles empty", () => {
    expect(csvText('Smith, "Air"')).toBe('"Smith, ""Air"""');
    expect(csvText("a\nb\tc")).toBe("a b c");
    expect(csvText("x".repeat(200), 10)).toHaveLength(10);
    expect(csvText(null)).toBe("");
    expect(csvText("   ")).toBe("");
  });
});

describe("aircraftListToCsv", () => {
  it("has the credit, a header and one row per aircraft with the right number of cells", () => {
    const csv = aircraftListToCsv([ac(), ac({ hex: "d4e5f6", callsign: null, onGround: true })], {
      exportedAt: NOW,
      source: "adsb.lol",
    });
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^# SkyDeck aircraft list/);
    expect(lines[1]).toMatch(/community ADS-B data/);
    expect(lines[2]).toContain("2026-11-10T14:05:30.000Z");
    expect(lines[2]).toContain("last provider: adsb.lol");
    expect(lines[3]).toBe(LIST_COLUMNS.join(","));
    expect(lines).toHaveLength(6);
    for (const row of lines.slice(4)) expect(row.split(",")).toHaveLength(LIST_COLUMNS.length);
    expect(lines[4]).toBe(
      "A1B2C3,UAL123,N123UA,B738,Narrowbody jet,United Airlines,40.64000,-73.78000,12000,310,270,-500,1200,false",
    );
    // No altitude for an aircraft on the ground.
    expect(lines[5]!.split(",")[8]).toBe("");
  });

  it("neutralises a hostile callsign and stops at the row limit", () => {
    const evil = aircraftListToCsv([ac({ callsign: "=cmd|' /C calc'!A0" })], { exportedAt: NOW });
    expect(evil).toContain(",'=cmd");
    const many = Array.from({ length: LIST_MAX_ROWS + 10 }, (_, i) => ac({ hex: String(i) }));
    const csv = aircraftListToCsv(many, { exportedAt: NOW });
    expect(csv.trimEnd().split("\n")).toHaveLength(4 + LIST_MAX_ROWS);
    expect(csv).toContain("first " + LIST_MAX_ROWS + " of " + (LIST_MAX_ROWS + 10) + " rows");
  });

  it("names the file safely from the time", () => {
    expect(aircraftListFilename(NOW)).toBe("skydeck-aircraft-20261110-1405.csv");
  });
});

describe("trailToKml", () => {
  const meta: TrailExportMeta = {
    callsign: "UAL<1>",
    registration: null,
    hex: "a1b2c3",
    exportedAt: NOW,
  };
  const trail = [
    { lat: 40.1, lon: -74.1, t: 2000, altFt: 10000, gs: 300, vRate: 0, onGround: false },
    { lat: 40.0, lon: -74.0, t: 1000, altFt: null, gs: 280, vRate: 0, onGround: false },
  ] as never;

  it("writes one line in time order, longitude first, altitude in metres, and escapes the name", () => {
    const kml = trailToKml(trail, meta);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain("UAL&lt;1&gt;");
    const coords = kml.split("<coordinates>")[1]!.split("</coordinates>")[0]!.trim().split(/\s+/);
    expect(coords).toEqual(["-74.00000,40.00000,0.0", "-74.10000,40.10000,3048.0"]);
    expect(kml).toContain("<altitudeMode>absolute</altitudeMode>");
    expect(kml).toMatch(/community ADS-B data/);
  });

  it("names the file with a kml extension", () => {
    expect(trailFilename(meta, "kml")).toBe("skydeck-trail-UAL-1-20261110-1405.kml");
  });
});

describe("clean view shortcut", () => {
  it("has a K shortcut that is not used by anything else", () => {
    expect(actionForKey({ key: "k", ctrlKey: false, metaKey: false, altKey: false })).toBe("kiosk");
    expect(SHORTCUTS.filter((s) => s.key === "k")).toHaveLength(1);
  });

  it("is what Escape leaves first", () => {
    expect(
      escapeTarget({ kiosk: true, ruler: true, aircraft: true, nearby: false, airport: false }),
    ).toBe("kiosk");
    expect(escapeTarget({ ruler: true, aircraft: true, nearby: false, airport: false })).toBe(
      "ruler",
    );
    expect(
      escapeTarget({ kiosk: false, ruler: false, aircraft: false, nearby: false, airport: false }),
    ).toBeNull();
  });
});
