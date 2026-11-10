import { describe, expect, it } from "vitest";

import { ICON_SVG, LEGEND_SHAPES } from "@/components/skydeck/aircraft-icons";
import { iconShape, iconShapeCached, SHAPE_LABELS } from "@/lib/aircraft-shape";
import { classifyAircraft } from "@/lib/aircraft-kind";

const shapeOf = (type: string, cat: string | null = null) =>
  iconShape(classifyAircraft(cat, type).kind, type);

describe("iconShape", () => {
  it("does not mistake a Cessna 172 or 177 for a C-17 Globemaster", () => {
    expect(classifyAircraft(null, "C172").kind).toBe("light");
    expect(classifyAircraft(null, "C177").kind).toBe("light");
    expect(classifyAircraft(null, "C17").kind).toBe("widebody");
  });

  it("draws four-engine heavies with four engines and twins with two", () => {
    for (const t of ["B744", "B748", "A388", "A346", "A124", "C17", "IL76"])
      expect(shapeOf(t)).toBe("quad");
    for (const t of ["B77W", "B789", "A359", "A333", "B763"]) expect(shapeOf(t)).toBe("widebody");
  });

  it("gives rear-engine jets and turboprops their own shape", () => {
    for (const t of ["CRJ9", "E145", "MD88", "B712", "F100"]) expect(shapeOf(t)).toBe("regional");
    for (const t of ["AT76", "DH8D", "SF34", "C130", "B190"]) expect(shapeOf(t)).toBe("turboprop");
    // Underwing regional jets and plain narrowbodies are not rear-engine.
    expect(shapeOf("E190")).toBe("narrowbody");
    expect(shapeOf("B738")).toBe("narrowbody");
  });

  it("does not turn single-engine light aircraft into turboprops", () => {
    expect(shapeOf("C172")).toBe("light");
    expect(shapeOf("PC12")).toBe("light");
    expect(shapeOf("TBM9")).toBe("light");
  });

  it("only draws fighters for aircraft with no category, never a Superjet", () => {
    expect(shapeOf("F16")).toBe("fighter");
    expect(shapeOf("EUFI")).toBe("fighter");
    expect(shapeOf("SU95")).toBe("narrowbody");
    // The feed's own category wins over the type code.
    expect(iconShape("light", "F16")).toBe("light");
  });

  it("keeps the category when there is no type, and the generic plane for unknowns", () => {
    expect(iconShape("widebody", null)).toBe("widebody");
    expect(iconShape("generic", undefined)).toBe("generic");
    expect(iconShape("generic", "ZZZZ")).toBe("generic");
    expect(iconShapeCached("widebody", "B744")).toBe("quad");
    expect(iconShapeCached("widebody", "B744")).toBe("quad");
  });

  it("has a drawing and a label for every shape the legend lists", () => {
    for (const s of LEGEND_SHAPES) {
      expect(ICON_SVG[s]).toContain("<");
      expect(SHAPE_LABELS[s].length).toBeGreaterThan(2);
    }
  });
});
