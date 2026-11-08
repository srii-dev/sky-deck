// Shared, browser-safe aircraft types and helpers.
import type { AircraftKind } from "./aircraft-kind";

export interface Aircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  description: string | null;
  operator: string | null;
  /** Year of manufacture when the feed's aircraft database has it (often missing). */
  year?: number | null | undefined;
  /** The feed's database marks this aircraft as military (never shown for other flags). */
  military?: boolean | undefined;
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
  /** Icon/category bucket from emitter category or type code (see aircraft-kind.ts). */
  kind: AircraftKind;
  /** Human-readable category name, e.g. "Heavy jet". */
  kindLabel: string;
  /** Seconds since last position report. */
  seenPos: number;
  /** Client-only: provider that supplied the winning record. */
  source?: string;
  /** Client-only: squawk withheld from alerts until it is confirmed. */
  reportedSquawk?: string | null;
}

export interface FeedResponse {
  aircraft: Aircraft[];
  source: string;
  fetchedAt: number;
  error?: string;
  /** A source was rate-limited/failed (a fallback may still have answered). */
  busy?: boolean;
  /**
   * How old this data was when the server answered, from a cache hit or load shedding.
   * `seenPos` of each aircraft already includes this age. Absent on a fresh upstream fetch.
   */
  ageMs?: number;
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

/** Same emergency code must be counted this many times before it alerts. */
export const EMERGENCY_CONFIRM_POLLS = 2;
/** Minimum gap between counted samples for one hex. Cached or immediate repeats do not count. */
export const EMERGENCY_MIN_SAMPLE_GAP_MS = 5000;
/** Older than this, an emergency squawk is ignored. */
export const EMERGENCY_MAX_SEEN_POS_S = 30;

export interface EmergencySample {
  code: string;
  count: number;
  lastCountedAt: number;
}

export type EmergencyMemory = Record<string, EmergencySample>;

export interface EmergencyObservation {
  hex: string;
  squawk: string | null;
  seenPos: number;
  freshlyFetched: boolean;
  observedAt: number;
}

function sampleCounts(obs: EmergencyObservation, prior: EmergencySample | undefined): boolean {
  if (!isEmergency(obs.squawk) || obs.seenPos > EMERGENCY_MAX_SEEN_POS_S) return false;
  if (!obs.freshlyFetched) return false;
  if (prior && obs.observedAt - prior.lastCountedAt < EMERGENCY_MIN_SAMPLE_GAP_MS) return false;
  return true;
}

/** One observation per hex. A hex missing from `observations` is dropped. */
export function nextEmergencyMemory(
  prev: EmergencyMemory,
  observations: readonly EmergencyObservation[],
): EmergencyMemory {
  const next: EmergencyMemory = {};
  const seen = new Set<string>();
  for (const obs of observations) {
    if (seen.has(obs.hex)) continue;
    seen.add(obs.hex);
    const prior = prev[obs.hex];
    if (!sampleCounts(obs, prior)) {
      if (
        prior &&
        prior.code === obs.squawk &&
        isEmergency(obs.squawk) &&
        obs.seenPos <= EMERGENCY_MAX_SEEN_POS_S
      ) {
        next[obs.hex] = prior;
      }
      continue;
    }
    const code = obs.squawk ?? "";
    next[obs.hex] =
      prior && prior.code === code
        ? { code, count: prior.count + 1, lastCountedAt: obs.observedAt }
        : { code, count: 1, lastCountedAt: obs.observedAt };
  }
  return next;
}

export function isConfirmedEmergency(
  memory: EmergencyMemory,
  a: { hex: string; squawk: string | null; seenPos: number },
): boolean {
  const sample = memory[a.hex];
  return (
    !!sample &&
    sample.count >= EMERGENCY_CONFIRM_POLLS &&
    sample.code === a.squawk &&
    isEmergency(a.squawk) &&
    a.seenPos <= EMERGENCY_MAX_SEEN_POS_S
  );
}

/** Clears `squawk` until the code is confirmed, keeping the raw value for the panel. */
export function presentEmergency(a: Aircraft, memory: EmergencyMemory): Aircraft {
  if (!isEmergency(a.squawk) || isConfirmedEmergency(memory, a)) return a;
  return { ...a, squawk: null, reportedSquawk: a.squawk };
}

/** Keep the record with the smaller `seenPos`. A tie keeps the one already stored. */
export function pickFresherAircraft<T extends { seenPos: number }>(prev: T, next: T): T {
  return next.seenPos < prev.seenPos ? next : prev;
}

/** User-facing message when live ADS-B providers fail to respond. */
export const DATA_BUSY_MESSAGE = "Live data is busy. Retrying…";

/**
 * While every provider fails, the last good aircraft stay on screen for this long (the map stops
 * moving them after 40 s and the status chip shows the age), then the list is cleared so the map
 * never shows planes that may have landed minutes ago.
 */
export const LAST_GOOD_MAX_MS = 120_000;

/** Whether the last good aircraft may still be shown `ageMs` after they were fetched. */
export function lastGoodUsable(ageMs: number | null): boolean {
  return ageMs != null && ageMs >= 0 && ageMs <= LAST_GOOD_MAX_MS;
}

export function resolveFeedNotices(input: {
  circles: number;
  failed: number;
  fallbackBusy: boolean;
}): { error: typeof DATA_BUSY_MESSAGE | null; backup: boolean; areasMissing: boolean } {
  const allFailed = input.circles > 0 && input.failed === input.circles;
  return {
    error: allFailed ? DATA_BUSY_MESSAGE : null,
    backup: input.fallbackBusy && !allFailed,
    areasMissing: input.failed > 0 && !allFailed,
  };
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
  return m?.[1] ?? null;
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
  const first = stops[0]!;
  if (altFt <= first[0]) return first[1];
  for (let i = 1; i < stops.length; i++) {
    const [a1, c1] = stops[i]!;
    if (altFt <= a1) {
      const [a0, c0] = stops[i - 1]!;
      const t = (altFt - a0) / (a1 - a0);
      const p = hexToRgb(c0);
      const q = hexToRgb(c1);
      const mix = p.map((v, k) => Math.round(v + ((q[k] ?? v) - v) * t));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return stops[stops.length - 1]![1];
}
