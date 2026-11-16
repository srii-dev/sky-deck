import { describe, expect, it } from "vitest";
import {
  crc24,
  decodeFrame,
  resolvePositions,
  surfaceGlobalPosition,
  surfaceLocalPosition,
  surfaceSpeedKt,
  type AdsbMessage,
  type DecodedFrame,
} from "@/lib/modes-decode";

/*
 * "published" tests use frames and values printed in chapter 4 of "The 1090 Megahertz Riddle" (J. Sun):
 * https://mode-s.org/1090mhz/content/ads-b/4-surface-position.html (read 2026-11-16). Only the hex frames and
 * the numbers are used, not the text. "table" tests check the chapter's movement table. "synthetic" tests build
 * a frame here with the decoder's own CRC: they prove field positions only, not agreement with the standard.
 */
const SURF_EVEN = "8C4841753AAB238733C8CD4020B1"; // published
const SURF_ODD = "8C4841753A8A35323FAEBDAC702D"; // published, most recent of the pair
const SURF_NEXT = "8C4841753A9A153237AEF0F275BE"; // published, used for the local decode
const REF = { lat: 51.99, lon: 4.375 }; // the airfield reference in the book's example

const bytesOf = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (n: number) => n.toString(16).toUpperCase().padStart(6, "0");
const withParity = (dataHex: string) => dataHex + toHex(crc24(bytesOf(dataHex)));

