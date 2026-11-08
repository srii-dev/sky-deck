/*
 * Aircraft details (Phase 22h): what the live feed's own aircraft database says about one
 * aircraft, shown as plain rows with "Unknown" where it says nothing. No other data source is
 * used: the year and the military flag come from the same feed records as the position.
 * Many aircraft have none of these fields, so "Unknown" is common and honest.
 */
import { airlineCode, type Aircraft } from "./aircraft";
import { airlineName } from "./airlines";

export const UNKNOWN = "Unknown";

const FIRST_YEAR = 1900;

/** A four-digit year from a number or a numeric string; anything else is null. */
export function parseYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < FIRST_YEAR || n > 2100) return null;
  return n;
}

/** The readsb "dbFlags" field is a bit set: 1 means military. Other bits (privacy flags) are ignored. */
export function isMilitaryFlag(dbFlags: unknown): boolean {
  return typeof dbFlags === "number" && Number.isInteger(dbFlags) && (dbFlags & 1) === 1;
}

/** "12 years (built 2014)", "Less than a year (built 2026)", or null when there is no usable year. */
export function describeAge(year: number | null | undefined, now: Date): string | null {
  if (year == null) return null;
  const thisYear = now.getUTCFullYear();
  if (year > thisYear) return null; // a future year is a data error, not an age
  const age = thisYear - year;
  if (age === 0) return `Less than a year (built ${year})`;
  return `${age} ${age === 1 ? "year" : "years"} (built ${year})`;
}

export interface DetailField {
  label: string;
  value: string;
  /** False when the value is the "Unknown" placeholder, so the panel can dim it. */
  known: boolean;
  /** Where the value came from, when that is not obvious. */
  note?: string;
}

function field(label: string, value: string | null | undefined, note?: string): DetailField {
  const known = !!value;
  return {
    label,
    value: value || UNKNOWN,
    known,
    ...(known && note ? { note } : {}),
  };
}

/** Rows for the "About this aircraft" card, in a fixed order. */
export function aircraftDetailFields(a: Aircraft, now: Date): DetailField[] {
  const fromCallsign = a.operator ? null : airlineName(airlineCode(a.callsign));
  const fields: DetailField[] = [
    field("Type", a.description ?? a.type),
    field(
      "Operator",
      a.operator ?? fromCallsign,
      fromCallsign ? "From the callsign prefix" : undefined,
    ),
    field("Age", describeAge(a.year, now)),
    field("Emitter category", a.category ? `${a.category} · ${a.kindLabel}` : null),
  ];
  if (a.military) fields.push(field("Flag", "Military (feed database)"));
  return fields;
}
