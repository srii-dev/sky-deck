/*
 * Export of the user's own saved data (Phase 22l): saved views, recent searches and settings as one
 * JSON file. Everything comes from this browser's storage; nothing is fetched or sent anywhere.
 */
import { sanitizeViews, type SavedView } from "./saved-views";
import { STORAGE_KEYS, type StorageLike } from "./local-settings";

const UNIT_VALUES = ["aviation", "metric", "imperial"];
const BASEMAP_VALUES = ["dark", "satellite", "light"];

export interface LocalDataExport {
  app: "SkyDeck";
  kind: "local-data-export";
  version: 1;
  exportedAt: string;
  note: string;
  settings: {
    units: string | null;
    basemap: string | null;
    layers: { terrain?: boolean; showTrail?: boolean; trail3d?: boolean };
    batterySaver: boolean | null;
    keyboardShortcuts: boolean | null;
    guideSeen: boolean | null;
  };
  lastMapView: { lat: number; lon: number; zoom?: number; pitch?: number; bearing?: number } | null;
  savedViews: SavedView[];
  recentSearches: string[];
}

function read(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function json(storage: StorageLike, key: string): unknown {
  const text = read(storage, key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function oneOf(value: string | null, allowed: string[]): string | null {
  return value !== null && allowed.includes(value) ? value : null;
}

function yesNo(value: string | null): boolean | null {
  return value === "1" ? true : value === "0" ? false : null;
}

export function buildLocalExport(storage: StorageLike, now: Date): LocalDataExport {
  const rawLayers = json(storage, STORAGE_KEYS.layers);
  const layers: LocalDataExport["settings"]["layers"] = {};
  if (rawLayers && typeof rawLayers === "object") {
    const l = rawLayers as Record<string, unknown>;
    if (typeof l["terrain"] === "boolean") layers.terrain = l["terrain"];
    if (typeof l["showTrail"] === "boolean") layers.showTrail = l["showTrail"];
    if (typeof l["trail3d"] === "boolean") layers.trail3d = l["trail3d"];
  }

  const rawView = json(storage, STORAGE_KEYS.view);
  let lastMapView: LocalDataExport["lastMapView"] = null;
  if (rawView && typeof rawView === "object") {
    const v = rawView as Record<string, unknown>;
    if (finite(v["lat"]) && finite(v["lon"])) {
      lastMapView = {
        lat: v["lat"],
        lon: v["lon"],
        ...(finite(v["zoom"]) ? { zoom: v["zoom"] } : {}),
        ...(finite(v["pitch"]) ? { pitch: v["pitch"] } : {}),
        ...(finite(v["bearing"]) ? { bearing: v["bearing"] } : {}),
      };
    }
  }

  const rawRecent = json(storage, STORAGE_KEYS.recentSearches);
  const recentSearches = Array.isArray(rawRecent)
    ? rawRecent.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];

  return {
    app: "SkyDeck",
    kind: "local-data-export",
    version: 1,
    exportedAt: now.toISOString(),
    note: "Everything in this file was stored only in your browser. SkyDeck has no account system and received none of it.",
    settings: {
      units: oneOf(read(storage, STORAGE_KEYS.units), UNIT_VALUES),
      basemap: oneOf(read(storage, STORAGE_KEYS.basemap), BASEMAP_VALUES),
      layers,
      batterySaver: yesNo(read(storage, STORAGE_KEYS.batterySaver)),
      keyboardShortcuts: yesNo(read(storage, STORAGE_KEYS.shortcuts)),
      guideSeen: yesNo(read(storage, STORAGE_KEYS.guideSeen)),
    },
    lastMapView,
    savedViews: sanitizeViews(json(storage, STORAGE_KEYS.savedViews)),
    recentSearches,
  };
}

export function localExportFilename(now: Date): string {
  return `skydeck-my-data-${now.toISOString().slice(0, 10)}.json`;
}
