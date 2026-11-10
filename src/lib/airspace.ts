/*
 * Airspace areas (Phase 8d and part of 8c), from two FAA ArcGIS layers on services6.arcgis.com. Checked with
 * real requests on 2026-11-09 (CORS open, a bounding-box query answers in about a second):
 *  - Class_Airspace: Class B, C, D and E surface areas with floor and ceiling (the plan named
 *    "Boundary_Airspace", but that layer holds ARTCC boundaries and special rules, not Class B/C/D).
 *  - Special_Use_Airspace: prohibited, restricted, warning and alert areas and MOAs (1,545 features), with a
 *    text of the times of use. Whether an area is active right now is NOT known from this data.
 * Temporary flight restrictions are not available: the only related FAA layer (National_Defense_Airspace_TFR_Areas)
 * holds 8 standing areas, not the TFRs issued day to day, so Phase 8c is not built.
 * Pure functions: the server loader fetches, these parse. Educational use only, not for flight planning.
 */

export type AirspaceLayer = "class" | "special";

export type AirspaceKind = "B" | "C" | "D" | "R" | "P" | "W" | "A" | "MOA";

export interface Airspace {
  id: string;
  layer: AirspaceLayer;
  kind: AirspaceKind;
  name: string;
  icao: string | null;
  /** For example "surface" or "1,200 ft MSL" or "FL180". Null when the FAA gives no value. */
  lower: string | null;
  upper: string | null;
  /** Text of the times of use (special use areas only). */
  hours: string | null;
  /** GeoJSON polygon coordinates: a list of rings, each a list of [lon, lat]. MultiPolygons become several areas. */
  rings: [number, number][][];
}

export const KIND_LABELS: Record<AirspaceKind, string> = {
  B: "Class B",
  C: "Class C",
  D: "Class D",
  R: "Restricted area",
  P: "Prohibited area",
  W: "Warning area",
  A: "Alert area",
  MOA: "Military operations area",
};

export const KIND_COLORS: Record<AirspaceKind, string> = {
  B: "#3b82f6",
  C: "#d946ef",
  D: "#38bdf8",
  R: "#f97316",
  P: "#ef4444",
  W: "#f59e0b",
  A: "#eab308",
  MOA: "#a78bfa",
};

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The FAA uses -9998 (and similar) for "no value". */
const NO_VALUE_BELOW = -9000;

/**
 * "surface", "1,200 ft MSL", "1,200 ft above ground" or "FL180" from the FAA value, unit and reference code.
 * Returns null when there is no value.
 */
/** A number, or a string holding one: the special use layer stores its altitudes as text. */
function numberish(v: unknown): number | null {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return num(v);
}

export function formatLimit(value: unknown, unit: unknown, code: unknown): string | null {
  const v = numberish(value);
  if (v == null || v <= NO_VALUE_BELOW) return null;
  const uom = (str(unit) ?? "").toUpperCase();
  const ref = (str(code) ?? "").toUpperCase();
  if (uom === "FL" || ref === "STD") return "FL" + Math.round(v);
  if (ref === "SFC" || (v === 0 && ref !== "MSL"))
    return v === 0 ? "surface" : fmtFt(v) + " above ground";
  if (ref === "AGL") return fmtFt(v) + " above ground";
  return fmtFt(v) + (ref === "MSL" ? " MSL" : "");
}

function fmtFt(v: number): string {
  return Math.round(v).toLocaleString("en-US") + " ft";
}

const CLASS_KINDS: Record<string, AirspaceKind> = { B: "B", C: "C", D: "D" };
const SPECIAL_KINDS: Record<string, AirspaceKind> = {
  R: "R",
  P: "P",
  W: "W",
  A: "A",
  MOA: "MOA",
};

function polygons(geometry: unknown): [number, number][][][] {
  const g = asRaw(geometry);
  const coords = g?.["coordinates"];
  if (!g || !Array.isArray(coords)) return [];
  const clean = (poly: unknown): [number, number][][] | null => {
    if (!Array.isArray(poly)) return null;
    const rings: [number, number][][] = [];
    for (const ring of poly) {
      if (!Array.isArray(ring)) continue;
      const pts: [number, number][] = [];
      for (const pt of ring) {
        if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
          pts.push([pt[0], pt[1]]);
        }
      }
      if (pts.length >= 4) rings.push(pts);
    }
    return rings.length ? rings : null;
  };
  if (g["type"] === "Polygon") {
    const p = clean(coords);
    return p ? [p] : [];
  }
  if (g["type"] === "MultiPolygon") {
    return coords.map(clean).filter((p): p is [number, number][][] => !!p);
  }
  return [];
}

/** Areas from an ArcGIS GeoJSON answer. Features of other kinds (for example Mode C veils) are skipped. */
export function parseAirspace(json: unknown, layer: AirspaceLayer): Airspace[] {
  const root = asRaw(json);
  const features = root?.["features"];
  if (!Array.isArray(features)) return [];
  const out: Airspace[] = [];
  for (const item of features) {
    const f = asRaw(item);
    const props = asRaw(f?.["properties"]);
    if (!f || !props) continue;
    const kindKey = layer === "class" ? str(props["CLASS"]) : str(props["TYPE_CODE"]);
    const kind = kindKey
      ? (layer === "class" ? CLASS_KINDS : SPECIAL_KINDS)[kindKey.toUpperCase()]
      : undefined;
    if (!kind) continue;
    const name = str(props["NAME"]) ?? KIND_LABELS[kind];
    const objectId = num(props["OBJECTID"]) ?? out.length;
    const polys = polygons(f["geometry"]);
    polys.forEach((rings, i) => {
      out.push({
        id: layer + ":" + objectId + ":" + i,
        layer,
        kind,
        name,
        icao: str(props["ICAO_ID"]),
        lower: formatLimit(props["LOWER_VAL"], props["LOWER_UOM"], props["LOWER_CODE"]),
        upper: formatLimit(props["UPPER_VAL"], props["UPPER_UOM"], props["UPPER_CODE"]),
        hours: str(props["TIMESOFUSE"]),
        rings,
      });
    });
  }
  return out;
}

/** "surface to 10,000 ft MSL" style text for the floor and ceiling. */
export function limitsText(a: Pick<Airspace, "lower" | "upper">): string | null {
  if (!a.lower && !a.upper) return null;
  return (a.lower ?? "?") + " to " + (a.upper ?? "no upper limit given");
}
