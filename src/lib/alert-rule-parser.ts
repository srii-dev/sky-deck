import type { AircraftKind } from "./aircraft-kind";
import { describeConditions, hasConditions, MAX_AREA_NM, type RuleConditions } from "./alert-rules";

/*
 * Plain-English alert rules (Phase 10e): "tell me about a heavy jet below 5,000 ft within 40 nm of JFK" becomes a
 * rule the visitor can check and save. This is a small keyword parser, not AI: it understands a fixed set of
 * phrases and says what it understood and what it did not, so nothing is guessed silently. An AI version could
 * sit behind the same result shape later (Phase 18g).
 */

export interface PlaceMatch {
  lat: number;
  lon: number;
  label: string;
}

export type PlaceResolver = (text: string) => PlaceMatch | null;

export interface ParsedRule {
  conditions: RuleConditions;
  name: string;
  /** What was understood, for the visitor to check, for example "below 5,000 ft". */
  understood: string[];
  /** Words that were not understood. */
  ignored: string[];
  /** Problems that stop the rule from being created. */
  errors: string[];
  ok: boolean;
}

export const DEFAULT_AREA_NM = 25;
const NM_PER_MILE = 0.868976;
const NM_PER_KM = 0.539957;

const STOP = new Set([
  "alert",
  "alerts",
  "me",
  "tell",
  "notify",
  "when",
  "whenever",
  "if",
  "a",
  "an",
  "any",
  "the",
  "is",
  "are",
  "there",
  "that",
  "which",
  "i",
  "want",
  "to",
  "know",
  "about",
  "show",
  "of",
  "in",
  "at",
  "for",
  "with",
  "and",
  "or",
  "on",
  "aircraft",
  "plane",
  "planes",
  "flight",
  "flights",
  "jet",
  "jets",
  "appears",
  "appear",
  "comes",
  "come",
  "gets",
  "get",
  "goes",
  "go",
  "near",
  "within",
  "around",
  "than",
  "less",
  "more",
  "ft",
  "feet",
  "nm",
  "miles",
  "mile",
  "mi",
  "km",
  "starting",
  "starts",
  "begins",
  "beginning",
  "callsign",
  "number",
  "my",
  "area",
  "from",
  "up",
  "please",
  "new",
  "any",
  "anything",
  "something",
]);

const KIND_WORDS: Record<string, AircraftKind> = {
  heavy: "widebody",
  heavies: "widebody",
  widebody: "widebody",
  widebodies: "widebody",
  "wide-body": "widebody",
  narrowbody: "narrowbody",
  narrowbodies: "narrowbody",
  "narrow-body": "narrowbody",
  bizjet: "bizjet",
  bizjets: "bizjet",
  helicopter: "helicopter",
  helicopters: "helicopter",
  heli: "helicopter",
  helis: "helicopter",
  chopper: "helicopter",
  choppers: "helicopter",
  glider: "glider",
  gliders: "glider",
  balloon: "balloon",
  balloons: "balloon",
  drone: "drone",
  drones: "drone",
};

function clean(token: string): string {
  let out = "";
  for (const ch of token) {
    if (
      ch === "." ||
      ch === "," ||
      ch === ";" ||
      ch === ":" ||
      ch === "!" ||
      ch === "?" ||
      ch === '"' ||
      ch === "'"
    )
      continue;
    out += ch;
  }
  return out;
}

