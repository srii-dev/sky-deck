/*
 * Parsers for aviation weather advisories and pilot reports (Phase 7e), from the aviationweather.gov data API
 * (checked with one real request each on 2026-11-08):
 *  - /api/data/airsigmet  US SIGMETs (coords, hazard, validity, altitudes in feet)
 *  - /api/data/isigmet    international SIGMETs (same idea, about 170 KB for the whole world)
 *  - /api/data/gairmet    graphical AIRMETs: several forecast hours, hazards IFR, MT_OBSC, TURB-LO/HI, ICE, FZLVL, LLWS
 *  - /api/data/pirep      pilot reports; needs a bounding box (bbox=south,west,north,east) and age in hours
 * The wind/temperature product (/api/data/windtemp) answers that it was discontinued, so winds aloft (7f) is not built.
 * Pure functions: the server loader fetches, these only parse. Anything missing stays null.
 */

export type AdvisoryKind = "sigmet" | "isigmet" | "gairmet";
export type Severity = "high" | "moderate" | "info";

export interface Advisory {
  id: string;
  kind: AdvisoryKind;
  hazard: string;
  /** Plain-English hazard name. */
  label: string;
  severity: Severity;
  /** Polygon ring as [lon, lat] pairs, closed. */
  ring: [number, number][];
  baseFt: number | null;
  topFt: number | null;
  validFrom: number | null;
  validTo: number | null;
  /** Raw bulletin text, or the reason for G-AIRMETs. */
  text: string;
}

export interface Pirep {
  id: string;
  lat: number;
  lon: number;
  obsAt: number | null;
  aircraft: string | null;
  /** Flight level in hundreds of feet, as reported. */
  flightLevel: number | null;
  turbulence: string | null;
  icing: string | null;
  severity: Severity;
  raw: string;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};
const asRaw = (v: unknown): Raw | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;

const HAZARD_LABELS: Record<string, string> = {
  TURB: "Turbulence",
  "TURB-LO": "Turbulence (low level)",
  "TURB-HI": "Turbulence (high level)",
  TS: "Thunderstorms",
  CONVECTIVE: "Convective SIGMET",
  ICE: "Icing",
  IFR: "IFR conditions",
  MT_OBSC: "Mountain obscuration",
  FZLVL: "Freezing level",
  M_FZLVL: "Multiple freezing levels",
  LLWS: "Low-level wind shear",
  TC: "Tropical cyclone",
  VA: "Volcanic ash",
  MTW: "Mountain wave",
  SS: "Sandstorm",
  DS: "Duststorm",
  RDOACT: "Radioactive cloud",
};

export function hazardLabel(hazard: string): string {
  const key = hazard.toUpperCase();
  return HAZARD_LABELS[key] ?? hazard;
}

/** Colour group for a hazard (used by the map layer). */
export function hazardColor(hazard: string): string {
  switch (hazard.toUpperCase()) {
    case "CONVECTIVE":
    case "TS":
    case "TC":
    case "VA":
      return "#ef4444";
    case "TURB":
    case "TURB-LO":
    case "TURB-HI":
    case "MTW":
    case "LLWS":
      return "#f59e0b";
    case "ICE":
    case "FZLVL":
    case "M_FZLVL":
      return "#22d3ee";
    case "IFR":
    case "MT_OBSC":
      return "#a78bfa";
    default:
      return "#94a3b8";
  }
}

function hazardSeverity(hazard: string): Severity {
  switch (hazard.toUpperCase()) {
    case "CONVECTIVE":
    case "TS":
    case "TC":
    case "VA":
      return "high";
    case "TURB":
    case "ICE":
    case "MTW":
    case "LLWS":
      return "moderate";
    default:
      return "info";
  }
}

function toRing(coords: unknown): [number, number][] | null {
  if (!Array.isArray(coords)) return null;
  const ring: [number, number][] = [];
  for (const c of coords) {
    const r = asRaw(c);
    if (!r) continue;
    const lat = typeof r["lat"] === "string" ? Number(r["lat"]) : num(r["lat"]);
    const lon = typeof r["lon"] === "string" ? Number(r["lon"]) : num(r["lon"]);
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1]))
    ring.push([first[0], first[1]]);
  return ring.length >= 4 ? ring : null;
}

/** A polygon as drawn on the map; SIGMET polygons are only a few hundred points at most. */
const MAX_ADVISORIES = 300;

