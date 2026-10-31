// Shared, browser-safe aircraft types and helpers.

export interface Aircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  description: string | null;
  operator: string | null;
  lat: number;
  lon: number;
  /** Barometric altitude in feet; null when unknown. */
  altFt: number | null;
  onGround: boolean;
  /** Ground speed in knots. */
  gs: number | null;
  /** Track / heading in degrees true. */
  track: number | null;
  /** Vertical rate in ft/min. */
  vRate: number | null;
  squawk: string | null;
  category: string | null;
  /** Seconds since last position report. */
  seenPos: number;
}

export interface FeedResponse {
  aircraft: Aircraft[];
  source: string;
  fetchedAt: number;
  error?: string;
}

export interface RouteAirport {
  iata: string | null;
  icao: string | null;
  name: string;
  location: string | null;
  lat: number;
  lon: number;
}

export interface FlightRoute {
  origin: RouteAirport;
  destination: RouteAirport;
}

export type FlightStatus = "ground" | "climbing" | "descending" | "cruising";

export const EMERGENCY_SQUAWKS: Record<string, string> = {
  "7500": "Hijack",
  "7600": "Radio failure",
  "7700": "General emergency",
};

export function isEmergency(squawk: string | null | undefined): boolean {
  return !!squawk && squawk in EMERGENCY_SQUAWKS;
}

/** Vertical rate threshold (ft/min) separating level flight from climb/descent. */
export const LEVEL_THRESHOLD_FPM = 300;

export function flightStatus(a: Pick<Aircraft, "onGround" | "vRate">): FlightStatus {
  if (a.onGround) return "ground";
  const v = a.vRate ?? 0;
  if (v > LEVEL_THRESHOLD_FPM) return "climbing";
  if (v < -LEVEL_THRESHOLD_FPM) return "descending";
  return "cruising";
}

/** First three letters of an airline callsign (ICAO airline designator), if it looks like one. */
export function airlineCode(callsign: string | null): string | null {
  if (!callsign) return null;
  const m = /^([A-Z]{3})\d/.exec(callsign.trim().toUpperCase());
  return m ? m[1] : null;
}

export interface Filters {
  altMin: number;
  altMax: number;
  type: string;
  airline: string;
  hideGround: boolean;
  emergencyOnly: boolean;
}

export const ALT_FILTER_MAX = 50000;

export const DEFAULT_FILTERS: Filters = {
  altMin: 0,
  altMax: ALT_FILTER_MAX,
  type: "",
  airline: "",
  hideGround: false,
  emergencyOnly: false,
};

export function passesFilters(a: Aircraft, f: Filters): boolean {
  if (f.emergencyOnly && !isEmergency(a.squawk)) return false;
  if (f.hideGround && a.onGround) return false;
  const alt = a.onGround ? 0 : (a.altFt ?? 0);
  if (alt < f.altMin) return false;
  if (f.altMax < ALT_FILTER_MAX && alt > f.altMax) return false;
  if (f.type && !(a.type ?? "").toUpperCase().startsWith(f.type.toUpperCase())) return false;
  if (f.airline && airlineCode(a.callsign) !== f.airline.toUpperCase()) return false;
  return true;
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.altMin > 0 || f.altMax < ALT_FILTER_MAX) n++;
  if (f.type) n++;
  if (f.airline) n++;
  if (f.hideGround) n++;
  if (f.emergencyOnly) n++;
  return n;
}

/** Altitude color stops in feet, matching --alt-0..--alt-5 tokens (low = warm, high = cool). */
export const ALTITUDE_STOPS: [number, string][] = [
  [0, "#f0643c"],
  [6000, "#f5a623"],
  [14000, "#c6e046"],
  [24000, "#3fd3a5"],
  [34000, "#3fb7f0"],
  [43000, "#6d84ff"],
];
export const GROUND_COLOR = "#8a96a3";
export const EMERGENCY_COLOR = "#ff3b3b";

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function altitudeColor(altFt: number | null, onGround = false): string {
  if (onGround || altFt == null) return GROUND_COLOR;
  const stops = ALTITUDE_STOPS;
  if (altFt <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [a1, c1] = stops[i];
    if (altFt <= a1) {
      const [a0, c0] = stops[i - 1];
      const t = (altFt - a0) / (a1 - a0);
      const p = hexToRgb(c0);
      const q = hexToRgb(c1);
      const mix = p.map((v, k) => Math.round(v + (q[k] - v) * t));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return stops[stops.length - 1][1];
}
