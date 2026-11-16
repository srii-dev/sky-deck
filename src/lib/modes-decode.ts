/*
 * Mode S / ADS-B frame decoder for the message inspector. Pure functions: no network, no DOM.
 * Educational tool: decodes the common ADS-B extended squitter messages (DF17/18) and labels the rest.
 * Not decoded on purpose (labelled instead of guessed): Gillham-coded altitude, GNSS height (TC 20-22),
 * aircraft status (TC 28) and target state (TC 29) messages, Comm-B and ACAS contents.
 * Layouts for surface position (TC 5-8) and operational status (TC 31) follow "The 1090 Megahertz Riddle"
 * (J. Sun, https://mode-s.org/1090mhz/, chapters 4 and 6).
 */

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DF_NAMES: Record<number, string> = {
  0: "Short air-air surveillance (ACAS)",
  4: "Surveillance altitude reply",
  5: "Surveillance identity reply",
  11: "All-call reply",
  16: "Long air-air surveillance (ACAS)",
  17: "ADS-B extended squitter",
  18: "Extended squitter (TIS-B / ADS-R / non-transponder)",
  19: "Military extended squitter",
  20: "Comm-B altitude reply",
  21: "Comm-B identity reply",
  24: "Comm-D (ELM)",
};

const CALLSIGN_CHARS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ#####_###############0123456789######";

const CATEGORY_A = [
  "No category information",
  "Light (< 15,500 lb)",
  "Small (15,500 to 75,000 lb)",
  "Large (75,000 to 300,000 lb)",
  "High vortex large (e.g. B-757)",
  "Heavy (> 300,000 lb)",
  "High performance (> 5 g, > 400 kt)",
  "Rotorcraft",
];
const CATEGORY_B = [
  "No category information",
  "Glider / sailplane",
  "Lighter-than-air",
  "Parachutist / skydiver",
  "Ultralight / hang-glider / paraglider",
  "Reserved",
  "Unmanned aerial vehicle",
  "Space / trans-atmospheric vehicle",
];
const CATEGORY_C = [
  "No category information",
  "Surface emergency vehicle",
  "Surface service vehicle",
  "Point obstacle",
  "Cluster obstacle",
  "Line obstacle",
  "Reserved",
  "Reserved",
];

export type AdsbMessage =
  | { kind: "identification"; typeCode: number; category: string; callsign: string }
  | {
      kind: "airborne-position";
      typeCode: number;
      /** Barometric altitude in feet, or null when it is not decoded or not available. */
      altitudeFt: number | null;
      altitudeNote?: string;
      cprOdd: boolean;
      cprLat: number;
      cprLon: number;
    }
  | {
      kind: "velocity";
      subtype: number;
      speedType: "ground speed" | "indicated airspeed" | "true airspeed";
      speedKt: number | null;
      /** Ground track (subtypes 1, 2) or magnetic heading (subtypes 3, 4), degrees. */
      directionDeg: number | null;
      directionType: "track" | "heading";
      vRateFpm: number | null;
      vRateSource: "barometric" | "GNSS";
    }
  | {
      kind: "surface-position";
      typeCode: number;
      /** Raw 7-bit movement field. */
      movementRaw: number;
      /** Ground speed in knots; for movement 124 it is the lower bound (175 kt or more). Null when not available or reserved. */
      speedKt: number | null;
      speedNote?: string;
      /** Ground track in degrees, or null when the track status bit says it is not valid. */
      trackDeg: number | null;
      cprOdd: boolean;
      cprLat: number;
      cprLon: number;
    }
  | {
      kind: "operational-status";
      /** 0 airborne, 1 surface. */
      subtype: 0 | 1;
      /** ADS-B version number (ME bits 41 to 43); null when the value is reserved. */
      version: number | null;
      /** NIC supplement A bit and the raw 4-bit NACp and 2-bit SIL fields. Their meanings are not decoded. */
      nicSupplementA: number;
      nacpRaw: number;
      silRaw: number;
    }
  | { kind: "other"; typeCode: number; name: string };

export interface DecodedFrame {
  /** Normalised upper-case hex. */
  hex: string;
  bits: 56 | 112;
  df: number;
  dfName: string;
  /** Aircraft address. From the frame for DF11/17/18, otherwise recovered from the parity field. */
  icao: string;
  icaoFrom: "frame" | "parity";
  crcRemainder: number;
  /** True/false for formats that carry a plain CRC (DF11, DF17, DF18); null where it is not applicable. */
  crcOk: boolean | null;
  warnings: string[];
  message: AdsbMessage | null;
}

