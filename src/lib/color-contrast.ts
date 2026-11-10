/*
 * Colour maths for the contrast check of the themes (Phase 15c): reads the oklch() colours of the style sheet, turns
 * them into sRGB and computes the WCAG contrast ratio. Pure functions, used by a test, not by the page.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** "oklch(0.82 0.16 75)" or "oklch(0.17 0.02 240 / 0.86)"; null for anything else. */
export function parseOklch(text: string): Oklch | null {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    text.trim(),
  );
  if (!m) return null;
  const alphaRaw = m[4];
  const alpha =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith("%")
        ? parseFloat(alphaRaw) / 100
        : parseFloat(alphaRaw);
  return { l: parseFloat(m[1]!), c: parseFloat(m[2]!), h: parseFloat(m[3]!), alpha };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Linear sRGB (0 to 1 per channel) of an oklch colour, clipped to the gamut. */
export function oklchToLinearSrgb(c: Oklch): [number, number, number] {
  const hr = (c.h * Math.PI) / 180;
  const a = c.c * Math.cos(hr);
  const b = c.c * Math.sin(hr);
  const l_ = c.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = c.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = c.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG relative luminance of an oklch colour. */
export function luminance(c: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The custom properties of one CSS rule, for example the block after ":root {" or ".light {". */
export function cssVariables(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector + " {");
  if (start < 0) return {};
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close < 0 ? undefined : close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
