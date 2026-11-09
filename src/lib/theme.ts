/*
 * Page theme (Phase 15c): dark (the default), light, or follow the system. The map styles are a separate choice and
 * are not changed by this. Pure functions; the hook and the inline script around them live elsewhere.
 */

export type ThemePref = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_KEY = "skydeck:theme";
export const THEME_PREFS: readonly ThemePref[] = ["dark", "light", "system"];
export const THEME_LABELS: Record<ThemePref, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

export function normalizeThemePref(raw: unknown): ThemePref {
  return raw === "light" || raw === "system" ? raw : "dark";
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

/** Put the theme on the page: the `light` class switches the colour variables, `colorScheme` the browser's own controls. */
export function applyTheme(
  root: {
    classList: { toggle: (name: string, force?: boolean) => unknown };
    style: { colorScheme: string };
  },
  theme: ResolvedTheme,
): void {
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

/**
 * Runs in the page head before the first paint, so a visitor who chose Light does not see a dark flash.
 * Plain ES5 on purpose; it must never throw.
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{var p=localStorage.getItem("' +
  THEME_KEY +
  '");var d=p==="light"?false:p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;' +
  'var r=document.documentElement;r.classList.toggle("light",!d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()';
