import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedResponse } from "@/lib/aircraft";
import { freshQuotaState, type QuotaState } from "@/lib/quota-guard";
import { FeedHub } from "@/server/feed-hub";

import { fakeCtx } from "./server-do-fake";

/* The FeedHub Durable Object: it keeps the adsb.lol quota counter across restarts, and writes it only when it moved. */

const src = vi.hoisted(() => ({
  count: 0,
  loadFeedCached: vi.fn(),
  restoreQuota: vi.fn(),
}));

vi.mock("@/lib/adsb-sources", () => ({
  loadFeedCached: src.loadFeedCached,
  restoreQuota: src.restoreQuota,
  quotaSnapshot: (): QuotaState => ({
    ...freshQuotaState(),
    recent: Array.from({ length: src.count }, (_, i) => i),
    month: { key: "2026-11", count: src.count },
  }),
}));

const feed = (tag: string) => ({ aircraft: [], tag }) as unknown as FeedResponse;

describe("FeedHub", () => {
  beforeEach(() => {
    src.count = 0;
    src.loadFeedCached.mockReset();
    src.restoreQuota.mockReset();
  });

  it("restores the saved quota counter when the object starts", async () => {
    const saved: QuotaState = { ...freshQuotaState(), month: { key: "2026-11", count: 42 } };
    const ctx = fakeCtx({ quota: saved });
    new FeedHub(ctx as never, {});
    await ctx.ready;
    expect(src.restoreQuota).toHaveBeenCalledWith(saved);
  });

  it("starts fresh when nothing was saved", async () => {
    const ctx = fakeCtx();
    new FeedHub(ctx as never, {});
    await ctx.ready;
    expect(src.restoreQuota).not.toHaveBeenCalled();
  });

  it("passes the request through and saves the quota only when a request was counted", async () => {
    const ctx = fakeCtx();
    const hub = new FeedHub(ctx as never, {});
    await ctx.ready;
    src.loadFeedCached.mockImplementation(async () => {
      src.count += 1;
      return feed("fresh");
    });
    expect(await hub.load(40.6, -73.8, 75)).toEqual(feed("fresh"));
    expect(src.loadFeedCached).toHaveBeenCalledWith(40.6, -73.8, 75);
    expect(ctx.writes).toHaveLength(1);
    expect(ctx.writes[0]!.key).toBe("quota");
    expect((ctx.data.get("quota") as QuotaState).month.count).toBe(1);

    // A cache hit counts nothing: no write.
    src.loadFeedCached.mockImplementation(async () => feed("cached"));
    expect(await hub.load(40.6, -73.8, 75)).toEqual(feed("cached"));
    expect(ctx.writes).toHaveLength(1);

    src.loadFeedCached.mockImplementation(async () => {
      src.count += 1;
      return feed("again");
    });
    await hub.load(40.6, -73.8, 75);
    expect(ctx.writes).toHaveLength(2);
    expect((ctx.data.get("quota") as QuotaState).month.count).toBe(2);
  });

  it("saves the counter on the first load even when it is still zero, and only the counter", async () => {
    const ctx = fakeCtx();
    const hub = new FeedHub(ctx as never, {});
    await ctx.ready;
    src.loadFeedCached.mockResolvedValue({
      aircraft: [{ hex: "abc123", callsign: "UAL1" }],
    } as unknown as FeedResponse);
    await hub.load(1, 2, 3);
    expect(ctx.writes.map((w) => w.key)).toEqual(["quota"]);
    expect(JSON.stringify(ctx.writes)).not.toContain("abc123");
  });

  it("does not save when loading fails", async () => {
    const ctx = fakeCtx();
    const hub = new FeedHub(ctx as never, {});
    await ctx.ready;
    src.loadFeedCached.mockRejectedValue(new Error("upstream down"));
    await expect(hub.load(1, 2, 3)).rejects.toThrow("upstream down");
    expect(ctx.writes).toHaveLength(0);
  });
});
