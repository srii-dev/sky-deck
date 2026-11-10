import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthApi } from "@/hooks/use-auth";
import {
  clearRecentFlightsInCloud,
  deleteWatchItem,
  fetchCloudLists,
  upsertRecentFlights,
  upsertWatchItems,
} from "@/lib/cloud-data";
import { mergeRecentFlights, mergeWatchlists } from "@/lib/cloud-merge";
import { getSupabase } from "@/lib/supabase-client";
import {
  addRecentFlight,
  addWatch,
  isWatched,
  loadRecentFlights,
  loadWatchlist,
  normalizeKey,
  removeWatch,
  storeRecentFlights,
  storeWatchlist,
  type RecentFlight,
  type WatchItem,
  type WatchKind,
} from "@/lib/watchlist";

/*
 * The watchlist and recently viewed flights (Phase 5a, 5c, 5g). They live in this browser; when the visitor is
 * signed in they are also kept in their account. On sign-in the browser's lists and the account's lists are united
 * once, then every change is written to both. A failed save to the account leaves the list on this device and
 * marks the sync as "error"; the next sign-in merges again.
 */

export type SyncStatus = "off" | "syncing" | "synced" | "error";

export interface PersonalData {
  watch: WatchItem[];
  recent: RecentFlight[];
  sync: SyncStatus;
  isWatching(kind: WatchKind, key: string): boolean;
  /** Add or remove. Returns "added", "removed" or "full" (the list has its maximum of items) or "invalid". */
  toggleWatch(
    kind: WatchKind,
    key: string,
    label: string,
  ): "added" | "removed" | "full" | "invalid";
  removeWatchItem(kind: WatchKind, key: string): void;
  addRecent(a: {
    hex: string;
    callsign: string | null;
    registration: string | null;
    type: string | null;
  }): void;
  clearRecent(): void;
  /** Re-read the lists from this browser's storage (after "Delete my saved data"). */
  reload(): void;
}

export function usePersonalData(auth: AuthApi): PersonalData {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [recent, setRecent] = useState<RecentFlight[]>([]);
  const [sync, setSync] = useState<SyncStatus>("off");
  const watchRef = useRef(watch);
  const recentRef = useRef(recent);
  watchRef.current = watch;
  recentRef.current = recent;
  const userIdRef = useRef<string | null>(null);
  const syncedForRef = useRef<string | null>(null);
  userIdRef.current = auth.status === "signed-in" ? auth.userId : null;

  const reload = useCallback(() => {
    setWatch(loadWatchlist());
    setRecent(loadRecentFlights());
  }, []);
  // Read this browser's lists after the first render (not during server rendering).
  useEffect(() => reload(), [reload]);

  const setWatchBoth = useCallback((next: WatchItem[]) => {
    setWatch(next);
    storeWatchlist(next);
  }, []);
  const setRecentBoth = useCallback((next: RecentFlight[]) => {
    setRecent(next);
    storeRecentFlights(next);
  }, []);

  // Unite this browser's lists with the account's, once per sign-in.
  useEffect(() => {
    if (auth.status !== "signed-in" || !auth.userId) {
      if (auth.status === "signed-out") {
        syncedForRef.current = null;
        setSync("off");
      }
      return;
    }
    if (syncedForRef.current === auth.userId) return;
    const userId = auth.userId;
    syncedForRef.current = userId;
    let cancelled = false;
    setSync("syncing");
    void (async () => {
      const sb = await getSupabase();
      if (!sb || cancelled) return;
      const remote = await fetchCloudLists(sb);
      if (cancelled) return;
      if (!remote.ok) {
        syncedForRef.current = null;
        setSync("error");
        return;
      }
      const w = mergeWatchlists(loadWatchlist(), remote.data.watch);
      const r = mergeRecentFlights(loadRecentFlights(), remote.data.recent);
      setWatchBoth(w.merged);
      setRecentBoth(r.merged);
      const [a, b] = await Promise.all([
        upsertWatchItems(sb, userId, w.toUpload),
        upsertRecentFlights(sb, userId, r.toUpload),
      ]);
      if (!cancelled) setSync(a && b ? "synced" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.userId, setWatchBoth, setRecentBoth]);

  const withCloud = useCallback(
    async (
      fn: (sbUser: {
        sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>;
        userId: string;
      }) => Promise<boolean>,
    ) => {
      const userId = userIdRef.current;
      if (!userId || syncedForRef.current !== userId) return;
      const sb = await getSupabase();
      if (!sb) return;
      const ok = await fn({ sb, userId });
      setSync(ok ? "synced" : "error");
    },
    [],
  );

  const toggleWatch = useCallback<PersonalData["toggleWatch"]>(
    (kind, key, label) => {
      const list = watchRef.current;
      if (isWatched(list, kind, key)) {
        setWatchBoth(removeWatch(list, kind, key));
        void withCloud(({ sb }) => deleteWatchItem(sb, kind, normalizeKey(kind, key)));
        return "removed";
      }
      const next = addWatch(list, kind, key, label, Date.now());
      if (!next) return list.length >= 50 ? "full" : "invalid";
      setWatchBoth(next);
      const added = next[0];
      if (added) void withCloud(({ sb, userId }) => upsertWatchItems(sb, userId, [added]));
      return "added";
    },
    [setWatchBoth, withCloud],
  );

  const removeWatchItem = useCallback<PersonalData["removeWatchItem"]>(
    (kind, key) => {
      setWatchBoth(removeWatch(watchRef.current, kind, key));
      void withCloud(({ sb }) => deleteWatchItem(sb, kind, normalizeKey(kind, key)));
    },
    [setWatchBoth, withCloud],
  );

  const addRecent = useCallback<PersonalData["addRecent"]>(
    (a) => {
      const next = addRecentFlight(recentRef.current, a, Date.now());
      setRecentBoth(next);
      const first = next[0];
      if (first) void withCloud(({ sb, userId }) => upsertRecentFlights(sb, userId, [first]));
    },
    [setRecentBoth, withCloud],
  );

  const clearRecent = useCallback(() => {
    setRecentBoth([]);
    void withCloud(({ sb }) => clearRecentFlightsInCloud(sb));
  }, [setRecentBoth, withCloud]);

  const isWatching = useCallback<PersonalData["isWatching"]>(
    (kind, key) => isWatched(watch, kind, key),
    [watch],
  );

  return {
    watch,
    recent,
    sync,
    isWatching,
    toggleWatch,
    removeWatchItem,
    addRecent,
    clearRecent,
    reload,
  };
}
