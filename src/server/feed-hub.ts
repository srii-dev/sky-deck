import { DurableObject } from "cloudflare:workers";

import type { FeedResponse } from "../lib/aircraft";
import { loadFeedCached } from "../lib/adsb-sources";

/*
 * The shared feed cache (18f, 19h). One global Durable Object runs the feed loader, so its tile cache, the
 * provider pacing, the shared in-flight requests and the refresh budget are the same for every visitor and every
 * Worker instance, instead of one copy per isolate. Workers reach it through `loadFeedShared`
 * (src/lib/feed-hub.server.ts). Exported from the Worker entry by src/server/exports.cloudflare.ts.
 */
export class FeedHub extends DurableObject {
  async load(lat: number, lon: number, radiusNm: number): Promise<FeedResponse> {
    return loadFeedCached(lat, lon, radiusNm);
  }
}
