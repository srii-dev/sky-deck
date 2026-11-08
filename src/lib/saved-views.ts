/*
 * Saved map views (Phase 22e): named views kept in this browser (localStorage). Pure functions plus
 * a thin storage layer that never throws. Signed-in sync comes with Phase 18d.
 */

export interface SavedView {
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  pitch?: number | undefined;
  bearing?: number | undefined;
}

export const SAVED_VIEWS_KEY = "skydeck:saved-views";
export const MAX_SAVED_VIEWS = 20;
export const MAX_NAME_LENGTH = 40;

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Keep only well-formed views from stored data. */
export function sanitizeViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedView[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const name = typeof v["name"] === "string" ? cleanName(v["name"]) : "";
    if (!name || !finite(v["lat"]) || !finite(v["lon"]) || !finite(v["zoom"])) continue;
    if (v["lat"] < -90 || v["lat"] > 90 || v["lon"] < -180 || v["lon"] > 180) continue;
    if (v["zoom"] < 0 || v["zoom"] > 22) continue;
    out.push({
      name,
      lat: v["lat"],
      lon: v["lon"],
      zoom: v["zoom"],
      ...(finite(v["pitch"]) ? { pitch: v["pitch"] } : {}),
      ...(finite(v["bearing"]) ? { bearing: v["bearing"] } : {}),
    });
    if (out.length >= MAX_SAVED_VIEWS) break;
  }
  return out;
}

/** Add or replace (same name, ignoring case) and put the newest first. Null when the name is empty. */
export function addView(list: SavedView[], view: SavedView): SavedView[] | null {
  const name = cleanName(view.name);
  if (!name) return null;
  const rest = list.filter((v) => v.name.toLowerCase() !== name.toLowerCase());
  return [{ ...view, name }, ...rest].slice(0, MAX_SAVED_VIEWS);
}

export function removeView(list: SavedView[], name: string): SavedView[] {
  return list.filter((v) => v.name !== name);
}

export function loadViews(): SavedView[] {
  try {
    const text = typeof localStorage === "undefined" ? null : localStorage.getItem(SAVED_VIEWS_KEY);
    return text ? sanitizeViews(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function storeViews(list: SavedView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(list));
  } catch {
    /* private window or full storage: the list simply does not persist */
  }
}
