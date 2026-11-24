import { prune, type CacheEntry } from "./request-control";

/*
 * A short memory of aircraft search answers, so a repeated query does not spend upstream requests (one search
 * can cost up to three). Per server instance. A 6-character hex is how the app follows a selected aircraft that
 * is outside the feed, so it is kept only as long as a feed tile; other queries (callsign, registration) for longer.
 */

export const SEARCH_TTL_MS = 45_000;
export const HEX_SEARCH_TTL_MS = 5_000;
const MAX_ENTRIES = 500;

export const searchTtl = (q: string): number =>
  /^[0-9A-F]{6}$/.test(q) ? HEX_SEARCH_TTL_MS : SEARCH_TTL_MS;

export function createSearchCache<T extends { busy?: boolean; error?: string }>() {
  const cache = new Map<string, CacheEntry<T>>();
  return {
    get(q: string, now: number): T | null {
      const hit = cache.get(q);
      return hit && now - hit.at < searchTtl(q) ? hit.value : null;
    },
    /** Stores real answers (empty ones too); a busy or failed answer says nothing about the query. */
    set(q: string, value: T, now: number) {
      if (value.busy || value.error) return;
      prune(cache, SEARCH_TTL_MS, MAX_ENTRIES - 1, now);
      cache.set(q, { at: now, value });
    },
    size: () => cache.size,
  };
}
