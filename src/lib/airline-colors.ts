/*
 * Colour by airline (Phase 24b): every airline code gets its own steady colour, picked by a hash of the code. These are
 * plain colours, not airline liveries (those are trademarks): two flights of one airline look alike, different airlines
 * mostly differ, and aircraft with no airline code (private and military callsigns) are grey. Pure functions.
 */
import { airlineCode } from "./aircraft";

export type ColorMode = "altitude" | "airline";

export const COLOR_MODE_KEY = "skydeck:color-by";
export const COLOR_MODES: readonly ColorMode[] = ["altitude", "airline"];
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  altitude: "Altitude",
  airline: "Airline",
};

export function normalizeColorMode(raw: unknown): ColorMode {
  return raw === "airline" ? "airline" : "altitude";
}

/** Aircraft with no airline code in their callsign. */
export const NO_AIRLINE_COLOR = "#9aa5b1";

/** FNV-1a, 32 bits: small, steady and well spread for short strings. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

/** The colour of an airline code such as "UAL". */
export function colorForAirline(code: string): string {
  const h = hash(code.toUpperCase());
  // Hue from the hash; lightness and saturation vary a little so neighbouring hues still tell apart.
  const hue = h % 360;
  const light = 0.58 + ((h >>> 9) % 3) * 0.06;
  const sat = 0.62 + ((h >>> 12) % 3) * 0.1;
  return hslToHex(hue, sat, light);
}

/** The colour for a callsign, or the grey for none. */
export function airlineColor(callsign: string | null): string {
  const code = airlineCode(callsign);
  return code ? colorForAirline(code) : NO_AIRLINE_COLOR;
}
