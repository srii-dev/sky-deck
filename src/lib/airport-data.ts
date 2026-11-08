/*
 * Parsers for the airport data sources (Phase 4). Pure functions, no network: the server functions in
 * airport.functions.ts fetch the raw text or JSON and pass it here.
 * - aviationweather.gov airport, METAR and TAF JSON (US government, public).
 * - FAA National Airspace System status XML.
 * Everything unknown stays null; nothing is guessed.
 */

export interface RunwayInfo {
  /** Pair label as published, for example "04L/22R". */
  id: string;
  lengthFt: number | null;
  widthFt: number | null;
  surface: string | null;
  /** True heading of the first end in degrees, as published. */
  alignment: number | null;
}

export interface AirportInfo {
  icao: string;
  iata: string | null;
  name: string;
  /** Field elevation in metres, as published. */
  elevM: number | null;
  runways: RunwayInfo[];
}

export interface Metar {
  icao: string;
  /** Observation time, ms since the epoch. */
  obsAt: number | null;
  /** Wind direction in degrees true; null when calm or variable. */
  windDir: number | null;
  windVariable: boolean;
  windKt: number | null;
  gustKt: number | null;
  /** Visibility as published, for example "10+" (statute miles). */
  visibility: string | null;
  tempC: number | null;
  dewpointC: number | null;
  /** Altimeter in hPa. */
  altimeterHpa: number | null;
  flightCategory: FlightCategory | null;
  raw: string;
}

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

export interface Taf {
  icao: string;
  raw: string;
  validFrom: number | null;
  validTo: number | null;
}

export type NasKind = "ground-delay" | "delay" | "closure";

export interface NasEvent {
  kind: NasKind;
  airport: string;
  reason: string;
  /** Short plain-text summary line. */
  summary: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

type RawKey =
  | "icaoId"
  | "iataId"
  | "name"
  | "elev"
  | "runways"
  | "id"
  | "dimension"
  | "surface"
  | "alignment"
  | "rawOb"
  | "obsTime"
  | "wdir"
  | "wspd"
  | "wgst"
  | "visib"
  | "temp"
  | "dewp"
  | "altim"
  | "fltCat"
  | "rawTAF"
  | "validTimeFrom"
  | "validTimeTo";
type Raw = Partial<Record<RawKey, unknown>>;

function asRecord(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

/** "12079x200" feet to [length, width]. */
export function parseDimension(s: unknown): [number | null, number | null] {
  const text = str(s);
  if (!text) return [null, null];
  const parts = text.toLowerCase().split("x");
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return [Number.isFinite(a) && parts[0] ? a : null, Number.isFinite(b) && parts[1] ? b : null];
}

export function parseAirportInfo(json: unknown): AirportInfo | null {
  const first = Array.isArray(json) ? asRecord(json[0]) : null;
  if (!first) return null;
  const icao = str(first.icaoId);
  if (!icao) return null;
  const runways: RunwayInfo[] = [];
  if (Array.isArray(first.runways)) {
    for (const item of first.runways) {
      const r = asRecord(item);
      const id = r ? str(r.id) : null;
      if (!r || !id) continue;
      const [lengthFt, widthFt] = parseDimension(r.dimension);
      runways.push({ id, lengthFt, widthFt, surface: str(r.surface), alignment: num(r.alignment) });
    }
  }
  return {
    icao,
    iata: str(first.iataId),
    name: str(first.name) ?? icao,
    elevM: num(first.elev),
    runways,
  };
}

const CATEGORIES: readonly string[] = ["VFR", "MVFR", "IFR", "LIFR"];

export function parseMetar(json: unknown): Metar | null {
  const first = Array.isArray(json) ? asRecord(json[0]) : null;
  if (!first) return null;
  const icao = str(first.icaoId);
  const raw = str(first.rawOb);
  if (!icao || !raw) return null;
  const wdir = first.wdir;
  const variable = typeof wdir === "string" && wdir.toUpperCase() === "VRB";
  const obs = num(first.obsTime);
  const cat = str(first.fltCat);
  const windKt = num(first.wspd);
  const dir = num(wdir);
  return {
    icao,
    obsAt: obs == null ? null : obs * 1000,
    // A direction of 0 with no speed means calm, not a north wind.
    windDir: windKt === 0 ? null : dir,
    windVariable: variable,
    windKt,
    gustKt: num(first.wgst),
    visibility: str(first.visib) ?? (num(first.visib) == null ? null : String(num(first.visib))),
    tempC: num(first.temp),
    dewpointC: num(first.dewp),
    altimeterHpa: num(first.altim),
    flightCategory: cat && CATEGORIES.includes(cat) ? (cat as FlightCategory) : null,
    raw,
  };
}

export function parseTaf(json: unknown): Taf | null {
  const first = Array.isArray(json) ? asRecord(json[0]) : null;
  if (!first) return null;
  const icao = str(first.icaoId);
  const raw = str(first.rawTAF);
  if (!icao || !raw) return null;
  const from = num(first.validTimeFrom);
  const to = num(first.validTimeTo);
  return {
    icao,
    raw,
    validFrom: from == null ? null : from * 1000,
    validTo: to == null ? null : to * 1000,
  };
}

/** Text between the first <tag> and </tag> after position `from`, plus where it ended. */
function between(xml: string, tag: string, from: number): { text: string; end: number } | null {
  const open = "<" + tag + ">";
  const close = "</" + tag + ">";
  const a = xml.indexOf(open, from);
  if (a < 0) return null;
  const b = xml.indexOf(close, a + open.length);
  if (b < 0) return null;
  return { text: xml.slice(a + open.length, b), end: b + close.length };
}

/** Every block of <tag>...</tag> in the text. */
function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const hit = between(xml, tag, at);
    if (!hit) break;
    out.push(hit.text);
    at = hit.end;
  }
  return out;
}

