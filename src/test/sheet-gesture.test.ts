import { describe, expect, it } from "vitest";

import { sheetGesture, SWIPE_MIN_PX } from "@/lib/sheet-gesture";

describe("sheetGesture", () => {
  it("treats a swipe up as expand and a swipe down as collapse", () => {
    expect(sheetGesture(400, 400 - SWIPE_MIN_PX)).toBe("expand");
    expect(sheetGesture(400, 300)).toBe("expand");
    expect(sheetGesture(400, 400 + SWIPE_MIN_PX)).toBe("collapse");
    expect(sheetGesture(300, 500)).toBe("collapse");
  });

  it("treats small movement as a tap", () => {
    expect(sheetGesture(400, 400)).toBe("tap");
    expect(sheetGesture(400, 400 - SWIPE_MIN_PX + 1)).toBe("tap");
    expect(sheetGesture(400, 400 + SWIPE_MIN_PX - 1)).toBe("tap");
    expect(sheetGesture(400, Number.NaN)).toBe("tap");
  });
});