function frame(hex: string): DecodedFrame {
  const r = decodeFrame(hex);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
function msg<K extends AdsbMessage["kind"]>(hex: string, kind: K) {
  const m = frame(hex).message;
  if (!m || m.kind !== kind) throw new Error(`expected ${kind}`);
  return m as Extract<AdsbMessage, { kind: K }>;
}
/** Synthetic DF17 frame from a 56-bit ME field written as a binary string. */
function df17(meBits: string, icao = "ABCDEF"): string {
  if (!/^[01]{56}$/.test(meBits)) throw new Error("ME must be 56 bits");
  let me = "";
  for (let i = 0; i < 56; i += 8)
    me += parseInt(meBits.slice(i, i + 8), 2)
      .toString(16)
      .padStart(2, "0");
  return withParity(`8D${icao}${me}`.toUpperCase());
}

describe("surface position fields (published frames)", () => {
  it("reads the even frame: movement, track bit, CPR format and raw CPR values", () => {
    const m = msg(SURF_EVEN, "surface-position");
    expect(m.typeCode).toBe(7);
    expect(m.movementRaw).toBe(42); // book: 0101010
    expect(m.speedKt).toBe(18); // 15 + (42 - 39) from the book's table
    expect(m.trackDeg).toBeCloseTo((360 * 50) / 128, 9); // book: 0110010 = 50
    expect(m.cprOdd).toBe(false);
    expect([m.cprLat, m.cprLon]).toEqual([115609, 116941]);
  });

  it("reads the odd frame", () => {
    const m = msg(SURF_ODD, "surface-position");
    expect(m.movementRaw).toBe(40); // book: 0101000
    expect(m.cprOdd).toBe(true);
    expect([m.cprLat, m.cprLon]).toEqual([39199, 110269]);
  });

  it("gives the book's speed and track for the third frame (17 kt, 92.8125 degrees)", () => {
    const m = msg(SURF_NEXT, "surface-position");
    expect(m.speedKt).toBe(17);
    expect(m.trackDeg).toBe(92.8125);
    expect([m.cprLat, m.cprLon]).toEqual([39195, 110320]);
  });

  it("decodes the book's even and odd pair with the reference position (52.320607, 4.734735)", () => {
    const e = msg(SURF_EVEN, "surface-position");
    const o = msg(SURF_ODD, "surface-position");
    const pos = surfaceGlobalPosition(e, o, true, REF.lat, REF.lon)!;
    expect(pos.lat).toBeCloseTo(52.320607, 6);
    expect(pos.lon).toBeCloseTo(4.734735, 6);
  });

  it("decodes the third frame locally from the pair's position (52.320561, 4.735735)", () => {
    const m = msg(SURF_NEXT, "surface-position");
    const pos = surfaceLocalPosition(m, true, 52.320607, 4.734735);
    expect(pos.lat).toBeCloseTo(52.320561, 6);
    expect(pos.lon).toBeCloseTo(4.735735, 6);
  });
});

describe("resolvePositions with surface frames", () => {
  const frames = [SURF_EVEN, SURF_ODD, SURF_NEXT].map(frame);

  it("shows no surface position without a reference", () => {
    expect(resolvePositions(frames)).toEqual([null, null, null]);
  });

  it("decodes the first frame locally, then the pair globally, with a reference", () => {
    const out = resolvePositions(frames, REF);
    expect(out[0]?.pairedWith).toBeNull();
    expect(out[1]?.pairedWith).toBe(0);
    expect(out[1]?.lat).toBeCloseTo(52.320607, 6);
    expect(out[1]?.lon).toBeCloseTo(4.734735, 6);
    expect(out[2]).not.toBeNull();
  });
});

describe("surface movement table", () => {
  it("matches the book's table at every boundary (table)", () => {
    const want: [number, number | null][] = [
      [0, null],
      [1, 0],
      [2, 0.125],
      [8, 0.875],
      [9, 1],
      [12, 1.75],
      [13, 2],
      [38, 14.5],
      [39, 15],
      [93, 69],
      [94, 70],
      [108, 98],
      [109, 100],
      [123, 170],
      [124, 175],
      [125, null],
      [127, null],
    ];
    for (const [n, kt] of want) expect(surfaceSpeedKt(n), `movement ${n}`).toBe(kt);
  });

  it("labels the special values (synthetic frame)", () => {
    const bits = (mov: number, s: number) =>
      `00111${mov.toString(2).padStart(7, "0")}${s}0000000${"0".repeat(2)}${"0".repeat(34)}`;
    const m0 = msg(df17(bits(0, 0)), "surface-position");
    expect(m0.speedKt).toBeNull();
    expect(m0.speedNote).toMatch(/not available/i);
    expect(m0.trackDeg).toBeNull(); // track status bit 0
    expect(msg(df17(bits(1, 1)), "surface-position").speedNote).toMatch(/stopped/i);
    expect(msg(df17(bits(124, 1)), "surface-position").speedNote).toMatch(/175/);
    expect(msg(df17(bits(126, 1)), "surface-position").speedNote).toMatch(/reserved/i);
  });
});

describe("operational status, type code 31 (synthetic frames)", () => {
  // ME layout from chapter 6 of the book: TC(5) ST(3) CC(16) OM(16) Ver(3) NICa(1) NACp(4) GVA/BAQ(2) SIL(2) ...
  const op = (st: number, ver: number, nica: number, nacp: number, sil: number) =>
    `11111${st.toString(2).padStart(3, "0")}${"0".repeat(32)}${ver.toString(2).padStart(3, "0")}${nica}${nacp
      .toString(2)
      .padStart(4, "0")}00${sil.toString(2).padStart(2, "0")}${"0".repeat(4)}`;

  it("reads version, NIC supplement, NACp and SIL for airborne and surface subtypes", () => {
    const a = msg(df17(op(0, 2, 1, 9, 3)), "operational-status");
    expect(a).toMatchObject({ subtype: 0, version: 2, nicSupplementA: 1, nacpRaw: 9, silRaw: 3 });
    const s = msg(df17(op(1, 1, 0, 8, 2)), "operational-status");
    expect(s).toMatchObject({ subtype: 1, version: 1, nicSupplementA: 0, nacpRaw: 8, silRaw: 2 });
  });

  it("gives no version number for reserved values, and leaves other subtypes undecoded", () => {
    expect(msg(df17(op(0, 5, 0, 0, 0)), "operational-status").version).toBeNull();
    expect(msg(df17(op(2, 0, 0, 0, 0)), "other").typeCode).toBe(31);
  });

  it("matches the 56-bit length of the field layout", () => {
    expect(op(0, 0, 0, 0, 0)).toHaveLength(56);
  });
});

describe("types that stay undecoded", () => {
  it("still labels aircraft status, target state and GNSS height as not decoded", () => {
    const tc = (n: number) => `${n.toString(2).padStart(5, "0")}${"0".repeat(51)}`;
    expect(msg(df17(tc(28)), "other").name).toMatch(/not decoded/);
    expect(msg(df17(tc(29)), "other").name).toMatch(/not decoded/);
    expect(msg(df17(tc(21)), "airborne-position").altitudeNote).toMatch(/GNSS height not decoded/);
  });
});
