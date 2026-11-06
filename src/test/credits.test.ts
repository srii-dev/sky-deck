import { describe, expect, it } from "vitest";
import { AIRFRAMES_ATTRIBUTION } from "@/lib/airframes-client";
import { CREDIT_GROUPS, CREDITS, CREDITS_DISCLAIMER } from "@/lib/credits";

const byId = (id: string) => {
  const e = CREDITS.find((c) => c.id === id);
  if (!e) throw new Error(`missing credit ${id}`);
  return e;
};

describe("credits data", () => {
  it("has unique ids and complete entries", () => {
    expect(new Set(CREDITS.map((c) => c.id)).size).toBe(CREDITS.length);
    for (const c of CREDITS) {
      expect(c.name.trim()).not.toBe("");
      expect(c.usedFor.trim()).not.toBe("");
      expect(c.credit.trim()).not.toBe("");
      expect(c.licence.trim()).not.toBe("");
      expect(c.links.length).toBeGreaterThan(0);
    }
  });

  it("uses only known groups, and every group has an entry", () => {
    for (const c of CREDITS) expect(CREDIT_GROUPS).toContain(c.group);
    for (const g of CREDIT_GROUPS) expect(CREDITS.some((c) => c.group === g)).toBe(true);
  });

  it("links are https, have labels, and are not duplicated within an entry", () => {
    for (const c of CREDITS) {
      const hrefs = c.links.map((l) => l.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const l of c.links) {
        expect(l.label.trim()).not.toBe("");
        expect(new URL(l.href).protocol).toBe("https:");
      }
    }
  });

  it("carries the attribution wording each source asks for", () => {
    expect(byId("airframes").credit).toBe(AIRFRAMES_ATTRIBUTION);
    expect(byId("esri").credit).toBe(
      "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
    );
    expect(byId("openfreemap").credit).toMatch(/OpenFreeMap/);
    expect(byId("openfreemap").credit).toMatch(/OpenMapTiles/);
    expect(byId("openfreemap").credit).toMatch(/OpenStreetMap/);
    expect(byId("terrain").credit).toMatch(/USGS/);
    expect(byId("terrain").links.map((l) => l.href)).toContain(
      "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
    );
  });

  it("credits only the sources the app actually uses (OpenSky was removed)", () => {
    const text = JSON.stringify(CREDITS).toLowerCase();
    expect(text).not.toContain("opensky");
    expect(text).not.toContain("maxar");
  });

  it("states that the app is not for navigation", () => {
    expect(CREDITS_DISCLAIMER).toMatch(/not for navigation/i);
  });
});
