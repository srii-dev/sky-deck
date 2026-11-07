import { describe, expect, it } from "vitest";
import { LAST_GOOD_MAX_MS, lastGoodUsable } from "@/lib/aircraft";

describe("last good data during an outage", () => {
  it("keeps showing aircraft for LAST_GOOD_MAX_MS after the last good fetch", () => {
    expect(lastGoodUsable(0)).toBe(true);
    expect(lastGoodUsable(30_000)).toBe(true);
    expect(lastGoodUsable(LAST_GOOD_MAX_MS)).toBe(true);
  });

  it("stops showing aircraft once the data is too old", () => {
    expect(lastGoodUsable(LAST_GOOD_MAX_MS + 1)).toBe(false);
  });

  it("treats a missing or future timestamp as unusable", () => {
    expect(lastGoodUsable(null)).toBe(false);
    expect(lastGoodUsable(-1)).toBe(false);
  });
});