/**
 * Accepts plain hex, "*8D...;" (dump1090 raw), and "@<12 hex timestamp>8D...;" (AVR with timestamp).
 * Returns upper-case hex of exactly 14 or 28 characters.
 */
export function normaliseFrameHex(input: string): DecodeResult<string> {
  let s = input.trim();
  if (s.startsWith("@")) s = s.slice(13);
  s = s.replace(/^\*/, "").replace(/;$/, "").replace(/\s+/g, "");
  if (s.length === 0) return { ok: false, error: "Empty frame" };
  if (!/^[0-9a-fA-F]+$/.test(s)) return { ok: false, error: "Not hexadecimal" };
  if (s.length !== 14 && s.length !== 28) {
    return { ok: false, error: `Expected 14 or 28 hex characters, got ${s.length}` };
  }
  return { ok: true, value: s.toUpperCase() };
}

function toBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Read `len` bits (len <= 24) starting at bit `start` (0 = most significant bit of byte 0). */
function bitsAt(bytes: Uint8Array, start: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) {
    const p = start + i;
    v = v * 2 + (((bytes[p >> 3] ?? 0) >> (7 - (p & 7))) & 1);
  }
  return v;
}

/** 24-bit Mode S parity remainder over the whole frame (0 means the CRC matches). */
export function crc24(bytes: Uint8Array): number {
  let reg = 0;
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      const feedback = ((reg >> 23) & 1) ^ ((byte >> i) & 1);
      reg = (reg << 1) & 0xffffff;
      if (feedback) reg ^= 0xfff409;
    }
  }
  return reg;
}

const hex6 = (n: number) => n.toString(16).toUpperCase().padStart(6, "0");

function typeCodeName(tc: number): string {
  if (tc >= 1 && tc <= 4) return "Aircraft identification";
  if (tc >= 5 && tc <= 8) return "Surface position (not decoded)";
  if (tc >= 9 && tc <= 18) return "Airborne position (barometric altitude)";
  if (tc === 19) return "Airborne velocity";
  if (tc >= 20 && tc <= 22) return "Airborne position (GNSS height)";
  if (tc === 23) return "Test message (not decoded)";
  if (tc === 28) return "Aircraft status (not decoded)";
  if (tc === 29) return "Target state and status (not decoded)";
  if (tc === 31) return "Aircraft operational status (reserved subtype, not decoded)";
  return "Reserved";
}

/**
 * Surface position movement field (7 bits) to ground speed, from the table in chapter 4 of the Riddle.
 * 0 is "not available" and 125 to 127 are reserved (null). 124 means 175 kt or more (returns 175, the bound).
 */
export function surfaceSpeedKt(n: number): number | null {
  if (n === 0 || n > 124 || n < 0) return null;
  if (n === 1) return 0;
  if (n <= 8) return (n - 1) * 0.125;
  if (n <= 12) return 1 + (n - 9) * 0.25;
  if (n <= 38) return 2 + (n - 13) * 0.5;
  if (n <= 93) return 15 + (n - 39);
  if (n <= 108) return 70 + (n - 94) * 2;
  if (n <= 123) return 100 + (n - 109) * 5;
  return 175;
}

