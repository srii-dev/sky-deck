/*
 * Local settings and saved data (Phase 22i, 22l, 22m): every key SkyDeck stores in this browser, small
 * yes/no preferences, the reset, and the poll interval that the battery saver changes. Nothing here
 * leaves the browser. Storage is a parameter so tests can use a fake.
 */
import { FLAGS_STORAGE_KEY } from "./flags";
import { RECENT_SEARCHES_KEY } from "./search-rank";
import { SAVED_VIEWS_KEY } from "./saved-views";
import { ALERT_RULES_KEY } from "./alert-rules";
import { COLLECTION_KEY } from "./collection";
import { COLOR_MODE_KEY } from "./airline-colors";
import { NOTIFY_KEY } from "./notify-prefs";
import { THEME_KEY } from "./theme";
import { FLIGHT_STAGES_KEY } from "./flight-stage";
import { RECENT_FLIGHTS_KEY, WATCHLIST_KEY } from "./watchlist";

export const STORAGE_KEYS = {
  units: "skydeck:units",
  basemap: "skydeck:basemap",
  /** The last map position, written by the map. */
  view: "skydeck:view",
  layers: "skydeck:layers",
  savedViews: SAVED_VIEWS_KEY,
  recentSearches: RECENT_SEARCHES_KEY,
  flags: FLAGS_STORAGE_KEY,
  batterySaver: "skydeck:battery-saver",
  /** Smooth (default) or live aircraft motion; stored as "false" for live. */
  smoothMotion: "skydeck:smooth-motion",
  shortcuts: "skydeck:shortcuts",
  guideSeen: "skydeck:guide-seen",
  watchlist: WATCHLIST_KEY,
  recentFlights: RECENT_FLIGHTS_KEY,
  alertRules: ALERT_RULES_KEY,
  flightStages: FLIGHT_STAGES_KEY,
  collection: COLLECTION_KEY,
  /** Page theme: dark (default), light or system. */
  theme: THEME_KEY,
  /** Day and night shading on the map (default off). */
  night: "skydeck:night",
  /** Which in-app messages may be shown (Phase 22i). */
  notify: NOTIFY_KEY,
  /** Aircraft colour: altitude (default) or airline. */
  colorBy: COLOR_MODE_KEY,
  /** Alerts for watched items (default on). */
  watchAlerts: "skydeck:watch-alerts",
} as const;

/** Every key the reset removes. */
export const LOCAL_DATA_KEYS: readonly string[] = Object.values(STORAGE_KEYS);

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage
  }
}

/** A stored yes/no ("1" or "0"); the fallback when nothing valid is stored or storage is blocked. */
export function readFlagPref(
  key: string,
  fallback: boolean,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    const v = storage?.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* blocked storage */
  }
  return fallback;
}

export function writeFlagPref(
  key: string,
  value: boolean,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(key, value ? "1" : "0");
  } catch {
    /* private window or full storage: the choice lasts until the page closes */
  }
}

/** Remove everything SkyDeck stored. Returns how many keys held a value. */
export function clearLocalData(storage: StorageLike | null = defaultStorage()): number {
  if (!storage) return 0;
  let removed = 0;
  for (const key of LOCAL_DATA_KEYS) {
    try {
      if (storage.getItem(key) !== null) removed += 1;
      storage.removeItem(key);
    } catch {
      /* keep going: one blocked key should not stop the rest */
    }
  }
  return removed;
}

/** Aircraft refresh interval. The battery saver asks the server about half as often. */
export const POLL_NORMAL_MS = 7000;
export const POLL_SAVER_MS = 15_000;

export function pollIntervalMs(batterySaver: boolean): number {
  return batterySaver ? POLL_SAVER_MS : POLL_NORMAL_MS;
}
