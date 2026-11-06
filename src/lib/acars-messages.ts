/*
 * ACARS messages as returned by the Airframes API (GET /v1/messages), normalised into our own shape.
 * Pure functions: no network, no DOM. Message text is untrusted input: it is cleaned and length-capped here
 * and must only ever be rendered as plain text.
 */

export interface AcarsMessage {
  id: number;
  /** Receive time in ms since the epoch, or null when the API gave none we could read. */
  time: number | null;
  tail: string | null;
  flight: string | null;
  label: string | null;
  fromHex: string | null;
  toHex: string | null;
  /** MHz when the API reports a number. */
  frequency: number | null;
  /** acars, vdl, hfdl or satcom, as reported. */
  sourceType: string | null;
  departing: string | null;
  destination: string | null;
  /** Cleaned, plain-text message body (may be empty). */
  text: string;
}

export const MAX_TEXT_CHARS = 1000;

/**
 * Characters removed from message text: control characters (tab and newline are kept), zero-width
 * characters, bidirectional overrides and the byte order mark. Numeric code points are used on purpose,
 * so no invisible characters ever appear in this source file.
 */
function isUnsafeCodePoint(cp: number): boolean {
  return (
    (cp <= 0x08 && cp >= 0x00) ||
    cp === 0x0b ||
    cp === 0x0c ||
    (cp >= 0x0e && cp <= 0x1f) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

function stripUnsafe(s: string): string {
  let out = "";
  for (const ch of s) {
    if (!isUnsafeCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

/** Clean untrusted message text: strip unsafe characters, tidy line breaks, cap the length. */
export function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  let s = stripUnsafe(value.replace(/\r\n?/g, "\n"));
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > MAX_TEXT_CHARS) s = `${s.slice(0, MAX_TEXT_CHARS)}...`;
  return s;
}

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = sanitizeText(v);
  return s.length ? s : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Seconds or milliseconds since the epoch.
    return v < 1e11 ? v * 1000 : v;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Normalise one API message. Returns null when it has no usable numeric id. */
export function normalizeAirframesMessage(raw: unknown): AcarsMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = num(m["id"]);
  if (id == null) return null;
  return {
    id,
    time: parseTime(m["timestamp"]) ?? parseTime(m["createdAt"]),
    tail: str(m["tail"]),
    flight: str(m["flightNumber"]),
    label: str(m["label"]),
    fromHex: str(m["fromHex"]),
    toHex: str(m["toHex"]),
    frequency: num(m["frequency"]),
    sourceType: str(m["sourceType"]),
    departing: str(m["departingAirport"]),
    destination: str(m["destinationAirport"]),
    text: sanitizeText(m["text"]),
  };
}

/** Normalise an API response body (expected: an array). Skips bad items; newest first. */
export function normalizeAirframesMessages(json: unknown): AcarsMessage[] {
  if (!Array.isArray(json)) return [];
  const out: AcarsMessage[] = [];
  for (const item of json) {
    const m = normalizeAirframesMessage(item);
    if (m) out.push(m);
  }
  return out.sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.id - a.id);
}