export function parseSigmets(json: unknown, kind: "sigmet" | "isigmet", nowMs: number): Advisory[] {
  if (!Array.isArray(json)) return [];
  const out: Advisory[] = [];
  for (const item of json) {
    const r = asRaw(item);
    if (!r) continue;
    const hazard = str(r["hazard"]);
    const ring = toRing(r["coords"]);
    if (!hazard || !ring) continue;
    const from = num(r["validTimeFrom"]);
    const to = num(r["validTimeTo"]);
    if (to != null && to * 1000 < nowMs) continue;
    const series = str(r["seriesId"]) ?? str(r["alphaChar"]) ?? "";
    const origin = str(r["icaoId"]) ?? "";
    const text = str(r["rawAirSigmet"]) ?? str(r["rawSigmet"]) ?? "";
    // US SIGMETs call the top altitudeHi2 (feet); international ones use top and base.
    const top = num(r["top"]) ?? num(r["altitudeHi2"]) ?? num(r["altitudeHi1"]);
    const base = num(r["base"]) ?? num(r["altitudeLow1"]) ?? num(r["altitudeLow2"]);
    out.push({
      id: kind + ":" + origin + ":" + series + ":" + hazard + ":" + (from ?? ""),
      kind,
      hazard,
      label: hazardLabel(hazard),
      severity: hazardSeverity(hazard),
      ring,
      baseFt: base,
      topFt: top,
      validFrom: from == null ? null : from * 1000,
      validTo: to == null ? null : to * 1000,
      text,
    });
    if (out.length >= MAX_ADVISORIES) break;
  }
  return out;
}

/**
 * G-AIRMETs come in forecast slots (0, 3, 6, 9, 12 hours). Only the slot whose valid time is closest to now is
 * kept, so overlapping slots are not drawn on top of each other. Line features (freezing level lines) are not drawn.
 */
export function parseGairmets(json: unknown, nowMs: number): Advisory[] {
  if (!Array.isArray(json)) return [];
  const rows: { r: Raw; valid: number }[] = [];
  for (const item of json) {
    const r = asRaw(item);
    const validIso = r ? str(r["validTime"]) : null;
    const valid = validIso ? Date.parse(validIso) : NaN;
    if (!r || !Number.isFinite(valid)) continue;
    rows.push({ r, valid });
  }
  if (rows.length === 0) return [];
  let best = rows[0]?.valid ?? 0;
  for (const row of rows) {
    if (Math.abs(row.valid - nowMs) < Math.abs(best - nowMs)) best = row.valid;
  }
  const out: Advisory[] = [];
  for (const { r, valid } of rows) {
    if (valid !== best) continue;
    const hazard = str(r["hazard"]);
    if (!hazard || str(r["geometryType"])?.toUpperCase() !== "AREA") continue;
    const ring = toRing(r["coords"]);
    if (!ring) continue;
    const expire = num(r["expireTime"]);
    if (expire != null && expire * 1000 < nowMs) continue;
    const reason = str(r["due_to"]) ?? "";
    const tag = str(r["tag"]) ?? "";
    out.push({
      id: "gairmet:" + tag + ":" + hazard + ":" + out.length,
      kind: "gairmet",
      hazard,
      label: hazardLabel(hazard),
      severity: hazardSeverity(hazard),
      ring,
      baseFt: null,
      topFt: null,
      validFrom: valid,
      validTo: expire == null ? null : expire * 1000,
      text: reason,
    });
    if (out.length >= MAX_ADVISORIES) break;
  }
  return out;
}

function intensityRank(s: string | null): number {
  if (!s) return 0;
  const t = s.toUpperCase();
  if (t.includes("EXTRM") || t.includes("SEV")) return 3;
  if (t.includes("MOD")) return 2;
  if (t.length > 0) return 1;
  return 0;
}

export const MAX_PIREPS = 400;

export function parsePireps(json: unknown): Pirep[] {
  if (!Array.isArray(json)) return [];
  const out: Pirep[] = [];
  for (const item of json) {
    const r = asRaw(item);
    if (!r) continue;
    const lat = num(r["lat"]);
    const lon = num(r["lon"]);
    const raw = str(r["rawOb"]);
    if (lat == null || lon == null || !raw) continue;
    const obs = num(r["obsTime"]);
    const turb = str(r["tbInt1"]);
    const ice = str(r["icgInt1"]);
    const rank = Math.max(intensityRank(turb), intensityRank(ice));
    out.push({
      id: "pirep:" + (str(r["icaoId"]) ?? "") + ":" + (obs ?? "") + ":" + lat + ":" + lon,
      lat,
      lon,
      obsAt: obs == null ? null : obs * 1000,
      aircraft: str(r["acType"]),
      flightLevel: num(r["fltLvl"]),
      turbulence: turb,
      icing: ice,
      severity: rank >= 3 ? "high" : rank === 2 ? "moderate" : "info",
      raw,
    });
  }
  // Newest first, then cap.
  out.sort((a, b) => (b.obsAt ?? 0) - (a.obsAt ?? 0));
  return out.slice(0, MAX_PIREPS);
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#ef4444",
  moderate: "#f59e0b",
  info: "#94a3b8",
};

/** "FL150", or "15,000 ft" for a plain feet value; null stays null. */
export function altitudeText(ft: number | null): string | null {
  if (ft == null) return null;
  if (ft >= 18000) return "FL" + Math.round(ft / 100);
  return Math.round(ft).toLocaleString("en-US") + " ft";
}
