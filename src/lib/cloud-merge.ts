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
  /** Items the account does not have yet. */
  toUpload: WatchItem[];
  /** Items beyond the limit that were left out (the oldest). */
  dropped: number;
}

export function mergeWatchlists(
  local: readonly WatchItem[],
  remote: readonly WatchItem[],
): WatchMerge {
  const byId = new Map<string, WatchItem>();
  for (const w of remote) byId.set(watchId(w), w);
  const remoteIds = new Set(byId.keys());
  for (const w of local) {
    const have = byId.get(watchId(w));
    // The earlier addedAt wins, so the "added on" date stays stable across devices.
    if (!have || (w.addedAt > 0 && w.addedAt < have.addedAt))
      byId.set(watchId(w), have ? { ...have, addedAt: w.addedAt } : w);
  }
  const all = [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
  const merged = all.slice(0, MAX_WATCH_ITEMS);
  const keptIds = new Set(merged.map(watchId));
  const toUpload = local.filter((w) => keptIds.has(watchId(w)) && !remoteIds.has(watchId(w)));
  return { merged, toUpload, dropped: all.length - merged.length };
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
