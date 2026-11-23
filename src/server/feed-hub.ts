import { DurableObject } from "cloudflare:workers";

import type { FeedResponse } from "../lib/aircraft";
import { loadFeedCached, quotaSnapshot, restoreQuota } from "../lib/adsb-sources";
import type { QuotaState } from "../lib/quota-guard";

/*
 * The shared feed cache (18f, 19h). One global Durable Object runs the feed loader, so its tile cache, the
 * provider pacing, the shared in-flight requests, the refresh budget and the adsb.lol key quota counter are the same
 * for every visitor and every Worker instance, instead of one copy per isolate. Workers reach it through
 * `loadFeedShared` (src/lib/feed-hub.server.ts). Exported from the Worker entry by src/server/exports.cloudflare.ts.
 * The quota counter is saved to the object's storage, so it survives the object being unloaded.
 */
export class FeedHub extends DurableObject {
  private savedCount = -1;

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: unknown) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const state = await ctx.storage.get<QuotaState>("quota");
      if (state) restoreQuota(state);
    });
  }

  async load(lat: number, lon: number, radiusNm: number): Promise<FeedResponse> {
    const result = await loadFeedCached(lat, lon, radiusNm);
    // Written only when a request was counted, not on every cache hit.
    const state = quotaSnapshot();
    if (state.month.count !== this.savedCount) {
      this.savedCount = state.month.count;
      await this.ctx.storage.put("quota", state);
    }
    return result;
  }
}
