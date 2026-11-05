import { describe, expect, it } from "vitest";
import { DATA_CREDITS, DATA_DISCLAIMER } from "@/config/credits";

describe("data credits configuration", () => {
  it("contains an entry for each required source with valid https URLs", () => {
    expect(DATA_CREDITS.length).toBeGreaterThanOrEqual(6);

    for (const credit of DATA_CREDITS) {
      expect(credit.url).toMatch(/^https:\/\//);
      expect(credit.name.trim().length).toBeGreaterThan(0);
      expect(credit.label.trim().length).toBeGreaterThan(0);
    }

    const adsb = DATA_CREDITS.find((c) => c.name === "adsb.lol");
    expect(adsb).toBeDefined();
    expect(adsb?.note).toContain("ODbL 1.0");

    const airplanesLive = DATA_CREDITS.find((c) => c.name === "airplanes.live");
    expect(airplanesLive).toBeDefined();

    const openSky = DATA_CREDITS.find((c) => c.name === "OpenSky Network");
    expect(openSky).toBeDefined();

    const osm = DATA_CREDITS.find((c) => c.name.includes("OpenStreetMap"));
    expect(osm).toBeDefined();

    const esri = DATA_CREDITS.find((c) => c.name === "Esri");
    expect(esri).toBeDefined();

    const terrain = DATA_CREDITS.find(
      (c) => c.name.includes("Terrain") || c.name.includes("Mapzen"),
    );
    expect(terrain).toBeDefined();
  });

  it("defines the standard community data disclaimer", () => {
    expect(DATA_DISCLAIMER).toBe(
      "Community data. Positions may be delayed or incomplete. Educational estimates only. Not for operational or safety use.",
    );
  });
});

