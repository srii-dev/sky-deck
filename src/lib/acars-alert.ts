import type { AcarsMessage } from "./acars-messages";

/*
 * Alert level of an ACARS message, from fixed rules over its text (and the aircraft's live squawk when known).
 * Deterministic on purpose: the card colour must never depend on what an AI model guessed.
 */

export type AcarsAlert = "emergency" | "warning" | "weather" | "position" | "routine";

export const ALERT_LABELS: Record<AcarsAlert, string> = {
  emergency: "Emergency",
  warning: "Caution",
  weather: "Weather / ATC",
  position: "Position report",
  routine: "Routine",
};

/** Alert colour as "r,g,b". */
export const ALERT_RGB: Record<AcarsAlert, string> = {
  emergency: "239,68,68",
  warning: "245,158,11",
  weather: "56,189,248",
  position: "52,211,153",
  routine: "148,163,184",
};

/** List rows: the alert colour fades in from the left edge. */
export function rowGradient(a: AcarsAlert): string {
  const c = ALERT_RGB[a];
  const s = a === "routine" ? 0.14 : a === "position" ? 0.22 : 0.4;
  return `linear-gradient(90deg, rgba(${c},${s}), rgba(${c},0) 70%)`;
}

/** Strength of the card gradient at the bottom edge. Capped so white/70 text keeps 4.5:1 (acars-alert test). */
export const CARD_GRADIENT_STRENGTH: Record<AcarsAlert, number> = {
  emergency: 0.5,
  warning: 0.34,
  weather: 0.34,
  position: 0.3,
  routine: 0.22,
};

/** The floating message card: the alert colour rises from the bottom. */
export function cardGradient(a: AcarsAlert): string {
  const c = ALERT_RGB[a];
  const s = CARD_GRADIENT_STRENGTH[a];
  return `linear-gradient(to top, rgba(${c},${s}), rgba(${c},${s / 3}) 40%, rgba(${c},0) 80%)`;
}

/** Notification-style levels for the list filter. */
export type AcarsFilter = "all" | "interesting" | "breaking";
export function passesFilter(a: AcarsAlert, f: AcarsFilter): boolean {
  if (f === "breaking") return a === "emergency";
  if (f === "interesting") return a === "emergency" || a === "warning" || a === "weather";
  return true;
}

/**
 * The rows of the list: exact duplicates (same flight or registration, label and text) folded into the first,
 * which is the newest because the list is newest first. Rows without text stay out unless they are emergencies
 * or cautions. `duplicates` and `empty` count what was left out, whatever the filter.
 */
export function visibleMessages<T extends Pick<AcarsMessage, "flight" | "tail" | "label" | "text">>(
  messages: readonly T[],
  alertOf: (m: T) => AcarsAlert,
  filter: AcarsFilter,
): { shown: T[]; duplicates: number; empty: number } {
  const seen = new Set<string>();
  const shown: T[] = [];
  let duplicates = 0;
  let empty = 0;
  for (const m of messages) {
    const key = [m.flight ?? m.tail ?? "", m.label ?? "", m.text].join("\u0000");
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    const a = alertOf(m);
    if (!m.text.trim() && a !== "emergency" && a !== "warning") {
      empty += 1;
      continue;
    }
    if (passesFilter(a, filter)) shown.push(m);
  }
  return { shown, duplicates, empty };
}

const EMERGENCY =
  /\b(MAYDAY|PAN[\s-]?PAN|EMERGENCY|EMER|SQUAWK(?:ING)?\s*7[567]00|SQK\s*7[567]00|HIJACK|BOMB THREAT|EVACUAT\w*)\b/;
const WARNING =
  /\b(DIVERT\w*|DIVERSION|MEDICAL|MEDIC|MED EMERG|FIRE|SMOKE|FUMES|ENG(?:INE)?\s*(?:FAIL\w*|SHUT\s*DOWN|INOP)|BIRD\s*STRIKE|SEV(?:ERE)?\s*TURB\w*|LOW FUEL|MIN(?:IMUM)?\s*FUEL|FUEL\s*LEAK|HYD\w*\s*(?:FAIL\w*|LOSS|LEAK)|RETURN(?:ING)?\s*TO\s*(?:FIELD|GATE|STAND)|RTB|UNRULY|DISRUPTIVE|INJUR\w*|LIGHTNING STRIKE|TCAS RA|FAULT|FAIL\w*|GO[\s-]?AROUND|REJECTED TAKE ?OFF|RTO)\b/;
const WEATHER =
  /\b(METAR|TAF|SPECI|SIGMET|AIRMET|ATIS|PDC|CLEARANCE|CLRD|CLX|WX|WIND\w*|TURB\w*|ICING|CB|TSRA|VIS|QNH|ALTM)\b/;
const POSITION = /\b(POS|POSN|POSITION|ETA|FL\d{2,3}|LAT|LON)\b|[NS]\d{4,5}[EW]\d{5,6}/;
/** Labels that carry position or progress reports (OOOI, position, ETA). */
const POSITION_LABELS = new Set([
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "20",
  "21",
  "22",
  "80",
  "H1",
  "QQ",
  "QP",
  "QR",
  "QS",
  "QT",
]);

export function classifyAcars(
  m: Pick<AcarsMessage, "text" | "label">,
  liveSquawk?: string | null,
): AcarsAlert {
  if (liveSquawk === "7700" || liveSquawk === "7600" || liveSquawk === "7500") return "emergency";
  const t = m.text.toUpperCase();
  if (EMERGENCY.test(t)) return "emergency";
  if (WARNING.test(t)) return "warning";
  if (WEATHER.test(t)) return "weather";
  if ((m.label && POSITION_LABELS.has(m.label.toUpperCase())) || POSITION.test(t))
    return "position";
  return "routine";
}
