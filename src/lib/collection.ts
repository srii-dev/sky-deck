/*
 * Collection, achievements and daily challenges (Phase 13a to 13c). Every aircraft type and registration the visitor
 * opens is remembered in this browser (localStorage); nothing is sent anywhere. Achievements and challenges are worked
 * out from that record, so they can change later without a migration. Pure functions plus a storage layer that never
 * throws.
 */
import type { AircraftKind } from "./aircraft-kind";
import { iconShape, type IconShape } from "./aircraft-shape";

export const COLLECTION_KEY = "skydeck:collection";
export const MAX_TYPES = 600;
export const MAX_REGS = 3000;
const MAX_DAILY_TYPES = 60;

export interface TypeEntry {
  first: number;
  count: number;
  shape: IconShape;
}
export interface RegEntry {
  first: number;
  count: number;
  type: string | null;
}
export interface DailyRecord {
  /** Local date, YYYY-MM-DD. */
  day: string;
  shapes: string[];
  types: string[];
  count: number;
  /** Challenge ids completed today. */
  done: string[];
}
export interface Collection {
  types: Record<string, TypeEntry>;
  regs: Record<string, RegEntry>;
  /** Selections by category (kind). */
  kinds: Record<string, number>;
  military: number;
  /** Achievement id to the time it was unlocked. */
  unlocked: Record<string, number>;
  daily: DailyRecord;
  /** Daily challenges completed so far, all days. */
  challengesDone: number;
}

export function emptyCollection(day = ""): Collection {
  return {
    types: {},
    regs: {},
    kinds: {},
    military: 0,
    unlocked: {},
    daily: { day, shapes: [], types: [], count: 0, done: [] },
    challengesDone: 0,
  };
}

export function dayKey(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export function normalizeType(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(t) ? t : null;
}
export function normalizeReg(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{1,9}$/.test(t) ? t : null;
}

// ---------- achievements ----------

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Progress towards it, for the bar. */
  progress: (c: Collection) => { have: number; need: number };
}

const typeCount = (c: Collection) => Object.keys(c.types).length;
const regCount = (c: Collection) => Object.keys(c.regs).length;
const kindSeen = (c: Collection, k: AircraftKind) => ((c.kinds[k] ?? 0) > 0 ? 1 : 0);
const shapeTypes = (c: Collection, s: IconShape) =>
  Object.values(c.types).filter((t) => t.shape === s).length;
const atLeast = (have: number, need: number) => ({ have: Math.min(have, need), need });

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "types-5",
    name: "Getting started",
    description: "Open 5 different aircraft types.",
    progress: (c) => atLeast(typeCount(c), 5),
  },
  {
    id: "types-25",
    name: "Type spotter",
    description: "Open 25 different aircraft types.",
    progress: (c) => atLeast(typeCount(c), 25),
  },
  {
    id: "types-100",
    name: "Type encyclopedia",
    description: "Open 100 different aircraft types.",
    progress: (c) => atLeast(typeCount(c), 100),
  },
  {
    id: "regs-10",
    name: "Tail spotter",
    description: "Open 10 different registrations.",
    progress: (c) => atLeast(regCount(c), 10),
  },
  {
    id: "regs-50",
    name: "Tail collector",
    description: "Open 50 different registrations.",
    progress: (c) => atLeast(regCount(c), 50),
  },
  {
    id: "regs-250",
    name: "Tail archivist",
    description: "Open 250 different registrations.",
    progress: (c) => atLeast(regCount(c), 250),
  },
  {
    id: "rotor",
    name: "Rotor head",
    description: "Open a helicopter.",
    progress: (c) => atLeast(kindSeen(c, "helicopter"), 1),
  },
  {
    id: "soar",
    name: "Soaring",
    description: "Open a glider.",
    progress: (c) => atLeast(kindSeen(c, "glider"), 1),
  },
  {
    id: "heavy",
    name: "Heavy metal",
    description: "Open a heavy jet.",
    progress: (c) => atLeast(kindSeen(c, "widebody"), 1),
  },
  {
    id: "quad",
    name: "Four engines",
    description: "Open a four-engine heavy such as a 747 or A380.",
    progress: (c) => atLeast(shapeTypes(c, "quad"), 1),
  },
  {
    id: "props",
    name: "Propeller and jet",
    description: "Open a turboprop and a rear-engine jet.",
    progress: (c) =>
      atLeast(Math.min(shapeTypes(c, "turboprop"), 1) + Math.min(shapeTypes(c, "regional"), 1), 2),
  },
  {
    id: "military",
    name: "On duty",
    description: "Open an aircraft the feed marks as military.",
    progress: (c) => atLeast(c.military, 1),
  },
  {
    id: "variety",
    name: "Full hangar",
    description: "Open a light aircraft, narrowbody, heavy jet, business jet and helicopter.",
    progress: (c) =>
      atLeast(
        (["light", "narrowbody", "widebody", "bizjet", "helicopter"] as AircraftKind[]).reduce(
          (n, k) => n + kindSeen(c, k),
          0,
        ),
        5,
      ),
  },
];

