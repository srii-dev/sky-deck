/*
 * Watchlist and recently viewed flights (Phase 5a, 5c). Kept in this browser (localStorage); signed-in
 * visitors also sync them to their account (Phase 5g, src/lib/cloud-data.ts). Pure functions plus a storage layer
 * that never throws.
 */

export type WatchKind = "flight" | "aircraft" | "airport";

export interface WatchItem {
  kind: WatchKind;
  /** Normalised identity: callsign (upper case), ICAO hex (lower case) or airport ICAO code (upper case). */
  key: string;
  /** Text to show, for example "UAL123", "N123AB" or "John F. Kennedy Intl". */
  label: string;
  addedAt: number;
}

export const WATCHLIST_KEY = "skydeck:watchlist";
export const RECENT_FLIGHTS_KEY = "skydeck:recent-flights";
export const MAX_WATCH_ITEMS = 50;
export const MAX_RECENT_FLIGHTS = 15;
export const MAX_LABEL_LENGTH = 60;

export function normalizeKey(kind: WatchKind, raw: string): string {
  const s = raw.trim();
  if (kind === "aircraft") return s.toLowerCase();
  // Callsigns and airport codes are letters and digits only; anything else is dropped.
  let out = "";
  for (const ch of s.toUpperCase()) {
    if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) out += ch;
  }
  return out;
}

function validKey(kind: WatchKind, key: string): boolean {
  if (kind === "aircraft") {
    if (key.length !== 6) return false;
    for (const ch of key) if (!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f"))) return false;
    return true;
  }
  if (kind === "flight") return key.length >= 3 && key.length <= 10;
  return key.length >= 3 && key.length <= 4;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isKind = (v: unknown): v is WatchKind =>
  v === "flight" || v === "aircraft" || v === "airport";

function cleanLabel(label: string, fallback: string): string {
  const t = label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
  return t || fallback;
}

/** Keep only well-formed items from stored or downloaded data; duplicates are dropped. */
export function sanitizeWatchlist(raw: unknown): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WatchItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const kind = v["kind"];
    if (!isKind(kind) || typeof v["key"] !== "string") continue;
    const key = normalizeKey(kind, v["key"]);
    if (!validKey(kind, key) || seen.has(kind + ":" + key)) continue;
    seen.add(kind + ":" + key);
    out.push({
      kind,
      key,
      label: cleanLabel(typeof v["label"] === "string" ? v["label"] : "", key),
      addedAt: finite(v["addedAt"]) ? v["addedAt"] : 0,
    });
    if (out.length >= MAX_WATCH_ITEMS) break;
  }
  return out;
}

export function isWatched(list: readonly WatchItem[], kind: WatchKind, rawKey: string): boolean {
  const key = normalizeKey(kind, rawKey);
  return list.some((w) => w.kind === kind && w.key === key);
}

/** Add an item (newest first). Null when the key is not valid or the list is full. */
export function addWatch(
  list: readonly WatchItem[],
  kind: WatchKind,
  rawKey: string,
  label: string,
  now: number,
): WatchItem[] | null {
  const key = normalizeKey(kind, rawKey);
  if (!validKey(kind, key)) return null;
  if (isWatched(list, kind, key)) return [...list];
  if (list.length >= MAX_WATCH_ITEMS) return null;
  return [{ kind, key, label: cleanLabel(label, key), addedAt: now }, ...list];
}

export function removeWatch(
  list: readonly WatchItem[],
  kind: WatchKind,
  rawKey: string,
): WatchItem[] {
  const key = normalizeKey(kind, rawKey);
  return list.filter((w) => !(w.kind === kind && w.key === key));
}

/** Watched items that match an aircraft: its flight (callsign) or the airframe (hex). */
export function watchMatches(
  list: readonly WatchItem[],
  a: { hex: string; callsign: string | null },
): WatchItem[] {
  const hex = a.hex.toLowerCase();
  const cs = a.callsign ? normalizeKey("flight", a.callsign) : "";
  return list.filter(
    (w) =>
      (w.kind === "aircraft" && w.key === hex) ||
      (w.kind === "flight" && cs !== "" && w.key === cs),
  );
}

// ---------- recently viewed flights ----------

export interface RecentFlight {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  viewedAt: number;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

export function sanitizeRecentFlights(raw: unknown): RecentFlight[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentFlight[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const hex = typeof v["hex"] === "string" ? normalizeKey("aircraft", v["hex"]) : "";
    if (!validKey("aircraft", hex) || seen.has(hex)) continue;
    seen.add(hex);
    out.push({
      hex,
      callsign: text(v["callsign"], 12),
      registration: text(v["registration"], 12),
      type: text(v["type"], 8),
      viewedAt: finite(v["viewedAt"]) ? v["viewedAt"] : 0,
    });
    if (out.length >= MAX_RECENT_FLIGHTS) break;
  }
  return out;
}

/** Put a viewed flight first, replacing an older entry for the same airframe. */
export function addRecentFlight(
  list: readonly RecentFlight[],
  a: { hex: string; callsign: string | null; registration: string | null; type: string | null },
  now: number,
): RecentFlight[] {
  const hex = normalizeKey("aircraft", a.hex);
  if (!validKey("aircraft", hex)) return [...list];
  const rest = list.filter((r) => r.hex !== hex);
  const entry: RecentFlight = {
    hex,
    callsign: text(a.callsign, 12),
    registration: text(a.registration, 12),
    type: text(a.type, 8),
    viewedAt: now,
  };
  return [entry, ...rest].slice(0, MAX_RECENT_FLIGHTS);
}

export function recentFlightLabel(
  r: Pick<RecentFlight, "hex" | "callsign" | "registration">,
): string {
  return r.callsign ?? r.registration ?? r.hex.toUpperCase();
}

// ---------- storage ----------

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full: the lists still work for this visit */
  }
}

export const loadWatchlist = (): WatchItem[] => sanitizeWatchlist(read(WATCHLIST_KEY));
export const storeWatchlist = (list: readonly WatchItem[]): void => write(WATCHLIST_KEY, list);
export const loadRecentFlights = (): RecentFlight[] =>
  sanitizeRecentFlights(read(RECENT_FLIGHTS_KEY));
export const storeRecentFlights = (list: readonly RecentFlight[]): void =>
  write(RECENT_FLIGHTS_KEY, list);
