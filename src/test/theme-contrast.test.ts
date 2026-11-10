import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { contrastRatio, cssVariables, parseOklch } from "@/lib/color-contrast";
import {
  applyTheme,
  normalizeThemePref,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_KEY,
} from "@/lib/theme";

// The tests run from the project folder.
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Text pairs: body text must reach WCAG AA (4.5), large or bold text and interface parts 3. */
const TEXT_PAIRS: [fg: string, bg: string, min: number][] = [
  ["--foreground", "--background", 4.5],
  ["--card-foreground", "--card", 4.5],
  ["--popover-foreground", "--popover", 4.5],
  ["--secondary-foreground", "--secondary", 4.5],
  ["--muted-foreground", "--background", 4.5],
  ["--muted-foreground", "--muted", 4.5],
  ["--primary-foreground", "--primary", 4.5],
  ["--accent-foreground", "--accent", 4.5],
  ["--destructive-foreground", "--destructive", 4.5],
  // Coloured text and rings on the page background.
  ["--primary", "--background", 4.5],
  ["--accent", "--background", 3],
  ["--destructive", "--background", 3],
  ["--success", "--background", 3],
  ["--ring", "--background", 3],
];

for (const [name, selector] of [
  ["dark", ":root"],
  ["light", ".light"],
] as const) {
  describe(name + " theme contrast", () => {
    const vars = {
      ...cssVariables(css, ":root"),
      ...(name === "light" ? cssVariables(css, ".light") : {}),
    };
    for (const [fg, bg, min] of TEXT_PAIRS) {
      it(fg + " on " + bg + " is at least " + min + ":1", () => {
        const a = parseOklch(vars[fg] ?? "");
        const b = parseOklch(vars[bg] ?? "");
        expect(a, selector + " " + fg).not.toBeNull();
        expect(b, selector + " " + bg).not.toBeNull();
        expect(contrastRatio(a!, b!)).toBeGreaterThanOrEqual(min);
      });
    }
  });
}

describe("contrast maths", () => {
  it("is 21 for black on white and 1 for the same colour", () => {
    const black = parseOklch("oklch(0 0 0)")!;
    const white = parseOklch("oklch(1 0 0)")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("reads colours with and without an alpha", () => {
    expect(parseOklch("oklch(0.17 0.02 240 / 0.86)")?.alpha).toBeCloseTo(0.86);
    expect(parseOklch("oklch(0.5 0.1 20)")?.alpha).toBe(1);
    expect(parseOklch("#fff")).toBeNull();
  });
});

describe("theme choice", () => {
  it("defaults to dark and accepts only known values", () => {
    expect(normalizeThemePref(null)).toBe("dark");
    expect(normalizeThemePref("purple")).toBe("dark");
    expect(normalizeThemePref("light")).toBe("light");
    expect(normalizeThemePref("system")).toBe("system");
  });

  it("follows the system only when asked to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("puts the light class and colour scheme on the page", () => {
    const calls: [string, boolean | undefined][] = [];
    const root = {
      classList: { toggle: (n: string, f?: boolean) => void calls.push([n, f]) },
      style: { colorScheme: "" },
    };
    applyTheme(root, "light");
    expect(calls).toEqual([["light", true]]);
    expect(root.style.colorScheme).toBe("light");
    applyTheme(root, "dark");
    expect(calls[1]).toEqual(["light", false]);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("has a startup script that reads the saved key and never throws", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch(e)");
    // It must run without the page: a fake document and storage.
    const classes = new Set<string>(["light"]);
    const doc = {
      documentElement: {
        classList: {
          toggle: (n: string, f: boolean) => (f ? classes.add(n) : classes.delete(n)),
        },
        style: { colorScheme: "" },
      },
    };
    const run = (stored: string | null, systemDark: boolean) => {
      new Function("localStorage", "document", "matchMedia", THEME_INIT_SCRIPT)(
        { getItem: () => stored },
        doc,
        () => ({ matches: systemDark }),
      );
      return [classes.has("light"), doc.documentElement.style.colorScheme];
    };
    expect(run(null, false)).toEqual([false, "dark"]);
    expect(run("light", true)).toEqual([true, "light"]);
    expect(run("system", false)).toEqual([true, "light"]);
    expect(run("system", true)).toEqual([false, "dark"]);
  });
});
