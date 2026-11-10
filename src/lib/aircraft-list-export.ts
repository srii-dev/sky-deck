/*
 * Aircraft list export (Phase 22l): the aircraft the page is showing right now as a CSV file. Built in the browser,
 * nothing is uploaded. The feed's text fields (callsign, registration, operator, type) come from third parties, so
 * every text cell is made safe for spreadsheets: quoted when needed, and a cell that starts with = + - or @ gets a
 * leading apostrophe so it cannot run as a formula. Pure functions.
 */
import type { Aircraft } from "./aircraft";
import { cleanText, safeFilePart, TRAIL_CREDIT } from "./trail-export";

const NL = String.fromCharCode(10);

export const LIST_COLUMNS = [
  "icao_hex",
  "callsign",
  "registration",
  "type",
  "category",
  "operator",
  "latitude",
  "longitude",
  "altitude_ft",
  "ground_speed_kt",
  "track_deg",
  "vertical_rate_fpm",
  "squawk",
  "on_ground",
] as const;

/** One CSV text cell: control characters removed, formulas defused, quoted when it holds a comma, quote or space edge. */
export function csvText(value: string | null | undefined, max = 80): string {
  let t = cleanText(value ?? "", max);
  if (t === "") return "";
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return /[",]/.test(t) || t !== t.trim() ? '"' + t.split('"').join('""') + '"' : t;
}

const num = (v: number | null | undefined, digits: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "";

export const LIST_MAX_ROWS = 5000;

export function aircraftListToCsv(
  list: readonly Aircraft[],
  meta: { exportedAt: Date; source?: string | null | undefined },
): string {
  const rows = list.slice(0, LIST_MAX_ROWS);
  const lines = [
    "# SkyDeck aircraft list: the aircraft shown on the map when this file was made",
    "# " +
      TRAIL_CREDIT.replace(
        "collected by this browser while it was open",
        "as received by this browser",
      ),
    "# Exported " +
      meta.exportedAt.toISOString() +
      (meta.source ? "; last provider: " + cleanText(meta.source, 30) : "") +
      (list.length > rows.length ? "; first " + rows.length + " of " + list.length + " rows" : ""),
    LIST_COLUMNS.join(","),
  ];
  for (const a of rows) {
    lines.push(
      [
        csvText(a.hex.toUpperCase(), 12),
        csvText(a.callsign, 12),
        csvText(a.registration, 16),
        csvText(a.type, 8),
        csvText(a.kindLabel, 30),
        csvText(a.operator, 60),
        num(a.lat, 5),
        num(a.lon, 5),
        a.onGround ? "" : num(a.altFt, 0),
        num(a.gs, 0),
        num(a.track, 0),
        num(a.vRate, 0),
        csvText(a.squawk, 4),
        a.onGround ? "true" : "false",
      ].join(","),
    );
  }
  return lines.join(NL) + NL;
}

export function aircraftListFilename(exportedAt: Date): string {
  const stamp = exportedAt
    .toISOString()
    .slice(0, 16)
    .split("-")
    .join("")
    .split(":")
    .join("")
    .replace("T", "-");
  return "skydeck-aircraft-" + safeFilePart(stamp) + ".csv";
}
