import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sanitizeRecentFlights,
  sanitizeWatchlist,
  type RecentFlight,
  type WatchItem,
} from "./watchlist";

/*
 * Reading and writing the signed-in user's watchlist and recent flights in Supabase (Phase 5g). The tables have
 * row-level security, so every call only ever sees the signed-in user's own rows. The browser uses the public anon
 * key plus the user's session; nothing here needs a secret. Every function returns a result instead of throwing:
 * a failed save must never break the page, it only leaves the lists on this device.
 */

export interface CloudResult<T> {
  ok: boolean;
  data: T;
}

const fail = <T>(data: T): CloudResult<T> => ({ ok: false, data });

export async function fetchCloudLists(
  sb: SupabaseClient,
): Promise<CloudResult<{ watch: WatchItem[]; recent: RecentFlight[] }>> {
  try {
    const [w, r] = await Promise.all([
      sb
        .from("watchlist_items")
        .select("kind,key,label,added_at")
        .order("added_at", { ascending: false })
        .limit(50),
      sb
        .from("recent_flights")
        .select("hex,callsign,registration,type,viewed_at")
        .order("viewed_at", { ascending: false })
        .limit(15),
    ]);
    if (w.error || r.error) return fail({ watch: [], recent: [] });
    const watch = sanitizeWatchlist(
      (w.data ?? []).map((row) => ({
        kind: row.kind,
        key: row.key,
        label: row.label,
        addedAt: Date.parse(String(row.added_at)),
      })),
    );
    const recent = sanitizeRecentFlights(
      (r.data ?? []).map((row) => ({
        hex: row.hex,
        callsign: row.callsign,
        registration: row.registration,
        type: row.type,
        viewedAt: Date.parse(String(row.viewed_at)),
      })),
    );
    return { ok: true, data: { watch, recent } };
  } catch {
    return fail({ watch: [], recent: [] });
  }
}

export async function upsertWatchItems(
  sb: SupabaseClient,
  userId: string,
  items: readonly WatchItem[],
): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const { error } = await sb.from("watchlist_items").upsert(
      items.map((w) => ({
        user_id: userId,
        kind: w.kind,
        key: w.key,
        label: w.label,
        added_at: new Date(w.addedAt > 0 ? w.addedAt : Date.now()).toISOString(),
      })),
      { onConflict: "user_id,kind,key" },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function deleteWatchItem(
  sb: SupabaseClient,
  kind: string,
  key: string,
): Promise<boolean> {
  try {
    const { error } = await sb.from("watchlist_items").delete().eq("kind", kind).eq("key", key);
    return !error;
  } catch {
    return false;
  }
}

export async function upsertRecentFlights(
  sb: SupabaseClient,
  userId: string,
  items: readonly RecentFlight[],
): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const { error } = await sb.from("recent_flights").upsert(
      items.map((r) => ({
        user_id: userId,
        hex: r.hex,
        callsign: r.callsign,
        registration: r.registration,
        type: r.type,
        viewed_at: new Date(r.viewedAt > 0 ? r.viewedAt : Date.now()).toISOString(),
      })),
      { onConflict: "user_id,hex" },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function clearRecentFlightsInCloud(sb: SupabaseClient): Promise<boolean> {
  try {
    // A filter is required by the API; this matches every one of the user's own rows.
    const { error } = await sb.from("recent_flights").delete().neq("hex", "");
    return !error;
  } catch {
    return false;
  }
}
