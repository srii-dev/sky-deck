import { isEmergency } from "./aircraft";
import { distanceNm } from "./route-geometry";
import { watchMatches, type WatchItem } from "./watchlist";

/*
 * In-app alerts for watched items (Phase 5b): takeoff, landing and emergency squawk. It compares each aircraft
 * update with the one before, so it only works while the page is open and only sees aircraft in the area the
 * map is showing. Nothing is sent anywhere and no browser notification is requested.
 *
 * A takeoff or landing needs the new on-ground state to be seen in two updates in a row: transponders sometimes
 * flicker between ground and air near the runway, and one flicker must not raise an alert.
 */

export const ALERT_AIRPORT_NM = 6;
/** An aircraft whose position is older than this (seconds) is not used to decide anything. */
export const ALERT_MAX_SEEN_POS_S = 20;
/** The previous observation may be at most this old (ms) for a change to count; a long gap is a gap, not a flip. */
export const ALERT_MAX_GAP_MS = 60_000;
/** The same alert for the same aircraft is raised at most once in this time (ms). */
export const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export type AlertKind = "takeoff" | "landing" | "emergency";

export interface WatchEvent {
  id: string;
  hex: string;
  kind: AlertKind;
  title: string;
  detail: string;
}

export interface AlertAircraft {
  hex: string;
  callsign: string | null;
  registration?: string | null;
  lat: number;
  lon: number;
  onGround: boolean;
  squawk: string | null;
  seenPos: number;
}

export interface AirportPoint {
  icao: string;
  name: string;
  lat: number;
  lon: number;
}

interface Snap {
  onGround: boolean;
  at: number;
  emergency: boolean;
  /** A different ground state seen in the last update, not yet confirmed. */
  candidate: boolean | null;
}

export interface AlertState {
  snaps: Map<string, Snap>;
  lastAlert: Map<string, number>;
}

export function newAlertState(): AlertState {
  return { snaps: new Map(), lastAlert: new Map() };
}

const EMERGENCY_NAMES: Record<string, string> = {
  "7500": "hijack code 7500",
  "7600": "radio failure code 7600",
  "7700": "general emergency code 7700",
};

function nameOf(a: AlertAircraft): string {
  return a.callsign ?? a.registration ?? a.hex.toUpperCase();
}

export interface DetectOptions {
  watch: readonly WatchItem[];
  airports: readonly AirportPoint[];
  now: number;
}

/** Events for this update and the state to pass to the next one. The input state is not changed. */
export function detectWatchEvents(
  state: AlertState,
  aircraft: readonly AlertAircraft[],
  opts: DetectOptions,
): { events: WatchEvent[]; state: AlertState } {
  const watchedAirports = opts.airports.filter((ap) =>
    opts.watch.some((w) => w.kind === "airport" && w.key === ap.icao.toUpperCase()),
  );
  const snaps = new Map(state.snaps);
  const lastAlert = new Map(state.lastAlert);
  const events: WatchEvent[] = [];

  const raise = (hex: string, kind: AlertKind, title: string, detail: string) => {
    const key = hex + ":" + kind;
    const prev = lastAlert.get(key);
    if (prev != null && opts.now - prev < ALERT_COOLDOWN_MS) return;
    lastAlert.set(key, opts.now);
    events.push({ id: key + ":" + opts.now, hex, kind, title, detail });
  };

  const seenNow = new Set<string>();
  for (const a of aircraft) {
    if (a.seenPos > ALERT_MAX_SEEN_POS_S) continue;
    const matches = watchMatches(opts.watch, a);
    let nearAirport: AirportPoint | null = null;
    if (matches.length === 0) {
      for (const ap of watchedAirports) {
        if (distanceNm(ap, a) <= ALERT_AIRPORT_NM) {
          nearAirport = ap;
          break;
        }
      }
      if (!nearAirport) continue;
    }
    seenNow.add(a.hex);
    const why = matches[0]
      ? "On your watchlist"
      : "Near " + (nearAirport?.name ?? "a watched airport");
    const who = nameOf(a);
    const emergency = isEmergency(a.squawk);
    const prev = snaps.get(a.hex);
    const fresh = prev != null && opts.now - prev.at <= ALERT_MAX_GAP_MS;

    if (emergency && (!prev || !prev.emergency)) {
      const label = EMERGENCY_NAMES[a.squawk ?? ""] ?? "emergency squawk";
      raise(a.hex, "emergency", who + " is squawking " + label, why);
    }

    let confirmed = prev?.onGround ?? a.onGround;
    let candidate: boolean | null = null;
    if (prev && fresh && a.onGround !== prev.onGround) {
      if (prev.candidate === a.onGround) {
        // Second update in a row with the new state: it is real.
        confirmed = a.onGround;
        if (a.onGround) raise(a.hex, "landing", who + " landed", why);
        else raise(a.hex, "takeoff", who + " took off", why);
      } else {
        candidate = a.onGround;
      }
    } else if (!prev || !fresh) {
      confirmed = a.onGround;
    }
    snaps.set(a.hex, { onGround: confirmed, at: opts.now, emergency, candidate });
  }

  // Forget aircraft that are no longer relevant or have not been seen for a while.
  for (const [hex, snap] of snaps) {
    if (!seenNow.has(hex) && opts.now - snap.at > ALERT_MAX_GAP_MS * 2) snaps.delete(hex);
  }
  for (const [key, at] of lastAlert) {
    if (opts.now - at > ALERT_COOLDOWN_MS * 2) lastAlert.delete(key);
  }
  return { events, state: { snaps, lastAlert } };
}
