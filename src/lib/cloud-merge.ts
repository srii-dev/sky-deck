import {
  MAX_RECENT_FLIGHTS,
  MAX_WATCH_ITEMS,
  type RecentFlight,
  type WatchItem,
} from "./watchlist";

/*
 * Merging this browser's lists with the ones saved in the account (Phase 5g). On sign-in the two are united:
 * nothing is lost on either side. A removal made on another device while this one was signed out comes back
 * (a union cannot tell "removed" from "never had"); while signed in, additions and removals are written to the
 * account straight away, so they stay in step.
 */

const watchId = (w: Pick<WatchItem, "kind" | "key">) => w.kind + ":" + w.key;

export interface WatchMerge {
  merged: WatchItem[];
  /** Items the account does not have yet and that fit under its limit. */
  toUpload: WatchItem[];
  /**
   * Items from this browser that the account had no room for (newest first). The account's list is the one kept,
   * because the database refuses an upload that would take it over the limit: uploading more than fits would fail
   * as a whole and save nothing.
   */
  didNotFit: WatchItem[];
}

export function mergeWatchlists(
  local: readonly WatchItem[],
  remote: readonly WatchItem[],
): WatchMerge {
  const byId = new Map<string, WatchItem>();
  for (const w of remote) byId.set(watchId(w), w);
  const fresh = new Map<string, WatchItem>();
  for (const w of local) {
    const id = watchId(w);
    const have = byId.get(id);
    // The earlier addedAt wins, so the "added on" date stays stable across devices.
    if (have) {
      if (w.addedAt > 0 && w.addedAt < have.addedAt) byId.set(id, { ...have, addedAt: w.addedAt });
    } else if (!fresh.has(id)) fresh.set(id, w);
  }
  const room = Math.max(0, MAX_WATCH_ITEMS - byId.size);
  const newestFirst = (a: WatchItem, b: WatchItem) => b.addedAt - a.addedAt;
  const candidates = [...fresh.values()].sort(newestFirst);
  const toUpload = candidates.slice(0, room);
  const didNotFit = candidates.slice(room);
  const merged = [...byId.values(), ...toUpload].sort(newestFirst).slice(0, MAX_WATCH_ITEMS);
  return { merged, toUpload, didNotFit };
}

export interface RecentMerge {
  merged: RecentFlight[];
  toUpload: RecentFlight[];
}

export function mergeRecentFlights(
  local: readonly RecentFlight[],
  remote: readonly RecentFlight[],
): RecentMerge {
  const byHex = new Map<string, RecentFlight>();
  for (const r of remote) byHex.set(r.hex, r);
  const remoteAt = new Map(remote.map((r) => [r.hex, r.viewedAt]));
  for (const r of local) {
    const have = byHex.get(r.hex);
    if (!have || r.viewedAt > have.viewedAt) byHex.set(r.hex, r);
  }
  const merged = [...byHex.values()]
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_RECENT_FLIGHTS);
  const keep = new Set(merged.map((r) => r.hex));
  // Upload what the account does not have or has an older view time for.
  const toUpload = merged.filter(
    (r) => keep.has(r.hex) && (remoteAt.get(r.hex) ?? -1) < r.viewedAt,
  );
  return { merged, toUpload };
}
