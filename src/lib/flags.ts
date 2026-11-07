/*
 * Feature flags (Phase 21j). Unfinished features ship switched off so a half-phase branch can be
 * merged into `dev` without changing what visitors see.
 *
 * Order, later wins: the defaults below, then the build-time list (VITE_FLAGS), then the list a
 * tester stored in this browser (localStorage key "skydeck.flags").
 * A list is comma- or space-separated names. A leading "-" switches a flag off ("-labs").
 * Unknown names are ignored. Flags are not a security boundary: anyone can set the stored list.
 */

/** Every flag with its default. Add a flag here before using it. */
export const FLAG_DEFAULTS = {
  /** Experimental features that are not ready for everyone. */
  labs: false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;
export type FlagMap = Record<FlagName, boolean>;

export const FLAGS_STORAGE_KEY = "skydeck.flags";

/** Parse "a, b -c" into on and off name sets. */
export function parseFlagList(text: string | null | undefined): {
  on: Set<string>;
  off: Set<string>;
} {
  const on = new Set<string>();
  const off = new Set<string>();
  for (const raw of (text ?? "").split(/[\s,]+/)) {
    if (!raw) continue;
    if (raw.startsWith("-")) off.add(raw.slice(1));
    else on.add(raw);
  }
  return { on, off };
}

/** Apply each list in order on top of the defaults. */
export function resolveFlags(...lists: Array<string | null | undefined>): FlagMap {
  const result: FlagMap = { ...FLAG_DEFAULTS };
  for (const list of lists) {
    const { on, off } = parseFlagList(list);
    for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
      if (on.has(name)) result[name] = true;
      if (off.has(name)) result[name] = false;
    }
  }
  return result;
}

function buildFlags(): string | undefined {
  const v = import.meta.env?.["VITE_FLAGS"] as unknown;
  return typeof v === "string" ? v : undefined;
}

function storedFlags(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(FLAGS_STORAGE_KEY);
  } catch {
    return null; // private windows and blocked storage
  }
}

/** Flags as the server and the first browser render see them (no browser storage). */
export function serverFlags(): FlagMap {
  return resolveFlags(buildFlags());
}

/** Flags in the browser, including the tester's stored list. */
export function browserFlags(): FlagMap {
  return resolveFlags(buildFlags(), storedFlags());
}