function decodeMe(bytes: Uint8Array): AdsbMessage {
  const me = (start: number, len: number) => bitsAt(bytes, 32 + start, len);
  const tc = me(0, 5);

  if (tc >= 1 && tc <= 4) {
    const ca = me(5, 3);
    const set = tc === 4 ? "A" : tc === 3 ? "B" : tc === 2 ? "C" : "D";
    const table = tc === 4 ? CATEGORY_A : tc === 3 ? CATEGORY_B : tc === 2 ? CATEGORY_C : null;
    let callsign = "";
    for (let i = 0; i < 8; i++) callsign += CALLSIGN_CHARS[me(8 + i * 6, 6)] ?? "#";
    return {
      kind: "identification",
      typeCode: tc,
      category: `${set}${ca}${table?.[ca] ? ` · ${table[ca]}` : ""}`,
      callsign: callsign.replace(/[_#]+$/, "").replace(/_/g, " "),
    };
  }

  if ((tc >= 9 && tc <= 18) || (tc >= 20 && tc <= 22)) {
    const baro = tc <= 18;
    const alt = me(8, 12);
    let altitudeFt: number | null = null;
    let altitudeNote: string | undefined;
    if (!baro) {
      altitudeNote = "GNSS height not decoded";
    } else if (alt === 0) {
      altitudeNote = "Altitude not available";
    } else if (me(15, 1) === 1) {
      // Q bit set: 25 ft steps. Drop the Q bit (field bit index 7) and rebuild the 11-bit value.
      const n = ((alt >> 5) << 4) | (alt & 0x0f);
      altitudeFt = n * 25 - 1000;
    } else {
      altitudeNote = "Gillham-coded altitude (not decoded)";
    }
    return {
      kind: "airborne-position",
      typeCode: tc,
      altitudeFt,
      ...(altitudeNote ? { altitudeNote } : {}),
      cprOdd: me(21, 1) === 1,
      cprLat: me(22, 17),
      cprLon: me(39, 17),
    };
  }

  if (tc >= 5 && tc <= 8) {
    const mov = me(5, 7);
    const speedKt = surfaceSpeedKt(mov);
    const speedNote =
      mov === 0
        ? "Speed not available"
        : mov === 1
          ? "Stopped (under 0.125 kt)"
          : mov === 124
            ? "175 kt or more"
            : mov > 124
              ? "Reserved movement value"
              : undefined;
    return {
      kind: "surface-position",
      typeCode: tc,
      movementRaw: mov,
      speedKt,
      ...(speedNote ? { speedNote } : {}),
      trackDeg: me(12, 1) === 1 ? (me(13, 7) * 360) / 128 : null,
      cprOdd: me(21, 1) === 1,
      cprLat: me(22, 17),
      cprLon: me(39, 17),
    };
  }

  if (tc === 31) {
    const st = me(5, 3);
    if (st === 0 || st === 1) {
      const ver = me(40, 3);
      return {
        kind: "operational-status",
        subtype: st,
        version: ver <= 2 ? ver : null,
        nicSupplementA: me(43, 1),
        nacpRaw: me(44, 4),
        silRaw: me(50, 2),
      };
    }
  }

  if (tc === 19) {
    const subtype = me(5, 3);
    const vrRaw = me(37, 9);
    const vrSign = me(36, 1) === 1 ? -1 : 1;
    const vRateFpm = vrRaw === 0 ? null : vrSign * (vrRaw - 1) * 64;
    const vRateSource = me(35, 1) === 1 ? "barometric" : "GNSS";

    if (subtype === 1 || subtype === 2) {
      const mult = subtype === 2 ? 4 : 1;
      const ewRaw = me(14, 10);
      const nsRaw = me(25, 10);
      if (ewRaw === 0 || nsRaw === 0) {
        return {
          kind: "velocity",
          subtype,
          speedType: "ground speed",
          speedKt: null,
          directionDeg: null,
          directionType: "track",
          vRateFpm,
          vRateSource,
        };
      }
      const vew = (me(13, 1) === 1 ? -1 : 1) * (ewRaw - 1) * mult;
      const vns = (me(24, 1) === 1 ? -1 : 1) * (nsRaw - 1) * mult;
      const track = (Math.atan2(vew, vns) * 180) / Math.PI;
      return {
        kind: "velocity",
        subtype,
        speedType: "ground speed",
        speedKt: Math.hypot(vew, vns),
        directionDeg: (track + 360) % 360,
        directionType: "track",
        vRateFpm,
        vRateSource,
      };
    }

    if (subtype === 3 || subtype === 4) {
      const mult = subtype === 4 ? 4 : 1;
      const headingOk = me(13, 1) === 1;
      const asRaw = me(25, 10);
      return {
        kind: "velocity",
        subtype,
        speedType: me(24, 1) === 1 ? "true airspeed" : "indicated airspeed",
        speedKt: asRaw === 0 ? null : (asRaw - 1) * mult,
        directionDeg: headingOk ? (me(14, 10) * 360) / 1024 : null,
        directionType: "heading",
        vRateFpm,
        vRateSource,
      };
    }
  }

  return { kind: "other", typeCode: tc, name: typeCodeName(tc) };
}

export function decodeFrame(input: string): DecodeResult<DecodedFrame> {
  const norm = normaliseFrameHex(input);
  if (!norm.ok) return norm;
  const hex = norm.value;
  const bytes = toBytes(hex);
  const bits = hex.length === 28 ? 112 : 56;
  const df = bitsAt(bytes, 0, 5);
  const warnings: string[] = [];

  const longFormat = df >= 16;
  if (longFormat && bits === 56) warnings.push(`DF${df} frames are normally 112 bits; got 56`);
  if (!longFormat && bits === 112) warnings.push(`DF${df} frames are normally 56 bits; got 112`);

  const remainder = crc24(bytes);
  const hasAddress = df === 11 || df === 17 || df === 18;
  // DF11/17/18 carry the address in the frame. Other formats XOR it into the parity field (AP), so the
  // address is the CRC of the data bytes XOR the AP field.
  const apAddress = (crc24(bytes.slice(0, bytes.length - 3)) ^ bitsAt(bytes, bits - 24, 24)) >>> 0;
  const icao = hasAddress ? hex6(bitsAt(bytes, 8, 24)) : hex6(apAddress);
  const crcOk = hasAddress ? remainder === 0 : null;
  if (crcOk === false) {
    warnings.push(
      df === 11
        ? "CRC remainder is not zero (may be an interrogator code, or the frame is corrupted)"
        : "CRC does not match (corrupted frame)",
    );
  }
  if (df === 18) warnings.push("DF18: the address may not be an ICAO aircraft address");

  const decodesMe = (df === 17 || df === 18) && bits === 112;
  return {
    ok: true,
    value: {
      hex,
      bits,
      df,
      dfName: DF_NAMES[df] ?? "Unknown / reserved",
      icao,
      icaoFrom: hasAddress ? "frame" : "parity",
      crcRemainder: remainder,
      crcOk,
      warnings,
      message: decodesMe ? decodeMe(bytes) : null,
    },
  };
}

/** Number of longitude zones for a latitude (CPR "NL" function). */
export function cprNl(lat: number): number {
  const a = Math.abs(lat);
  if (a === 0) return 59;
  if (a === 87) return 2;
  if (a > 87) return 1;
  const nz = 15;
  const x = 1 - (1 - Math.cos(Math.PI / (2 * nz))) / Math.cos((Math.PI / 180) * a) ** 2;
  return Math.floor((2 * Math.PI) / Math.acos(x));
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface CprPart {
  cprLat: number;
  cprLon: number;
}

/**
 * Global CPR decode from one even and one odd airborne position frame of the same aircraft.
 * `latestIsOdd` says which of the two was received last. Returns null when the two frames fall in
 * different latitude zones (the aircraft crossed a zone boundary, so they cannot be combined).
 */
export function globalPosition(
  even: CprPart,
  odd: CprPart,
  latestIsOdd: boolean,
): { lat: number; lon: number } | null {
  const lat0 = even.cprLat / 131072;
  const lat1 = odd.cprLat / 131072;
  const j = Math.floor(59 * lat0 - 60 * lat1 + 0.5);
  let latEven = (360 / 60) * (mod(j, 60) + lat0);
  let latOdd = (360 / 59) * (mod(j, 59) + lat1);
  if (latEven >= 270) latEven -= 360;
  if (latOdd >= 270) latOdd -= 360;
  if (cprNl(latEven) !== cprNl(latOdd)) return null;

  const lat = latestIsOdd ? latOdd : latEven;
  const nl = cprNl(lat);
  const ni = Math.max(nl - (latestIsOdd ? 1 : 0), 1);
  const lon0 = even.cprLon / 131072;
  const lon1 = odd.cprLon / 131072;
  const m = Math.floor(lon0 * (nl - 1) - lon1 * nl + 0.5);
  let lon = (360 / ni) * (mod(m, ni) + (latestIsOdd ? lon1 : lon0));
  if (lon >= 180) lon -= 360;
  return { lat, lon };
}

export interface ResolvedPosition {
  lat: number;
  lon: number;
  /** Index of the earlier, opposite-parity frame that this position was combined with; null for a reference-only decode. */
  pairedWith: number | null;
}

export interface ReferencePosition {
  lat: number;
  lon: number;
}

/**
 * For a list of frames in time order, resolve a position for each airborne or surface position frame (valid CRC only).
 * Airborne frames need an earlier opposite-parity frame from the same aircraft. Surface frames need a reference position:
 * with an earlier opposite-parity frame the pair is decoded globally, otherwise the single frame is decoded against the
 * reference (right only within about 45 nm of it). No timestamps are available, so list order is taken as time order and
 * a pair is assumed to be close in time.
 */
export function resolvePositions(
  frames: readonly DecodedFrame[],
  ref?: ReferencePosition | null,
): (ResolvedPosition | null)[] {
  const last = new Map<
    string,
    { even?: { i: number; p: CprPart }; odd?: { i: number; p: CprPart } }
  >();
  return frames.map((f, i) => {
    const m = f.message;
    if (!m || (m.kind !== "airborne-position" && m.kind !== "surface-position") || f.crcOk !== true)
      return null;
    const surface = m.kind === "surface-position";
    const key = `${surface ? "s" : "a"}${f.icao}`;
    const entry = last.get(key) ?? {};
    const mine = { i, p: { cprLat: m.cprLat, cprLon: m.cprLon } };
    const other = m.cprOdd ? entry.even : entry.odd;
    if (m.cprOdd) entry.odd = mine;
    else entry.even = mine;
    last.set(key, entry);
    if (surface) {
      if (!ref) return null;
      const pair = other
        ? m.cprOdd
          ? surfaceGlobalPosition(other.p, mine.p, true, ref.lat, ref.lon)
          : surfaceGlobalPosition(mine.p, other.p, false, ref.lat, ref.lon)
        : null;
      if (pair && other) return { ...pair, pairedWith: other.i };
      return { ...surfaceLocalPosition(mine.p, m.cprOdd, ref.lat, ref.lon), pairedWith: null };
    }
    if (!other) return null;
    const pos = m.cprOdd
      ? globalPosition(other.p, mine.p, true)
      : globalPosition(mine.p, other.p, false);
    return pos ? { ...pos, pairedWith: other.i } : null;
  });
}

/**
 * Locally unambiguous surface position: one frame plus a reference position within about 45 nm (half the width of a
 * surface latitude zone, which is about 90 nm) of the aircraft. Surface CPR zones are a quarter of the airborne size (chapter 4 of the Riddle).
 */
export function surfaceLocalPosition(
  part: CprPart,
  odd: boolean,
  refLat: number,
  refLon: number,
): { lat: number; lon: number } {
  const i = odd ? 1 : 0;
  const dLat = 90 / (60 - i);
  const latFrac = part.cprLat / 131072;
  const j = Math.floor(refLat / dLat) + Math.floor(mod(refLat, dLat) / dLat - latFrac + 0.5);
  const lat = dLat * (j + latFrac);
  const dLon = 90 / Math.max(cprNl(lat) - i, 1);
  const lonFrac = part.cprLon / 131072;
  const m = Math.floor(refLon / dLon) + Math.floor(mod(refLon, dLon) / dLon - lonFrac + 0.5);
  return { lat, lon: dLon * (m + lonFrac) };
}

/**
 * Globally unambiguous surface position from an even and an odd frame. Surface frames repeat every 90 degrees, so a
 * reference position (for example the airfield) is needed to pick the right quadrant and hemisphere.
 * Returns null when the frames fall in different latitude zones.
 */
export function surfaceGlobalPosition(
  even: CprPart,
  odd: CprPart,
  latestIsOdd: boolean,
  refLat: number,
  refLon: number,
): { lat: number; lon: number } | null {
  const lat0 = even.cprLat / 131072;
  const lat1 = odd.cprLat / 131072;
  const j = Math.floor(59 * lat0 - 60 * lat1 + 0.5);
  const latEven = (90 / 60) * (mod(j, 60) + lat0);
  const latOdd = (90 / 59) * (mod(j, 59) + lat1);
  if (cprNl(latEven) !== cprNl(latOdd)) return null;
  const north = latestIsOdd ? latOdd : latEven;
  const lat = Math.abs(north - refLat) <= Math.abs(north - 90 - refLat) ? north : north - 90;
  const nl = cprNl(lat);
  const m = Math.floor((even.cprLon / 131072) * (nl - 1) - (odd.cprLon / 131072) * nl + 0.5);
  const n = Math.max(nl - (latestIsOdd ? 1 : 0), 1);
  const lon1 = (90 / n) * (mod(m, n) + (latestIsOdd ? odd.cprLon : even.cprLon) / 131072);
  let best = lon1;
  for (const k of [0, 90, 180, 270]) {
    const cand = lon1 + k;
    const wrapped = cand >= 180 ? cand - 360 : cand;
    const dist = (x: number) => Math.abs(mod(x - refLon + 180, 360) - 180);
    if (dist(wrapped) < dist(best)) best = wrapped;
  }
  return { lat, lon: best >= 180 ? best - 360 : best };
}
