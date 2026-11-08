/*
 * Keyboard shortcuts (Phase 22j). Pure decisions only: which key means which action, when a key
 * press must be ignored, which aircraft comes next, and what Escape closes. The listener is in
 * src/hooks/use-shortcuts.ts and the help sheet in ShortcutsDialog.tsx.
 *
 * All shortcuts are single characters, so they can be switched off in Settings (WCAG 2.1.4), and
 * none of them uses the arrow keys, + or -, which the map keeps for panning and zooming.
 */
import type { Aircraft } from "./aircraft";

export const SEARCH_INPUT_ID = "skydeck-search";

export type ShortcutAction =
  | "search"
  | "help"
  | "close"
  | "next"
  | "previous"
  | "terrain"
  | "trail"
  | "trail3d"
  | "glide"
  | "ruler"
  | "settings";

export interface ShortcutDef {
  action: ShortcutAction;
  /** The event.key value, lower case. */
  key: string;
  /** What the help sheet shows on the key cap. */
  cap: string;
  label: string;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { action: "search", key: "/", cap: "/", label: "Search flights and airports" },
  { action: "next", key: "n", cap: "N", label: "Select the next aircraft" },
  { action: "previous", key: "p", cap: "P", label: "Select the previous aircraft" },
  { action: "close", key: "escape", cap: "Esc", label: "Close the ruler, aircraft or airport" },
  { action: "terrain", key: "t", cap: "T", label: "Toggle 3D terrain and buildings" },
  { action: "trail", key: "r", cap: "R", label: "Toggle the aircraft trail" },
  { action: "trail3d", key: "3", cap: "3", label: "Toggle the 3D trail" },
  { action: "glide", key: "g", cap: "G", label: "Toggle the glide range ring" },
  { action: "ruler", key: "m", cap: "M", label: "Measure distance and bearing" },
  { action: "settings", key: ",", cap: ",", label: "Open settings" },
  { action: "help", key: "?", cap: "?", label: "Show this list" },
];

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

/** The action for a key press, or null. Combinations with Ctrl, Cmd or Alt are the browser's. */
export function actionForKey(e: KeyLike): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.isComposing || e.repeat) {
    return null;
  }
  const key = e.key.toLowerCase();
  return SHORTCUTS.find((s) => s.key === key)?.action ?? null;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when the key press belongs to a text field, so a shortcut must not fire. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  return el.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]') !== null;
}

/** True while a dialog, alert dialog, menu or popover is open: keys then belong to that overlay. */
export function overlayOpen(root: ParentNode): boolean {
  return (
    root.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
    ) !== null
  );
}

function sortKey(a: Aircraft): string {
  return (a.callsign ?? a.registration ?? a.hex).trim().toUpperCase();
}

/**
 * The next or previous aircraft in callsign order (registration or hex when there is no callsign),
 * wrapping around. The order does not depend on where the aircraft are, so it stays put while they
 * move. With nothing selected, "next" gives the first and "previous" the last.
 */
export function stepAircraft(
  list: readonly Aircraft[],
  currentHex: string | null,
  direction: 1 | -1,
): Aircraft | null {
  if (list.length === 0) return null;
  const sorted = [...list].sort(
    (a, b) => sortKey(a).localeCompare(sortKey(b)) || a.hex.localeCompare(b.hex),
  );
  const i = currentHex ? sorted.findIndex((a) => a.hex === currentHex) : -1;
  if (i === -1) return direction === 1 ? sorted[0]! : sorted[sorted.length - 1]!;
  return sorted[(i + direction + sorted.length) % sorted.length]!;
}

export type EscapeTarget = "ruler" | "aircraft" | "nearby" | "airport";

/** What Escape closes first: the ruler, then the aircraft, then the nearby list, then the airport. */
export function escapeTarget(state: {
  ruler: boolean;
  aircraft: boolean;
  nearby: boolean;
  airport: boolean;
}): EscapeTarget | null {
  if (state.ruler) return "ruler";
  if (state.aircraft) return "aircraft";
  if (state.nearby) return "nearby";
  if (state.airport) return "airport";
  return null;
}
