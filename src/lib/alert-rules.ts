import { KIND_LABELS, type AircraftKind } from "./aircraft-kind";
import { distanceNm } from "./route-geometry";

/*
 * Alert rules (Phase 10b, 10c, 10d): conditions a visitor sets up ("a heavy jet below 5,000 ft within 40 nm of
 * JFK", "any military aircraft", "callsign RCH"). The browser checks them against every aircraft update while the
 * page is open; nothing is sent anywhere and nothing runs when the tab is closed (Phase 10f needs a backend).
 * Rules are kept in this browser. Pure functions plus a storage layer that never throws.
 */

export const ALERT_RULES_KEY = "skydeck:alert-rules";
export const MAX_ALERT_RULES = 20;
export const MAX_RULE_NAME = 50;
export const MAX_AREA_NM = 500;
/** The same rule alerts for the same aircraft at most once in this time (ms). */
export const RULE_COOLDOWN_MS = 30 * 60 * 1000;
/** At most this many messages for one rule in one update; the rest are summarised. */
export const MAX_EVENTS_PER_RULE = 3;
/** Aircraft whose position is older than this (seconds) are not matched. */
export const RULE_MAX_SEEN_POS_S = 30;

export interface AlertArea {
  lat: number;
  lon: number;
  radiusNm: number;
  /** For example "JFK" or "my area". */
  label: string;
}

export interface RuleConditions {
  /** Flight number starts with this (upper case letters and digits). */
  callsignPrefix?: string | undefined;
  kinds?: AircraftKind[] | undefined;
  military?: boolean | undefined;
  altMinFt?: number | undefined;
  altMaxFt?: number | undefined;
  /** Squawk code (four digits). */
  squawk?: string | undefined;
  area?: AlertArea | undefined;
  /** Only aircraft in the air (true) or only on the ground (false). */
  airborne?: boolean | undefined;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  conditions: RuleConditions;
}

export interface RuleAircraft {
  hex: string;
  callsign: string | null;
  registration?: string | null | undefined;
  type?: string | null | undefined;
  kind: AircraftKind;
  lat: number;
  lon: number;
  altFt: number | null;
  onGround: boolean;
  squawk: string | null;
  military?: boolean | undefined;
  seenPos: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const KINDS = Object.keys(KIND_LABELS) as AircraftKind[];

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanPrefix(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let out = "";
  for (const ch of v.toUpperCase()) {
    if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) out += ch;
  }
  return out.length >= 1 && out.length <= 8 ? out : undefined;
}

function cleanSquawk(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t.length !== 4) return undefined;
  for (const ch of t) if (ch < "0" || ch > "7") return undefined;
  return t;
}

function cleanArea(v: unknown): AlertArea | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  if (!finite(a["lat"]) || !finite(a["lon"]) || !finite(a["radiusNm"])) return undefined;
  if (a["lat"] < -90 || a["lat"] > 90 || a["lon"] < -180 || a["lon"] > 180) return undefined;
  if (a["radiusNm"] < 1 || a["radiusNm"] > MAX_AREA_NM) return undefined;
  return {
    lat: a["lat"],
    lon: a["lon"],
    radiusNm: Math.round(a["radiusNm"] * 10) / 10,
    label: cleanText(a["label"], 30) || "my area",
  };
}

export function cleanConditions(raw: unknown): RuleConditions {
  if (!raw || typeof raw !== "object") return {};
  const c = raw as Record<string, unknown>;
  const out: RuleConditions = {};
  const prefix = cleanPrefix(c["callsignPrefix"]);
  if (prefix) out.callsignPrefix = prefix;
  if (Array.isArray(c["kinds"])) {
    const kinds = c["kinds"].filter((k): k is AircraftKind => KINDS.includes(k as AircraftKind));
    if (kinds.length > 0) out.kinds = [...new Set(kinds)];
  }
  if (c["military"] === true) out.military = true;
  if (finite(c["altMinFt"]) && c["altMinFt"] >= 0 && c["altMinFt"] <= 60000)
    out.altMinFt = Math.round(c["altMinFt"]);
  if (finite(c["altMaxFt"]) && c["altMaxFt"] >= 0 && c["altMaxFt"] <= 60000)
    out.altMaxFt = Math.round(c["altMaxFt"]);
  const squawk = cleanSquawk(c["squawk"]);
  if (squawk) out.squawk = squawk;
  const area = cleanArea(c["area"]);
  if (area) out.area = area;
  if (typeof c["airborne"] === "boolean") out.airborne = c["airborne"];
  return out;
}

