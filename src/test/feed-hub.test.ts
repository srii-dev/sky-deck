import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedResponse } from "@/lib/aircraft";
import { loadFeedShared } from "@/lib/feed-hub.server";

const g = globalThis as { __env__?: unknown };
const answer = (tag: string) => ({ aircraft: [], tag }) as unknown as FeedResponse;

describe("loadFeedShared", () => {
  afterEach(() => {
    delete g.__env__;
  });

  it("loads locally when there is no FEED_HUB binding", async () => {
    const local = vi.fn(async () => answer("local"));
    expect(await loadFeedShared(1, 2, 75, local)).toEqual(answer("local"));
    expect(local).toHaveBeenCalledWith(1, 2, 75);
  });

  it("asks the one shared object and does not load locally", async () => {
    const load = vi.fn(async () => answer("hub"));
    const idFromName = vi.fn((n: string) => "id:" + n);
    const get = vi.fn(() => ({ load }));
    g.__env__ = { FEED_HUB: { idFromName, get } };
    const local = vi.fn(async () => answer("local"));
    expect(await loadFeedShared(1, 2, 75, local)).toEqual(answer("hub"));
    expect(idFromName).toHaveBeenCalledWith("global");
    expect(get).toHaveBeenCalledWith("id:global");
    expect(load).toHaveBeenCalledWith(1, 2, 75);
    expect(local).not.toHaveBeenCalled();
  });

  it("falls back to a local load when the shared object fails", async () => {
    g.__env__ = {
      FEED_HUB: {
        idFromName: () => "id",
        get: () => ({
          load: async () => {
            throw new Error("down");
          },
        }),
      },
    };
    const local = vi.fn(async () => answer("local"));
    expect(await loadFeedShared(1, 2, 75, local)).toEqual(answer("local"));
  });
});