export function isUnlocked(a: Achievement, c: Collection): boolean {
  const p = a.progress(c);
  return p.have >= p.need;
}

// ---------- daily challenges ----------

export interface Challenge {
  id: string;
  title: string;
  /** What is still missing, for the list. */
  progress: (d: DailyRecord) => { have: number; need: number };
}

const hasShape = (d: DailyRecord, ...s: string[]) =>
  s.reduce((n, x) => n + (d.shapes.includes(x) ? 1 : 0), 0);

export const CHALLENGES: readonly Challenge[] = [
  {
    id: "c-rotor-glider-heavy",
    title: "Find a helicopter, a glider and a heavy jet",
    progress: (d) => ({
      have: hasShape(d, "helicopter", "glider") + (hasShape(d, "widebody", "quad") > 0 ? 1 : 0),
      need: 3,
    }),
  },
  {
    id: "c-five-types",
    title: "Open 5 different types",
    progress: (d) => ({ have: Math.min(d.types.length, 5), need: 5 }),
  },
  {
    id: "c-ten-aircraft",
    title: "Open 10 aircraft",
    progress: (d) => ({ have: Math.min(d.count, 10), need: 10 }),
  },
  {
    id: "c-four-engine",
    title: "Find a four-engine heavy",
    progress: (d) => ({ have: hasShape(d, "quad"), need: 1 }),
  },
  {
    id: "c-prop-regional",
    title: "Find a turboprop and a rear-engine jet",
    progress: (d) => ({ have: hasShape(d, "turboprop", "regional"), need: 2 }),
  },
  {
    id: "c-biz-light",
    title: "Find a business jet and a light aircraft",
    progress: (d) => ({ have: hasShape(d, "bizjet", "light"), need: 2 }),
  },
  {
    id: "c-narrow-wide",
    title: "Find a narrowbody and a twin-engine heavy",
    progress: (d) => ({ have: hasShape(d, "narrowbody", "widebody"), need: 2 }),
  },
  {
    id: "c-rare-kind",
    title: "Find a helicopter, glider, balloon or drone",
    progress: (d) => ({
      have: hasShape(d, "helicopter", "glider", "balloon", "drone") > 0 ? 1 : 0,
      need: 1,
    }),
  },
];

export const CHALLENGES_PER_DAY = 3;

/** Today's challenges: the same three for everyone on the same date, rotating through the list. */
export function challengesForDay(day: string): Challenge[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const n = m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : 0;
  const out: Challenge[] = [];
  for (let i = 0; i < CHALLENGES_PER_DAY; i++) {
    out.push(CHALLENGES[(n * CHALLENGES_PER_DAY + i) % CHALLENGES.length]!);
  }
  return out;
}

// ---------- recording ----------

export interface SelectedAircraft {
  type: string | null;
  registration: string | null;
  kind: AircraftKind;
  military?: boolean | undefined;
}

export interface RecordResult {
  next: Collection;
  newType: string | null;
  newReg: string | null;
  unlocked: Achievement[];
  completed: Challenge[];
}

/** Remember one opened aircraft. Call it once per aircraft per visit; the caller de-duplicates. */
export function recordSelection(
  c: Collection,
  a: SelectedAircraft,
  now: number,
  day: string,
): RecordResult {
  const type = normalizeType(a.type);
  const reg = normalizeReg(a.registration);
  if (!type && !reg) return { next: c, newType: null, newReg: null, unlocked: [], completed: [] };

  const shape = iconShape(a.kind, type);
  const types = { ...c.types };
  const regs = { ...c.regs };
  let newType: string | null = null;
  let newReg: string | null = null;

  if (type) {
    const e = types[type];
    if (e) types[type] = { ...e, count: e.count + 1 };
    else if (Object.keys(types).length < MAX_TYPES) {
      types[type] = { first: now, count: 1, shape };
      newType = type;
    }
  }
  if (reg) {
    const e = regs[reg];
    if (e) regs[reg] = { ...e, count: e.count + 1, type: e.type ?? type };
    else if (Object.keys(regs).length < MAX_REGS) {
      regs[reg] = { first: now, count: 1, type };
      newReg = reg;
    }
  }

  const prevDaily = c.daily.day === day ? c.daily : { ...emptyCollection(day).daily };
  const daily: DailyRecord = {
    day,
    shapes: prevDaily.shapes.includes(shape) ? prevDaily.shapes : [...prevDaily.shapes, shape],
    types:
      type && !prevDaily.types.includes(type) && prevDaily.types.length < MAX_DAILY_TYPES
        ? [...prevDaily.types, type]
        : prevDaily.types,
    count: prevDaily.count + 1,
    done: prevDaily.done,
  };

  let next: Collection = {
    ...c,
    types,
    regs,
    kinds: { ...c.kinds, [a.kind]: (c.kinds[a.kind] ?? 0) + 1 },
    military: c.military + (a.military ? 1 : 0),
    daily,
  };

  const unlocked: Achievement[] = [];
  const unlockedMap = { ...next.unlocked };
  for (const ach of ACHIEVEMENTS) {
    if (unlockedMap[ach.id] === undefined && isUnlocked(ach, next)) {
      unlockedMap[ach.id] = now;
      unlocked.push(ach);
    }
  }
  const completed: Challenge[] = [];
  const done = [...daily.done];
  for (const ch of challengesForDay(day)) {
    const p = ch.progress(daily);
    if (!done.includes(ch.id) && p.have >= p.need) {
      done.push(ch.id);
      completed.push(ch);
    }
  }
  next = {
    ...next,
    unlocked: unlockedMap,
    daily: { ...daily, done },
    challengesDone: next.challengesDone + completed.length,
  };
  return { next, newType, newReg, unlocked, completed };
}

