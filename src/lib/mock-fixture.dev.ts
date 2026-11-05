import type { Aircraft } from "./aircraft";
import { classifyAircraft } from "./aircraft-kind";

export const MOCK_FIXTURE_MARKER = "MOCK_FIXTURE_MARKER_SKYDECK_DEV_ONLY";

export function generateDevMockAircraft(centreLat: number, centreLon: number): Aircraft[] {
  const configs = [
    { cat: "B2", offsetLat: 0.05, offsetLon: 0.05, altFt: 12000, gs: 15, track: 80 }, // balloon (exempt)
    { cat: "B6", offsetLat: -0.05, offsetLon: 0.05, altFt: 8500, gs: 60, track: 190 }, // drone (exempt)
    { cat: "C1", offsetLat: 0.04, offsetLon: -0.06, altFt: 8000, gs: 25, track: 0 }, // ground vehicle (exempt)
    { cat: "B1", offsetLat: -0.04, offsetLon: -0.05, altFt: 14000, gs: 75, track: 320 }, // glider (control)
    { cat: "A1", offsetLat: 0.08, offsetLon: 0.0, altFt: 9500, gs: 130, track: 120 }, // light (control)
    { cat: "A3", offsetLat: -0.08, offsetLon: 0.0, altFt: 28000, gs: 450, track: 250 }, // narrowbody (control)
  ];

  return configs.map((c, i) => {
    const info = classifyAircraft(c.cat, null);
    const hex = `mock-${c.cat.toLowerCase()}-${i + 1}`;
    return {
      hex,
      callsign: null,
      registration: null,
      type: null,
      description: null,
      operator: null,
      category: c.cat,
      lat: centreLat + c.offsetLat,
      lon: centreLon + c.offsetLon,
      altFt: c.altFt,
      gs: c.gs,
      track: c.track,
      vRate: 0,
      squawk: null,
      onGround: false,
      seenPos: 1,
      source: "mock",
      kind: info.kind,
      kindLabel: info.label,
    };
  });
}
