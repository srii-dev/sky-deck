import type { FeedResponse } from "./aircraft";
import { loadFeedCached } from "./adsb-sources";

/*
 * Route feed loads through the shared FeedHub Durable Object (src/server/feed-hub.ts) when the Worker has the
 * FEED_HUB binding. Without it (dev server, tests, the CI worker build) or when the call fails, the feed is
 * loaded in this instance as before, so a Durable Object problem never takes the map down.
 */

interface FeedHubStub {
  load(lat: number, lon: number, radiusNm: number): Promise<FeedResponse>;
}
interface FeedHubNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): FeedHubStub;
}

/** One object for the whole site: every visitor shares its cache and request budget. */
const HUB_NAME = "global";

function feedHub(): FeedHubStub | null {
  // Nitro's Cloudflare entry puts the Worker env (bindings included) here on every request.
  const ns = (globalThis as { __env__?: { FEED_HUB?: FeedHubNamespace } }).__env__?.FEED_HUB;
  if (!ns || typeof ns.idFromName !== "function") return null;
  return ns.get(ns.idFromName(HUB_NAME));
}

export async function loadFeedShared(
  lat: number,
  lon: number,
  radiusNm: number,
  local: typeof loadFeedCached = loadFeedCached,
): Promise<FeedResponse> {
  const hub = feedHub();
  if (hub) {
    try {
      return await hub.load(lat, lon, radiusNm);
    } catch {
      // Fall back to this instance; the next request tries the shared object again.
    }
  }
  return local(lat, lon, radiusNm);
}