// ---------- storage ----------

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const SHAPES = new Set<string>([
  "light",
  "narrowbody",
  "widebody",
  "bizjet",
  "helicopter",
  "glider",
  "balloon",
  "drone",
  "ground",
  "quad",
  "regional",
  "turboprop",
  "fighter",
  "generic",
]);
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
const CHALLENGE_IDS = new Set(CHALLENGES.map((c) => c.id));

function strings(v: unknown, ok: (s: string) => boolean, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v)
    if (typeof s === "string" && ok(s) && !out.includes(s) && out.length < max) out.push(s);
  return out;
}

/** Keep only well-formed data from storage; anything else is dropped. */
export function sanitizeCollection(raw: unknown): Collection {
  const c = emptyCollection();
  if (!isObj(raw)) return c;
  if (isObj(raw["types"])) {
    for (const [k, v] of Object.entries(raw["types"])) {
      if (Object.keys(c.types).length >= MAX_TYPES) break;
      if (normalizeType(k) !== k || !isObj(v)) continue;
      const shape =
        typeof v["shape"] === "string" && SHAPES.has(v["shape"])
          ? (v["shape"] as IconShape)
          : "generic";
      c.types[k] = {
        first: finite(v["first"]) ? v["first"] : 0,
        count: finite(v["count"]) && v["count"] > 0 ? Math.floor(v["count"]) : 1,
        shape,
      };
    }
  }
  if (isObj(raw["regs"])) {
    for (const [k, v] of Object.entries(raw["regs"])) {
      if (Object.keys(c.regs).length >= MAX_REGS) break;
      if (normalizeReg(k) !== k || !isObj(v)) continue;
      c.regs[k] = {
        first: finite(v["first"]) ? v["first"] : 0,
        count: finite(v["count"]) && v["count"] > 0 ? Math.floor(v["count"]) : 1,
        type: typeof v["type"] === "string" ? normalizeType(v["type"]) : null,
      };
    }
  }
  if (isObj(raw["kinds"])) {
    for (const [k, v] of Object.entries(raw["kinds"])) {
      if (SHAPES.has(k) && finite(v) && v > 0) c.kinds[k] = Math.floor(v);
    }
  }
  c.military = finite(raw["military"]) && raw["military"] > 0 ? Math.floor(raw["military"]) : 0;
  if (isObj(raw["unlocked"])) {
    for (const [k, v] of Object.entries(raw["unlocked"])) {
      if (ACHIEVEMENT_IDS.has(k) && finite(v)) c.unlocked[k] = v;
    }
  }
  const d = raw["daily"];
  if (isObj(d) && typeof d["day"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d["day"])) {
    c.daily = {
      day: d["day"],
      shapes: strings(d["shapes"], (s) => SHAPES.has(s), 20),
      types: strings(d["types"], (s) => normalizeType(s) === s, MAX_DAILY_TYPES),
      count: finite(d["count"]) && d["count"] > 0 ? Math.floor(d["count"]) : 0,
      done: strings(d["done"], (s) => CHALLENGE_IDS.has(s), CHALLENGES_PER_DAY),
    };
  }
  c.challengesDone =
    finite(raw["challengesDone"]) && raw["challengesDone"] > 0
      ? Math.floor(raw["challengesDone"])
      : 0;
  return c;
}

export function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    return raw ? sanitizeCollection(JSON.parse(raw) as unknown) : emptyCollection();
  } catch {
    return emptyCollection();
  }
}

export function storeCollection(c: Collection): void {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
  } catch {
    /* storage blocked or full */
  }
}