/** A rule needs at least one condition, otherwise it would match every aircraft. */
export function hasConditions(c: RuleConditions): boolean {
  return (
    c.callsignPrefix !== undefined ||
    (c.kinds?.length ?? 0) > 0 ||
    c.military === true ||
    c.altMinFt !== undefined ||
    c.altMaxFt !== undefined ||
    c.squawk !== undefined ||
    c.area !== undefined ||
    c.airborne !== undefined
  );
}

/** Keep only well-formed rules from stored data. */
export function sanitizeRules(raw: unknown): AlertRule[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertRule[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = cleanText(r["id"], 40);
    const conditions = cleanConditions(r["conditions"]);
    if (!id || ids.has(id) || !hasConditions(conditions)) continue;
    ids.add(id);
    const lo = conditions.altMinFt;
    const hi = conditions.altMaxFt;
    if (lo !== undefined && hi !== undefined && lo > hi) continue;
    out.push({
      id,
      name: cleanText(r["name"], MAX_RULE_NAME) || describeConditions(conditions),
      enabled: r["enabled"] !== false,
      createdAt: finite(r["createdAt"]) ? r["createdAt"] : 0,
      conditions,
    });
    if (out.length >= MAX_ALERT_RULES) break;
  }
  return out;
}

export function newRuleId(now: number, random: number = Math.random()): string {
  return "r" + now.toString(36) + Math.floor(random * 1e6).toString(36);
}

export function addRule(
  list: readonly AlertRule[],
  draft: { name: string; conditions: RuleConditions },
  now: number,
  random?: number,
): AlertRule[] | null {
  const conditions = cleanConditions(draft.conditions);
  if (!hasConditions(conditions) || list.length >= MAX_ALERT_RULES) return null;
  const lo = conditions.altMinFt;
  const hi = conditions.altMaxFt;
  if (lo !== undefined && hi !== undefined && lo > hi) return null;
  const rule: AlertRule = {
    id: newRuleId(now, random),
    name: cleanText(draft.name, MAX_RULE_NAME) || describeConditions(conditions),
    enabled: true,
    createdAt: now,
    conditions,
  };
  return [rule, ...list];
}

export function removeRule(list: readonly AlertRule[], id: string): AlertRule[] {
  return list.filter((r) => r.id !== id);
}

export function setRuleEnabled(
  list: readonly AlertRule[],
  id: string,
  enabled: boolean,
): AlertRule[] {
  return list.map((r) => (r.id === id ? { ...r, enabled } : r));
}

const fmtFt = (v: number) => v.toLocaleString("en-US") + " ft";

/** A plain-English summary such as "heavy jet, below 5,000 ft, within 40 nm of JFK". */
export function describeConditions(c: RuleConditions): string {
  const parts: string[] = [];
  if (c.military) parts.push("military aircraft");
  if (c.kinds?.length) parts.push(c.kinds.map((k) => KIND_LABELS[k].toLowerCase()).join(" or "));
  if (c.callsignPrefix) parts.push("flight " + c.callsignPrefix + "…");
  if (c.squawk) parts.push("squawk " + c.squawk);
  if (c.airborne === true) parts.push("in the air");
  if (c.airborne === false) parts.push("on the ground");
  if (c.altMinFt !== undefined && c.altMaxFt !== undefined) {
    parts.push("between " + fmtFt(c.altMinFt) + " and " + fmtFt(c.altMaxFt));
  } else if (c.altMaxFt !== undefined) parts.push("below " + fmtFt(c.altMaxFt));
  else if (c.altMinFt !== undefined) parts.push("above " + fmtFt(c.altMinFt));
  if (c.area) parts.push("within " + c.area.radiusNm + " nm of " + c.area.label);
  return parts.length ? parts.join(", ") : "no conditions";
}

