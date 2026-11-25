import { describe, expect, it } from "vitest";
import { metersPerPixel, needsRedraw, type DrawnPlane } from "@/lib/redraw-gate";

const plane = (over: Partial<DrawnPlane> = {}): DrawnPlane => ({
  lon: -73.95,
  lat: 40.72,
  track: 90,
  fade: 1,
  alt: 12000,
  look: "SKD101|narrowbody|#fff|0|0",
  ...over,
});
const one = (p: DrawnPlane) => new Map([["a1", p]]);

describe("metersPerPixel", () => {
  it("matches MapLibre's scale at the equator and halves per zoom level", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
    expect(metersPerPixel(60, 0)).toBeCloseTo(metersPerPixel(0, 0) / 2, 3);
  });
});

describe("needsRedraw", () => {
  const mpp = metersPerPixel(40.72, 8.3); // about 190 m per pixel at the default view

  it("draws the first frame and any change in which aircraft are shown", () => {
    expect(needsRedraw(null, one(plane()), mpp)).toBe(true);
    expect(needsRedraw(one(plane()), new Map(), mpp)).toBe(true);
    expect(needsRedraw(one(plane()), new Map([["b2", plane()]]), mpp)).toBe(true);
  });

  it("skips a frame where nothing visibly changed", () => {
    expect(needsRedraw(one(plane()), one(plane()), mpp)).toBe(false);
  });

  it("skips sub-pixel movement but draws once it adds up", () => {
    // An airliner at 450 kt covers about 21 m in one 90 ms tick: a tenth of a pixel here.
    const step = 21 / 111320 / Math.cos((40.72 * Math.PI) / 180);
    expect(needsRedraw(one(plane()), one(plane({ lon: -73.95 + step })), mpp)).toBe(false);
    expect(needsRedraw(one(plane()), one(plane({ lon: -73.95 + step * 10 })), mpp)).toBe(true);
    // The same 21 m is several pixels when zoomed in close.
    expect(
      needsRedraw(one(plane()), one(plane({ lon: -73.95 + step })), metersPerPixel(40.72, 15)),
    ).toBe(true);
  });

  it("draws turns, fades, altitude and look changes past their thresholds", () => {
    expect(needsRedraw(one(plane()), one(plane({ track: 90.5 })), mpp)).toBe(false);
    expect(needsRedraw(one(plane()), one(plane({ track: 93 })), mpp)).toBe(true);
    expect(needsRedraw(one(plane({ track: 359.6 })), one(plane({ track: 0.2 })), mpp)).toBe(false);
    expect(needsRedraw(one(plane({ track: 359 })), one(plane({ track: 1 })), mpp)).toBe(true);
    expect(needsRedraw(one(plane()), one(plane({ fade: 0.99 })), mpp)).toBe(false);
    expect(needsRedraw(one(plane()), one(plane({ fade: 0.9 })), mpp)).toBe(true);
    expect(needsRedraw(one(plane()), one(plane({ alt: 12100 })), mpp)).toBe(false);
    expect(needsRedraw(one(plane()), one(plane({ alt: 12500 })), mpp)).toBe(true);
    expect(needsRedraw(one(plane()), one(plane({ look: "SKD101|narrowbody|#fff|1|0" })), mpp)).toBe(
      true,
    );
  });
});
