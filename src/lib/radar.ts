/*
 * Precipitation radar (Phase 7a, 7b) from the RainViewer public weather-maps API.
 *
 * Checked on 2026-11-08: https://api.rainviewer.com/public/weather-maps.json answers with CORS open
 * (access-control-allow-origin: *) and lists about 13 past frames, 10 minutes apart; `nowcast` was empty, so
 * there are no forecast frames and none are shown. Tiles are 256 px PNG at
 * {host}{path}/256/{z}/{x}/{y}/{color}/{options}.png, up to zoom 7, and also CORS open.
 * Terms (read on the API page, 2026-11-08): free for personal and educational use only; no availability
 * guarantee; the page asks for the source to be named with a link to https://www.rainviewer.com/.
 * The browser calls RainViewer directly (so every visitor has their own request budget) because the data is
 * public map imagery and not stored or republished by SkyDeck.
 */

export const RADAR_INDEX_URL = "https://api.rainviewer.com/public/weather-maps.json";
export const RADAR_ATTRIBUTION_URL = "https://www.rainviewer.com/";
/** RainViewer serves tiles up to this zoom; the map stretches them beyond it. */
export const RADAR_MAX_ZOOM = 7;
export const RADAR_REFRESH_MS = 2 * 60 * 1000;
/** Time between frames while playing. */
export const RADAR_FRAME_MS = 700;
/** Pause on the newest frame before the loop restarts. */
export const RADAR_LOOP_PAUSE_MS = 1500;

export interface RadarFrame {
  /** Frame time, ms since the epoch. */
  time: number;
  /** Path as given by the API, for example "/v2/radar/6c3ab271238e". */
  path: string;
}

export interface RadarIndex {
  host: string;
  /** Past frames, oldest first. */
  frames: RadarFrame[];
}

const PATH_PREFIX = "/v2/radar/";

function isSafeSegment(s: string): boolean {
  if (s.length === 0 || s.length > 64) return false;
  for (const ch of s) {
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9");
    if (!ok) return false;
  }
  return true;
}

/** Only https hosts that belong to rainviewer.com are accepted, so a changed answer cannot point the map elsewhere. */
export function isRainViewerHost(host: string): boolean {
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return url.hostname === "rainviewer.com" || url.hostname.endsWith(".rainviewer.com");
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function parseRadarIndex(json: unknown): RadarIndex | null {
  const root = asObject(json);
  if (!root) return null;
  const host = root["host"];
  if (typeof host !== "string" || !isRainViewerHost(host)) return null;
  const radar = asObject(root["radar"]);
  const past = radar ? radar["past"] : null;
  if (!Array.isArray(past)) return null;
  const frames: RadarFrame[] = [];
  for (const item of past) {
    const f = asObject(item);
    if (!f) continue;
    const time = f["time"];
    const path = f["path"];
    if (typeof time !== "number" || !Number.isFinite(time) || typeof path !== "string") continue;
    if (!path.startsWith(PATH_PREFIX) || !isSafeSegment(path.slice(PATH_PREFIX.length))) continue;
    frames.push({ time: time * 1000, path });
  }
  if (frames.length === 0) return null;
  frames.sort((a, b) => a.time - b.time);
  return { host: host.replace(/\/+$/, ""), frames };
}

/** Tile URL template for one frame (colour scheme 2, smoothed, snow shown in its own colours). */
export function radarTileUrl(index: RadarIndex, frame: RadarFrame): string {
  return index.host + frame.path + "/256/{z}/{x}/{y}/2/1_1.png";
}

/** "now", "12 min ago" or "1 h 5 min ago". */
export function frameAgeLabel(frameTime: number, nowMs: number): string {
  const min = Math.round((nowMs - frameTime) / 60_000);
  if (min <= 1) return "now";
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? h + " h ago" : h + " h " + m + " min ago";
}

/** Next frame index while playing, wrapping to the first frame after the last. */
export function nextFrameIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return current + 1 >= count ? 0 : current + 1;
}

/** Keep the chosen frame when the list refreshes: the same time if still there, else the newest. */
export function reselectFrame(
  oldFrames: readonly RadarFrame[],
  oldIndex: number,
  newFrames: readonly RadarFrame[],
): number {
  const chosen = oldFrames[oldIndex];
  if (chosen) {
    const at = newFrames.findIndex((f) => f.time === chosen.time);
    if (at >= 0) return at;
  }
  return Math.max(0, newFrames.length - 1);
}
