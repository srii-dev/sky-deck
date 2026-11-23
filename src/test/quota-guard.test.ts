import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getJson,
  loadFeedCached,
  resetAdsbSourceState,
  QUOTA_STALE_MAX_MS,
} from "@/lib/adsb-sources";
import { QuotaGuard, type QuotaLimits } from "@/lib/quota-guard";

const limits: QuotaLimits = {
  sliding: [{ ms: 10_000, max: 3 }],
  perDay: 5,
  perWeek: 100,
  perMonth: 1000,
};
const T0 = Date.UTC(2026, 10, 23, 12, 0, 0); // a Monday

describe("QuotaGuard", () => {
  it("stops at a sliding limit and recovers when the window passes", () => {
    const g = new QuotaGuard(limits);
    expect([0, 1, 2, 3].map((i) => g.take(T0 + i))).toEqual([true, true, true, false]);
    expect(g.take(T0 + 10_001)).toBe(true);
  });

  it("stops at the daily limit and starts again at 00:00 UTC", () => {
    const g = new QuotaGuard(limits);
    for (let i = 0; i < 5; i++) expect(g.take(T0 + i * 20_000)).toBe(true);
    expect(g.take(T0 + 200_000)).toBe(false);
    expect(g.take(Date.UTC(2026, 10, 24, 0, 0, 1))).toBe(true);
  });

  it("keeps its count across a save and restore", () => {
    const g = new QuotaGuard(limits);
    for (let i = 0; i < 5; i++) g.take(T0 + i * 20_000);
    const again = new QuotaGuard(limits, g.snapshot());
    expect(again.canSend(T0 + 200_000)).toBe(false);
  });
});

describe("adsb.lol key quota in the feed", () => {
  beforeEach(() => {
    process.env["ADSBLOL_API_KEY"] = "test-key";
    resetAdsbSourceState();
  });
  afterEach(() => {
    delete process.env["ADSBLOL_API_KEY"];
    resetAdsbSourceState();
  });

  const ok = () =>
    new Response(JSON.stringify({ ac: [{ hex: "abc123", lat: 1, lon: 2, flight: "T1" }] }), {
      status: 200,
    });

  it("does not send a request once the key's per-30-second limit is used up", async () => {
    let sent = 0;
    const fetchImpl = (async () => {
      sent++;
      return ok();
    }) as unknown as typeof fetch;
    const now = () => T0;
    const url = "https://api.adsb.lol/v2/point/1/2/50";
    for (let i = 0; i < 17; i++) await getJson(url, 1000, { fetchImpl, now });
    await expect(getJson(url, 1000, { fetchImpl, now })).rejects.toMatchObject({ status: 429 });
    expect(sent).toBe(17);
  });

  it("does not count other hosts, and counts nothing without a key", async () => {
    const fetchImpl = (async () => ok()) as unknown as typeof fetch;
    const now = () => T0;
    for (let i = 0; i < 30; i++)
      await getJson("https://api.airplanes.live/v2/point/1/2/50", 1000, { fetchImpl, now });
    delete process.env["ADSBLOL_API_KEY"];
    resetAdsbSourceState();
    for (let i = 0; i < 30; i++)
      await getJson("https://api.adsb.lol/v2/point/1/2/50", 1000, { fetchImpl, now });
  });

  it("answers from an older copy, up to ten minutes old, while the quota is used up", async () => {
    let sent = 0;
    const fetchImpl = (async () => {
      sent++;
      return ok();
    }) as unknown as typeof fetch;
    let t = T0;
    const deps = { fetchImpl, now: () => t, paceGapMs: 0 };
    const first = await loadFeedCached(1, 2, 50, deps);
    expect(first.aircraft).toHaveLength(1);
    // Use up the 30-second limit with other calls, then ask again after the copy's 5 s lifetime.
    for (let i = 0; i < 16; i++) await getJson("https://api.adsb.lol/v2/hex/x", 1000, deps);
    t += 20_000 - 1;
    const sentBefore = sent;
    const second = await loadFeedCached(1, 2, 50, deps);
    expect(second.error).toBeUndefined();
    expect(second.aircraft).toHaveLength(1);
    expect(sent).toBe(sentBefore);
    // Ten minutes on the 30-second window is clear again, so the feed refreshes from upstream.
    t += QUOTA_STALE_MAX_MS;
    await loadFeedCached(1, 2, 50, deps);
    expect(sent).toBe(sentBefore + 1);
  });
});
