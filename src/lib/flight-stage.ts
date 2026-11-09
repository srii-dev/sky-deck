import { distanceNm, routeProgress, type LatLon } from "./route-geometry";

/*
 * Stage of a flight in progress (Phase 11a), inferred only from what the aircraft broadcasts (on the ground or
 * not, ground speed, altitude, climb or descent rate, position) and, when the route is known, how far it is from
 * the two airports. It is an estimate: ADS-B says nothing about gates, clearances or schedules, and altitude is
 * measured above sea level, so low flying near high airports can be misread. Pure functions.
 */

export type FlightStage =
  | "gate-out"
  | "taxi-out"
  | "takeoff"
  | "climb"
  | "cruise"
  | "descent"
  | "approach"
  | "landing"
  | "taxi-in"
  | "gate-in";

export const STAGE_LABELS: Record<FlightStage, string> = {
  "gate-out": "At the gate",
  "taxi-out": "Taxiing out",
  takeoff: "Taking off",
  climb: "Climbing",
  cruise: "Cruising",
  descent: "Descending",
  approach: "On approach",
  landing: "Landing",
  "taxi-in": "Taxiing in",
  "gate-in": "Arrived at the gate",
};

/** The seven steps of the progress bar, in order. */
export const STEP_NAMES = [
  "Departure",
  "Takeoff",
  "Climb",
  "Cruise",
  "Descent",
  "Approach",
  "Arrival",
] as const;

const STEP_OF: Record<FlightStage, number> = {
  "gate-out": 0,
  "taxi-out": 0,
  takeoff: 1,
  climb: 2,
  cruise: 3,
  descent: 4,
  approach: 5,
  landing: 5,
  "taxi-in": 6,
  "gate-in": 6,
};

/** Which of the seven steps a stage belongs to (0 to 6). */
export function stageStep(stage: FlightStage): number {
  return STEP_OF[stage];
}

export interface StageInput {
  onGround: boolean;
  /** Ground speed, knots. */
  gs: number | null;
  /** Altitude above sea level, feet. */
  altFt: number | null;
  /** Vertical rate, ft/min. */
  vRate: number | null;
  lat: number;
  lon: number;
}

export interface StageRoute {
  origin: LatLon;
  destination: LatLon;
}

export const GATE_SPEED_KT = 2;
export const TAXI_MAX_KT = 30;
/** Within this distance of an airport the aircraft is "at" it. */
export const AT_AIRPORT_NM = 8;
export const APPROACH_NM = 40;
export const CLIMB_FPM = 300;
export const CRUISE_MIN_FT = 18_000;
export const APPROACH_MAX_FT = 10_000;

export interface StageResult {
  stage: FlightStage;
  label: string;
  step: number;
  /** Distance still to fly on the straight line to the destination, nm, when the route is known and airborne. */
  remainingNm: number | null;
  /** Minutes at the current ground speed over the straight line; null when unknown. A rough guide only. */
  etaMin: number | null;
}

/**
 * The stage of one aircraft. `prev` is the stage seen last time (it settles cases the numbers cannot, such as
 * whether a stopped aircraft is about to leave or has just arrived).
 */
export function inferStage(
  a: StageInput,
  route: StageRoute | null,
  prev: FlightStage | null,
): StageResult {
  const here = { lat: a.lat, lon: a.lon };
  const dOrigin = route ? distanceNm(route.origin, here) : null;
  const dDest = route ? distanceNm(route.destination, here) : null;
  const gs = a.gs ?? 0;
  const alt = a.altFt;
  const vr = a.vRate ?? 0;
  // Arrival side: it just came down from a descent or approach, or it is on the ground close to the
  // destination and nearer to it than to the origin.
  const arrivedSide =
    prev === "descent" ||
    prev === "approach" ||
    prev === "landing" ||
    prev === "taxi-in" ||
    prev === "gate-in" ||
    (dDest != null && dOrigin != null && dDest <= AT_AIRPORT_NM && dDest < dOrigin);
  let stage: FlightStage;
  if (a.onGround) {
    if (arrivedSide) {
      if (gs < GATE_SPEED_KT) stage = "gate-in";
      else if (
        gs >= TAXI_MAX_KT &&
        (prev === "approach" || prev === "descent" || prev === "landing")
      )
        stage = "landing";
      else stage = "taxi-in";
    } else if (gs >= TAXI_MAX_KT) stage = "takeoff";
    else if (gs < GATE_SPEED_KT) stage = "gate-out";
    else stage = "taxi-out";
  } else {
    const nearOrigin = dOrigin != null && dOrigin <= AT_AIRPORT_NM;
    const nearDest = dDest != null && dDest <= APPROACH_NM;
    if (prev === "takeoff" && vr > CLIMB_FPM && (alt == null || alt < 3000)) stage = "takeoff";
    else if (nearOrigin && vr > CLIMB_FPM && (alt == null || alt < 3000)) stage = "takeoff";
    else if (vr < -CLIMB_FPM) {
      stage = nearDest || (alt != null && alt < 3000) ? "approach" : "descent";
      // No route to tell: low and still descending after a descent is an approach.
      if (
        !route &&
        alt != null &&
        alt < APPROACH_MAX_FT / 2 &&
        (prev === "descent" || prev === "approach")
      )
        stage = "approach";
    } else if (vr > CLIMB_FPM) stage = "climb";
    else if (alt != null && alt >= CRUISE_MIN_FT) stage = "cruise";
    else if (nearDest && alt != null && alt < APPROACH_MAX_FT) stage = "approach";
    else if (prev === "approach" || prev === "descent") stage = prev;
    else if (alt != null && alt >= APPROACH_MAX_FT) stage = "cruise";
    else stage = prev === "cruise" ? "cruise" : "climb";
  }

  let remainingNm: number | null = null;
  let etaMin: number | null = null;
  if (route && !a.onGround) {
    const p = routeProgress(route.origin, route.destination, here, 120);
    // Straight-line distance to the destination (the aircraft may be off the line).
    remainingNm = dDest ?? p.remainingNm;
    if (gs >= 100 && remainingNm > 1) etaMin = Math.round((remainingNm / gs) * 60);
  }
  return { stage, label: STAGE_LABELS[stage], step: STEP_OF[stage], remainingNm, etaMin };
}

