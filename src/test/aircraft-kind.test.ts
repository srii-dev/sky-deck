import { describe, expect, it } from "vitest";
import { classifyAircraft, keepUprightWithoutHeading } from "@/lib/aircraft-kind";
import { glideRatioBounds } from "@/lib/glide-ring";

describe("aircraft category sorting", () => {
  it("uses the ADS-B emitter category first", () => {
    expect(classifyAircraft("A5", "B738").kind).toBe("widebody");
    expect(classifyAircraft("A7", null).kind).toBe("helicopter");
    expect(classifyAircraft("B2", null).kind).toBe("balloon");
  });
  it("maps emitter category codes to expected kinds for mock fixture", () => {
    expect(classifyAircraft("B2", null).kind).toBe("balloon");
    expect(classifyAircraft("B6", null).kind).toBe("drone");
    expect(classifyAircraft("C1", null).kind).toBe("ground");
    expect(classifyAircraft("B1", null).kind).toBe("glider");
    expect(classifyAircraft("A1", null).kind).toBe("light");
    expect(classifyAircraft("A3", null).kind).toBe("narrowbody");
  });
  it("verifies glideRatioBounds is null for exempt categories (balloon, drone, ground)", () => {
    expect(glideRatioBounds("balloon")).toBeNull();
    expect(glideRatioBounds("drone")).toBeNull();
    expect(glideRatioBounds("ground")).toBeNull();
    expect(glideRatioBounds("glider")).not.toBeNull();
    expect(glideRatioBounds("light")).not.toBeNull();
    expect(glideRatioBounds("narrowbody")).not.toBeNull();
  });
  it("falls back to the type code when the category is missing", () => {
    expect(classifyAircraft(null, "B738").kind).toBe("narrowbody");
    expect(classifyAircraft("A0", "A388").kind).toBe("widebody");
    expect(classifyAircraft(null, "R44").kind).toBe("helicopter");
  });
  it("uses the generic icon when neither is recognised", () => {
    expect(classifyAircraft(null, null).kind).toBe("generic");
    expect(classifyAircraft(null, "ZZZZ").kind).toBe("generic");
  });
  it("keeps only balloons and helicopters upright without heading", () => {
    expect(keepUprightWithoutHeading("balloon")).toBe(true);
    expect(keepUprightWithoutHeading("helicopter")).toBe(true);
    expect(keepUprightWithoutHeading("narrowbody")).toBe(false);
  });
});