/** "5000", "5,000", "5k" or "fl350" in feet; null when it is not a number. */
export function parseAltitudeFt(token: string): number | null {
  const t = clean(token).toLowerCase();
  if (t.startsWith("fl") && t.length > 2) {
    const n = Number(t.slice(2));
    return Number.isFinite(n) && n >= 0 && n <= 600 ? n * 100 : null;
  }
  let mult = 1;
  let body = t;
  if (body.endsWith("k")) {
    mult = 1000;
    body = body.slice(0, -1);
  }
  body = body.split(",").join("");
  if (body === "" || !(body[0] && body[0] >= "0" && body[0] <= "9")) return null;
  const n = Number(body);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

function numberToken(token: string | undefined): number | null {
  if (!token) return null;
  const t = clean(token).split(",").join("");
  if (t === "" || !(t[0] && t[0] >= "0" && t[0] <= "9")) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseRuleText(text: string, resolve: PlaceResolver): ParsedRule {
  const tokens = text
    .toLowerCase()
    .split(" ")
    .map(clean)
    .filter((t) => t !== "");
  const c: RuleConditions = {};
  const understood: string[] = [];
  const errors: string[] = [];
  const used = new Array<boolean>(tokens.length).fill(false);
  const mark = (...idx: number[]) => idx.forEach((i) => (used[i] = true));

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    const next = tokens[i + 1];
    const next2 = tokens[i + 2];

    if (t === "military" || t === "mil" || t === "government" || t === "gov") {
      c.military = true;
      understood.push("military aircraft");
      mark(i);
      continue;
    }
    const kind = KIND_WORDS[t];
    if (kind) {
      c.kinds = [...new Set([...(c.kinds ?? []), kind])];
      understood.push(t);
      mark(i);
      continue;
    }
    // Two-word kinds.
    if (
      (t === "business" || t === "private") &&
      (next === "jet" || next === "jets" || next === "plane" || next === "planes")
    ) {
      c.kinds = [...new Set([...(c.kinds ?? []), "bizjet" as AircraftKind])];
      understood.push("business jet");
      mark(i, i + 1);
      i += 1;
      continue;
    }
    if (
      (t === "light" || t === "small" || t === "general") &&
      (next === "aircraft" || next === "plane" || next === "planes" || next === "aviation")
    ) {
      c.kinds = [...new Set([...(c.kinds ?? []), "light" as AircraftKind])];
      understood.push("light aircraft");
      mark(i, i + 1);
      i += 1;
      continue;
    }
    if (t === "ga" || t === "cessna") {
      c.kinds = [...new Set([...(c.kinds ?? []), "light" as AircraftKind])];
      understood.push("light aircraft");
      mark(i);
      continue;
    }
    if (t === "airliner" || t === "airliners") {
      c.kinds = [
        ...new Set([...(c.kinds ?? []), "narrowbody" as AircraftKind, "widebody" as AircraftKind]),
      ];
      understood.push("airliners");
      mark(i);
      continue;
    }

    // Altitude.
    if (t === "below" || t === "under" || t === "lower") {
      const a = parseAltitudeFt(next === "than" ? (next2 ?? "") : (next ?? ""));
      if (a != null) {
        c.altMaxFt = a;
        understood.push("below " + a.toLocaleString("en-US") + " ft");
        const skip = next === "than" ? 2 : 1;
        for (let k = 0; k <= skip; k++) mark(i + k);
        i += skip;
        continue;
      }
    }
    if (t === "above" || t === "over" || t === "higher") {
      const a = parseAltitudeFt(next === "than" ? (next2 ?? "") : (next ?? ""));
      if (a != null) {
        c.altMinFt = a;
        understood.push("above " + a.toLocaleString("en-US") + " ft");
        const skip = next === "than" ? 2 : 1;
        for (let k = 0; k <= skip; k++) mark(i + k);
        i += skip;
        continue;
      }
    }
    if (t === "between") {
      const lo = parseAltitudeFt(next ?? "");
      const hi = next2 === "and" || next2 === "to" ? parseAltitudeFt(tokens[i + 3] ?? "") : null;
      if (lo != null && hi != null) {
        c.altMinFt = Math.min(lo, hi);
        c.altMaxFt = Math.max(lo, hi);
        understood.push(
          "between " +
            c.altMinFt.toLocaleString("en-US") +
            " and " +
            c.altMaxFt.toLocaleString("en-US") +
            " ft",
        );
        mark(i, i + 1, i + 2, i + 3);
        i += 3;
        continue;
      }
    }

    // Callsign.
    if ((t === "callsign" || t === "flight") && next !== undefined) {
      let j = i + 1;
      // "callsign starting with UAL": skip the filler words.
      while (
        j < tokens.length &&
        ["starting", "starts", "begins", "beginning", "with", "number"].includes(tokens[j] ?? "")
      )
        j++;
      const v = (tokens[j] ?? "").toUpperCase();
      if (v.length >= 1 && v.length <= 8 && isAlnum(v) && !STOP.has(v.toLowerCase())) {
        c.callsignPrefix = v;
        understood.push("flight " + v + "…");
        for (let k = i; k <= j; k++) mark(k);
        i = j;
        continue;
      }
    }

    // Squawk and emergencies.
    if ((t === "squawk" || t === "squawking") && next !== undefined && isSquawk(next)) {
      c.squawk = next;
      understood.push("squawk " + next);
      mark(i, i + 1);
      i += 1;
      continue;
    }
    if (t === "emergency" || t === "mayday") {
      c.squawk = "7700";
      understood.push("emergency squawk 7700");
      mark(i);
      continue;
    }
    if (t === "hijack" || t === "hijacking") {
      c.squawk = "7500";
      understood.push("hijack squawk 7500");
      mark(i);
      continue;
    }

    // In the air or on the ground.
    if (t === "airborne" || t === "flying") {
      c.airborne = true;
      understood.push("in the air");
      mark(i);
      continue;
    }
    if (t === "taxiing" || t === "parked") {
      c.airborne = false;
      understood.push("on the ground");
      mark(i);
      continue;
    }
    if (t === "on" && next === "the" && next2 === "ground") {
      c.airborne = false;
      understood.push("on the ground");
      mark(i, i + 1, i + 2);
      i += 2;
      continue;
    }
    if (t === "in" && next === "the" && next2 === "air") {
      c.airborne = true;
      understood.push("in the air");
      mark(i, i + 1, i + 2);
      i += 2;
      continue;
    }

    // Area: "within 40 nm of JFK", "within 40 miles of new york", "near JFK".
    if (t === "within" || t === "near" || t === "around" || t === "over") {
      let j = i + 1;
      let radius: number | null = null;
      if (t === "within") {
        const n = numberToken(tokens[j]);
        if (n != null) {
          radius = n;
          j += 1;
          const unit = tokens[j];
          if (unit === "mi" || unit === "mile" || unit === "miles") {
            radius = n * NM_PER_MILE;
            j += 1;
          } else if (unit === "km") {
            radius = n * NM_PER_KM;
            j += 1;
          } else if (unit === "nm" || unit === "nmi") {
            j += 1;
          }
        }
      }
      if (t === "over" && !isPlaceStart(tokens, i + 1, resolve)) continue;
      if (tokens[j] === "of") j += 1;
      // The place is the rest of the words up to a stop word that starts another condition.
      const words: string[] = [];
      let k = j;
      while (k < tokens.length && !isConditionStart(tokens[k] ?? "")) {
        words.push(tokens[k] ?? "");
        k += 1;
      }
      if (words.length === 0) continue;
      const place = resolve(words.join(" "));
      if (!place) {
        errors.push(
          'I could not find the place "' + words.join(" ") + '". Try an airport code such as JFK.',
        );
        for (let m = i; m < k; m++) mark(m);
        i = k - 1;
        continue;
      }
      const r = radius ?? DEFAULT_AREA_NM;
      if (!(r >= 1 && r <= MAX_AREA_NM)) {
        errors.push("The radius must be between 1 and " + MAX_AREA_NM + " nm.");
      } else {
        c.area = {
          lat: place.lat,
          lon: place.lon,
          radiusNm: Math.round(r * 10) / 10,
          label: place.label,
        };
        understood.push(
          "within " +
            c.area.radiusNm +
            " nm of " +
            place.label +
            (radius == null ? " (default radius)" : ""),
        );
      }
      for (let m = i; m < k; m++) mark(m);
      i = k - 1;
      continue;
    }
  }

  const ignored = tokens.filter((t, i) => !used[i] && !STOP.has(t) && !isNumberish(t));
  if (!hasConditions(c) && errors.length === 0) {
    errors.push(
      'I did not find anything to look for. Try something like "military aircraft within 50 nm of JFK".',
    );
  }
  const lo = c.altMinFt;
  const hi = c.altMaxFt;
  if (lo !== undefined && hi !== undefined && lo > hi)
    errors.push("The lowest altitude is above the highest.");
  return {
    conditions: c,
    name: hasConditions(c) ? describeConditions(c) : "",
    understood,
    ignored,
    errors,
    ok: errors.length === 0 && hasConditions(c),
  };
}

function isAlnum(s: string): boolean {
  for (const ch of s) {
    const ok = (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9");
    if (!ok) return false;
  }
  return s.length > 0;
}

function isSquawk(s: string): boolean {
  if (s.length !== 4) return false;
  for (const ch of s) if (ch < "0" || ch > "7") return false;
  return true;
}

function isNumberish(t: string): boolean {
  return t !== "" && (t[0] ?? "") >= "0" && (t[0] ?? "") <= "9";
}

const CONDITION_STARTS = new Set([
  "below",
  "under",
  "above",
  "over",
  "between",
  "callsign",
  "squawk",
  "squawking",
  "military",
  "heavy",
  "heavies",
  "airborne",
  "taxiing",
  "and",
  "that",
  "which",
  "when",
  "with",
]);

function isConditionStart(t: string): boolean {
  return CONDITION_STARTS.has(t) || KIND_WORDS[t] !== undefined;
}

function isPlaceStart(tokens: string[], i: number, resolve: PlaceResolver): boolean {
  const w: string[] = [];
  for (let k = i; k < tokens.length && !isConditionStart(tokens[k] ?? ""); k++)
    w.push(tokens[k] ?? "");
  return w.length > 0 && resolve(w.join(" ")) !== null;
}