function field(block: string, tag: string): string {
  return between(block, tag, 0)?.text.trim() ?? "";
}

/**
 * Events for one airport from the FAA NAS status XML. `iata` is the three letter code the FAA uses
 * (for example "JFK"). Returns [] when the airport has no entry; the caller decides how to say that.
 */
export function parseNasStatus(xml: string, iata: string): NasEvent[] {
  const code = iata.trim().toUpperCase();
  if (!code) return [];
  const events: NasEvent[] = [];
  for (const b of blocks(xml, "Ground_Delay")) {
    if (field(b, "ARPT").toUpperCase() !== code) continue;
    const avg = field(b, "Avg");
    events.push({
      kind: "ground-delay",
      airport: code,
      reason: field(b, "Reason"),
      summary: avg ? "Ground delay program, average delay " + avg : "Ground delay program",
    });
  }
  for (const b of blocks(xml, "Delay")) {
    if (field(b, "ARPT").toUpperCase() !== code) continue;
    const type = between(b, 'Arrival_Departure Type="Arrival"', 0) ? "Arrival" : "Departure";
    const min = field(b, "Min");
    const max = field(b, "Max");
    const range = min && max ? min + " to " + max : min || max;
    events.push({
      kind: "delay",
      airport: code,
      reason: field(b, "Reason"),
      summary: range ? type + " delays, " + range : type + " delays",
    });
  }
  for (const b of blocks(xml, "Airport")) {
    if (field(b, "ARPT").toUpperCase() !== code) continue;
    const reopen = field(b, "Reopen");
    const reason = field(b, "Reason");
    // Most entries are NOTAMs that close the airport only to some aircraft (for example "CLSD TO NON SKED
    // TRANSIENT GA ACFT EXC ..."). Say so, and leave out the date because the feed gives no year.
    const upper = reason.toUpperCase();
    const partial = upper.includes("CLSD TO") || upper.includes(" EXC ");
    events.push({
      kind: "closure",
      airport: code,
      reason,
      summary: partial
        ? "Closed to some aircraft only (NOTAM)"
        : reopen
          ? "Closure notice, reopens " + reopen
          : "Closure notice",
    });
  }
  return events;
}