// ---------- history of stage changes ----------

export interface StageChange {
  stage: FlightStage;
  /** When it was first seen in this stage, ms. */
  at: number;
}

export interface FlightTrack {
  /** Newest last. */
  changes: StageChange[];
}

export const MAX_STAGE_CHANGES = 30;

/** Add a stage observation: a new entry only when the stage differs from the last one. */
export function recordStage(
  track: FlightTrack | undefined,
  stage: FlightStage,
  now: number,
): FlightTrack {
  const changes = track?.changes ?? [];
  const last = changes[changes.length - 1];
  if (last && last.stage === stage) return track ?? { changes };
  const next = [...changes, { stage, at: now }];
  return {
    changes: next.length > MAX_STAGE_CHANGES ? next.slice(next.length - MAX_STAGE_CHANGES) : next,
  };
}

export function currentStage(track: FlightTrack | undefined): FlightStage | null {
  return track?.changes[track.changes.length - 1]?.stage ?? null;
}

/** "-12 min" style: how long ago a stage began. */
export function sinceText(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return min + " min ago";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? h + " h ago" : h + " h " + m + " min ago";
}

/** Stage changes worth a message for a watched flight. */
export function isNotableChange(from: FlightStage | null, to: FlightStage): boolean {
  if (from === null || from === to) return false;
  return to === "cruise" || to === "descent" || to === "approach" || to === "gate-in";
}

export const STAGE_MESSAGES: Partial<Record<FlightStage, string>> = {
  cruise: "has reached cruising altitude",
  descent: "has started to descend",
  approach: "is on approach",
  "gate-in": "has arrived at the gate",
};

// ---------- storage ----------

export const FLIGHT_STAGES_KEY = "skydeck:flight-stages";
const MAX_TRACKED = 30;

const STAGES = Object.keys(STAGE_LABELS) as FlightStage[];

export function sanitizeTracks(raw: unknown): Record<string, FlightTrack> {
  const out: Record<string, FlightTrack> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_TRACKED) break;
    if (!/^[A-Z0-9]{3,10}$/.test(key) || !v || typeof v !== "object") continue;
    const list = (v as { changes?: unknown }).changes;
    if (!Array.isArray(list)) continue;
    const changes: StageChange[] = [];
    for (const c of list) {
      const s = c && typeof c === "object" ? (c as Record<string, unknown>) : null;
      if (
        s &&
        STAGES.includes(s["stage"] as FlightStage) &&
        typeof s["at"] === "number" &&
        Number.isFinite(s["at"])
      ) {
        changes.push({ stage: s["stage"] as FlightStage, at: s["at"] });
      }
    }
    if (changes.length > 0) {
      out[key] = { changes: changes.slice(-MAX_STAGE_CHANGES) };
      n += 1;
    }
  }
  return out;
}

export function loadTracks(): Record<string, FlightTrack> {
  try {
    const raw = localStorage.getItem(FLIGHT_STAGES_KEY);
    return raw ? sanitizeTracks(JSON.parse(raw) as unknown) : {};
  } catch {
    return {};
  }
}

export function storeTracks(tracks: Record<string, FlightTrack>): void {
  try {
    localStorage.setItem(FLIGHT_STAGES_KEY, JSON.stringify(tracks));
  } catch {
    /* storage blocked or full */
  }
}
