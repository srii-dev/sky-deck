/*
 * Message choices (Phase 22i): which kinds of in-app messages (toasts) the page may show. Nothing here sends a
 * notification outside the page; these are the messages shown while the page is open. The master switch for alerts
 * in the Watchlist dialog still turns the alert kinds off at once. Pure functions plus plain storage helpers.
 */

export const NOTIFY_KEY = "skydeck:notify";

export interface NotifyPrefs {
  /** Takeoff, landing and emergency squawk of watched flights, aircraft and airports. */
  watch: boolean;
  /** Stage changes of tracked flights (cruising, descending, on approach, arrived). */
  stages: boolean;
  /** Aircraft that start to match one of your alert rules. */
  rules: boolean;
  /** Achievements unlocked and daily challenges completed. */
  achievements: boolean;
}

export const NOTIFY_KINDS: readonly { key: keyof NotifyPrefs; label: string; hint: string }[] = [
  {
    key: "watch",
    label: "Watched items",
    hint: "Takeoff, landing and emergency squawk of what you watch",
  },
  { key: "stages", label: "Tracked flights", hint: "Cruising, descending, on approach, arrived" },
  { key: "rules", label: "Alert rules", hint: "An aircraft starts to match one of your rules" },
  {
    key: "achievements",
    label: "Achievements",
    hint: "Unlocked achievements and finished challenges",
  },
];

export const DEFAULT_NOTIFY: NotifyPrefs = {
  watch: true,
  stages: true,
  rules: true,
  achievements: true,
};

/** Keep only booleans for known keys; anything else (and anything missing) falls back to on. */
export function sanitizeNotify(raw: unknown): NotifyPrefs {
  const out: NotifyPrefs = { ...DEFAULT_NOTIFY };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const v = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_NOTIFY) as (keyof NotifyPrefs)[]) {
    if (typeof v[k] === "boolean") out[k] = v[k] as boolean;
  }
  return out;
}

export function loadNotify(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    return raw ? sanitizeNotify(JSON.parse(raw) as unknown) : { ...DEFAULT_NOTIFY };
  } catch {
    return { ...DEFAULT_NOTIFY };
  }
}

export function storeNotify(p: NotifyPrefs): void {
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked or full */
  }
}
