import { describe, expect, it } from "vitest";

import { createKeyedLimiter } from "@/lib/rate-limit";
import { createSearchCache, HEX_SEARCH_TTL_MS, SEARCH_TTL_MS } from "@/lib/search-cache";

describe("search cache", () => {
  it("keeps real answers, empty ones too, for the query's lifetime", () => {
    const c = createSearchCache<{ aircraft: number[]; busy?: boolean; error?: string }>();
    c.set("UAL123", { aircraft: [1] }, 0);
    c.set("NOPE", { aircraft: [] }, 0);
    expect(c.get("UAL123", SEARCH_TTL_MS - 1)).toEqual({ aircraft: [1] });
    expect(c.get("NOPE", 1000)).toEqual({ aircraft: [] });
    expect(c.get("UAL123", SEARCH_TTL_MS)).toBeNull();
  });

  it("keeps a hex answer only as long as a feed tile, so a followed aircraft stays fresh", () => {
    const c = createSearchCache<{ busy?: boolean }>();
    c.set("A1B2C3", {}, 0);
    expect(c.get("A1B2C3", HEX_SEARCH_TTL_MS - 1)).not.toBeNull();
    expect(c.get("A1B2C3", HEX_SEARCH_TTL_MS)).toBeNull();
  });

  it("does not keep busy or failed answers, and stays bounded", () => {
    const c = createSearchCache<{ busy?: boolean; error?: string }>();
    c.set("A", { busy: true }, 0);
    c.set("B", { error: "x" }, 0);
    expect(c.size()).toBe(0);
    for (let i = 0; i < 2000; i++) c.set("Q" + i, {}, i);
    expect(c.size()).toBeLessThanOrEqual(500);
  });
});

describe("feed limit sizing", () => {
  // Mirrors the limiter in adsb.functions.ts: 240 a minute.
  it("lets one visitor poll 6 tiles every 7 s (plus a burst of pans) without being limited", () => {
    const l = createKeyedLimiter({ max: 240, windowMs: 60_000 });
    let refused = 0;
    for (let t = 0; t < 10 * 60_000; t += 7000) {
      for (let tile = 0; tile < 6; tile++) if (!l.allow("v", t + tile * 150).ok) refused++;
    }
    expect(refused).toBe(0);
  });

  it("refuses a client hammering far beyond that", () => {
    const l = createKeyedLimiter({ max: 240, windowMs: 60_000 });
    let refused = 0;
    for (let i = 0; i < 1000; i++) if (!l.allow("v", i * 10).ok) refused++;
    expect(refused).toBe(760);
  });
});
