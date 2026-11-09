import { useCallback, useSyncExternalStore } from "react";

import {
  applyTheme,
  normalizeThemePref,
  resolveTheme,
  THEME_KEY,
  type ResolvedTheme,
  type ThemePref,
} from "@/lib/theme";

/*
 * The page theme (Phase 15c). One small store shared by every component, so the settings dialog and the toast
 * area agree. The server and the first client render say "dark"; the saved choice is read right after.
 */

let pref: ThemePref = "dark";
let systemDark = true;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function update() {
  applyTheme(document.documentElement, resolveTheme(pref, systemDark));
  emit();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    pref = normalizeThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    pref = "dark";
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  systemDark = mq.matches;
  mq.addEventListener("change", (e) => {
    systemDark = e.matches;
    update();
  });
  update();
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
} {
  const p = useSyncExternalStore(
    subscribe,
    () => pref,
    () => "dark" as ThemePref,
  );
  const dark = useSyncExternalStore(
    subscribe,
    () => systemDark,
    () => true,
  );
  const setPref = useCallback((next: ThemePref) => {
    pref = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked or full: the choice lasts until the page closes */
    }
    update();
  }, []);
  return { pref: p, resolved: resolveTheme(p, dark), setPref };
}