/** Whether an aircraft satisfies every condition of a rule. */
export function matchesRule(c: RuleConditions, a: RuleAircraft): boolean {
  if (a.seenPos > RULE_MAX_SEEN_POS_S) return false;
  if (c.military === true && a.military !== true) return false;
  if (c.kinds?.length && !c.kinds.includes(a.kind)) return false;
  if (c.callsignPrefix) {
    const cs = (a.callsign ?? "").toUpperCase();
    if (!cs.startsWith(c.callsignPrefix)) return false;
  }
  if (c.squawk && a.squawk !== c.squawk) return false;
  if (c.airborne === true && a.onGround) return false;
  if (c.airborne === false && !a.onGround) return false;
  if (c.altMinFt !== undefined || c.altMaxFt !== undefined) {
    // An unknown altitude cannot satisfy an altitude condition; an aircraft on the ground counts as 0 ft.
    const alt = a.onGround ? 0 : a.altFt;
    if (alt == null) return false;
    if (c.altMinFt !== undefined && alt < c.altMinFt) return false;
    if (c.altMaxFt !== undefined && alt > c.altMaxFt) return false;
  }
  if (c.area && distanceNm(c.area, a) > c.area.radiusNm) return false;
  return true;
}

// ---------- evaluation over updates ----------

export interface RuleEvent {
  id: string;
  ruleId: string;
  hex: string;
  title: string;
  detail: string;
}

export interface RuleState {
  /** Per rule: the aircraft that matched in the previous update. A rule is absent until it was first evaluated. */
  matching: Map<string, Set<string>>;
  lastAlert: Map<string, number>;
}

export function newRuleState(): RuleState {
  return { matching: new Map(), lastAlert: new Map() };
}

function aircraftName(a: RuleAircraft): string {
  return a.callsign ?? a.registration ?? a.hex.toUpperCase();
}

function aircraftDetail(a: RuleAircraft): string {
  const alt = a.onGround ? "on the ground" : a.altFt == null ? "" : fmtFt(Math.round(a.altFt));
  return [a.type, alt].filter(Boolean).join(", ");
}

/**
 * Events for this update. An aircraft raises an event for a rule when it matches now and did not in the previous
 * update (it entered the area, climbed below the limit, and so on). The first update after a rule is created or
 * switched on only learns which aircraft already match, so creating a rule never floods the screen.
 */
export function evaluateRules(
  state: RuleState,
  rules: readonly AlertRule[],
  aircraft: readonly RuleAircraft[],
  now: number,
): { events: RuleEvent[]; state: RuleState } {
  const matching = new Map<string, Set<string>>();
  const lastAlert = new Map(state.lastAlert);
  const events: RuleEvent[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const prev = state.matching.get(rule.id);
    const now_ = new Set<string>();
    const fresh: RuleAircraft[] = [];
    for (const a of aircraft) {
      if (!matchesRule(rule.conditions, a)) continue;
      now_.add(a.hex);
      if (prev && !prev.has(a.hex)) fresh.push(a);
    }
    matching.set(rule.id, now_);
    let shown = 0;
    for (const a of fresh) {
      const key = rule.id + ":" + a.hex;
      const last = lastAlert.get(key);
      if (last != null && now - last < RULE_COOLDOWN_MS) continue;
      lastAlert.set(key, now);
      if (shown < MAX_EVENTS_PER_RULE) {
        events.push({
          id: key + ":" + now,
          ruleId: rule.id,
          hex: a.hex,
          title: rule.name + ": " + aircraftName(a),
          detail: aircraftDetail(a),
        });
      }
      shown += 1;
    }
    if (shown > MAX_EVENTS_PER_RULE) {
      events.push({
        id: rule.id + ":more:" + now,
        ruleId: rule.id,
        hex: "",
        title: rule.name + ": " + (shown - MAX_EVENTS_PER_RULE) + " more aircraft",
        detail: "",
      });
    }
  }
  for (const [key, at] of lastAlert) {
    if (now - at > RULE_COOLDOWN_MS * 2) lastAlert.delete(key);
  }
  return { events, state: { matching, lastAlert } };
}

/** How many of these aircraft match a rule right now (for showing "N matching now"). */
export function countMatches(c: RuleConditions, aircraft: readonly RuleAircraft[]): number {
  let n = 0;
  for (const a of aircraft) if (matchesRule(c, a)) n += 1;
  return n;
}

// ---------- storage ----------

export function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(ALERT_RULES_KEY);
    return raw ? sanitizeRules(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

export function storeRules(list: readonly AlertRule[]): void {
  try {
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked or full: the rules still work for this visit */
  }
}
