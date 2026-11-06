import { describe, expect, it } from "vitest";
import {
  cprNl,
  crc24,
  decodeFrame,
  globalPosition,
  normaliseFrameHex,
  resolvePositions,
  type AdsbMessage,
  type DecodedFrame,
} from "@/lib/modes-decode";

/*
 * Published example frames (J. Sun, "The 1090 MHz Riddle", open book) are used for the
 * identification, position and velocity checks. Frames marked synthetic are built here
 * with the decoder's own CRC, so they prove field positions and error handling only.
 */
const KLM = "8D4840D6202CC371C32CE0576098";
const EVEN = "8D40621D58C382D690C8AC2863A7";
const ODD = "8D40621D58C386435CC412692AD6";
const VELOCITY = "8D485020994409940838175B284F";

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
const bytesOf = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (n: number) => n.toString(16).toUpperCase().padStart(6, "0");
/** Synthetic frame: data bytes (hex) followed by the correct 24-bit parity. */
const withParity = (dataHex: string) => dataHex + toHex(crc24(bytesOf(dataHex)));

describe("normaliseFrameHex", () => {
  it("accepts plain, raw (*...;) and AVR-with-timestamp forms and spaces", () => {
    const want = { ok: true, value: KLM };
    expect(normaliseFrameHex(KLM)).toEqual(want);
    expect(normaliseFrameHex(`*${KLM};`)).toEqual(want);
    expect(normaliseFrameHex(`@0123456789AB${KLM};`)).toEqual(want);
    expect(normaliseFrameHex(`  ${KLM.toLowerCase().replace(/(..)/g, "$1 ")}`)).toEqual(want);
  });

  it("rejects empty, non-hex and wrong-length input", () => {
    expect(normaliseFrameHex("")).toMatchObject({ ok: false });
    expect(normaliseFrameHex("8D4840D6ZZ2CC371C32CE0576098")).toMatchObject({ ok: false });
    expect(normaliseFrameHex("8D4840D6")).toMatchObject({
      ok: false,
      error: expect.stringContaining("14 or 28"),
    });
  });
});

describe("CRC and frame header", () => {
  it("accepts a valid DF17 frame and reads the address", () => {
    const f = frame(KLM);
    expect(f.df).toBe(17);
    expect(f.bits).toBe(112);
    expect(f.icao).toBe("4840D6");
    expect(f.crcOk).toBe(true);
    expect(f.crcRemainder).toBe(0);
    expect(f.warnings).toEqual([]);
  });

  it("detects a corrupted frame", () => {
    const bad = KLM.slice(0, 10) + (KLM[10] === "0" ? "1" : "0") + KLM.slice(11);
    const f = frame(bad);
    expect(f.crcOk).toBe(false);
    expect(f.warnings.join(" ")).toMatch(/CRC/);
  });

  it("checks a synthetic DF11 all-call reply", () => {
    const f = frame(withParity("5D4840D6"));
    expect(f.df).toBe(11);
    expect(f.bits).toBe(56);
    expect(f.icao).toBe("4840D6");
    expect(f.crcOk).toBe(true);
    expect(f.message).toBeNull();
  });

  it("recovers the address of a synthetic DF5 reply from its parity field", () => {
    const data = "281B2A3C";
    const ap = crc24(bytesOf(data)) ^ 0x4840d6;
    const f = frame(data + toHex(ap));
    expect(f.df).toBe(5);
    expect(f.icao).toBe("4840D6");
    expect(f.icaoFrom).toBe("parity");
    expect(f.crcOk).toBeNull();
  });

  it("warns when the length does not match the format", () => {
    const f = frame("8D4840D6202CC3");
    expect(f.df).toBe(17);
    expect(f.warnings.join(" ")).toMatch(/112 bits/);
    expect(f.message).toBeNull();
  });
});

describe("identification", () => {
  it("decodes the callsign and category", () => {
    const m = msg(KLM, "identification");
    expect(m.typeCode).toBe(4);
    expect(m.callsign).toBe("KLM1023");
    expect(m.category).toMatch(/^A0/);
  });
});

describe("airborne position", () => {
  it("decodes barometric altitude and the raw CPR fields", () => {
    const even = msg(EVEN, "airborne-position");
    expect(even.altitudeFt).toBe(38000);
    expect(even.cprOdd).toBe(false);
    expect(even.cprLat).toBe(93000);
    expect(even.cprLon).toBe(51372);

    const odd = msg(ODD, "airborne-position");
    expect(odd.altitudeFt).toBe(38000);
    expect(odd.cprOdd).toBe(true);
    expect(odd.cprLat).toBe(74158);
    expect(odd.cprLon).toBe(50194);
  });

  it("combines an even and an odd frame into a global position", () => {
    const e = msg(EVEN, "airborne-position");
    const o = msg(ODD, "airborne-position");
    const pos = globalPosition(e, o, false)!;
    expect(pos.lat).toBeCloseTo(52.2572, 3);
    expect(pos.lon).toBeCloseTo(3.91937, 3);
    // Using the odd frame as the latest gives a position a few hundred metres away.
    const pos2 = globalPosition(e, o, true)!;
    expect(Math.abs(pos2.lat - pos.lat)).toBeLessThan(0.02);
    expect(Math.abs(pos2.lon - pos.lon)).toBeLessThan(0.05);
  });

  it("returns null when the frames are in different latitude zones", () => {
    // Near the 10.47 degree zone boundary some even/odd pairs fall in different zones.
    // Search a range of odd latitudes: at least one must be refused, and the refusal must be null.
    const even = { cprLat: 97664, cprLon: 0 };
    let refused = 0;
    let accepted = 0;
    for (let odd = 0; odd < 131072; odd += 64) {
      const pos = globalPosition(even, { cprLat: odd, cprLon: 0 }, false);
      if (pos === null) refused++;
      else accepted++;
    }
    expect(refused).toBeGreaterThan(0);
    expect(accepted).toBeGreaterThan(0);
  });

  it("computes the number of longitude zones", () => {
    expect(cprNl(0)).toBe(59);
    expect(cprNl(87)).toBe(2);
    expect(cprNl(88)).toBe(1);
    expect(cprNl(52.2572)).toBe(36);
  });

  it("labels altitude it cannot decode (synthetic Gillham frame)", () => {
    // TC 11, altitude field 0x000 = not available.
    const m = msg(withParity("8D40621D58000000000000"), "airborne-position");
    expect(m.altitudeFt).toBeNull();
    expect(m.altitudeNote).toMatch(/not available/i);
  });
});

describe("airborne velocity", () => {
  it("decodes ground speed, track and vertical rate", () => {
    const m = msg(VELOCITY, "velocity");
    expect(m.subtype).toBe(1);
    expect(m.speedType).toBe("ground speed");
    expect(Math.round(m.speedKt!)).toBe(159);
    expect(m.directionType).toBe("track");
    expect(m.directionDeg!).toBeCloseTo(182.88, 1);
    expect(m.vRateFpm).toBe(-832);
    // The vertical-rate source bit (ME bit 35) is 0 in this frame, which the spec defines as a
    // geometric (GNSS) source. Checked by decoding the bits by hand, not from a published value.
    expect(m.vRateSource).toBe("GNSS");
  });

  it("decodes an airspeed / heading frame (synthetic, subtype 3)", () => {
    // TC 19, subtype 3, heading valid, heading 512/1024 = 180 deg, TAS = 251 - 1 = 250 kt,
    // vertical rate up from GNSS: sign 0, raw 33 -> 32 * 64 = 2048 fpm.
    const me = BigInt.asUintN(
      56,
      (19n << 51n) | // type code
        (3n << 48n) | // subtype
        (1n << 42n) | // heading status valid
        (512n << 32n) | // heading
        (1n << 31n) | // true airspeed
        (251n << 21n) | // airspeed
        (0n << 20n) | // vertical rate source: GNSS
        (0n << 19n) | // vertical rate sign: up
        (33n << 10n), // vertical rate
    );
    const data = "8D4840D6" + me.toString(16).toUpperCase().padStart(14, "0");
    const m = msg(withParity(data), "velocity");
    expect(m.subtype).toBe(3);
    expect(m.speedType).toBe("true airspeed");
    expect(m.speedKt).toBe(250);
    expect(m.directionType).toBe("heading");
    expect(m.directionDeg).toBe(180);
    expect(m.vRateFpm).toBe(2048);
    expect(m.vRateSource).toBe("GNSS");
  });
});

describe("other messages", () => {
  it("labels type codes it does not decode", () => {
    // TC 31 (operational status), synthetic.
    const m = msg(withParity("8D4840D6F8000000000000"), "other");
    expect(m.typeCode).toBe(31);
    expect(m.name).toMatch(/not decoded/);
  });
});

describe("resolvePositions", () => {
  const f = (hex: string) => frame(hex);

  it("pairs an even and an odd frame of the same aircraft in list order", () => {
    const [first, second] = resolvePositions([f(ODD), f(EVEN)]);
    expect(first).toBeNull();
    expect(second!.pairedWith).toBe(0);
    expect(second!.lat).toBeCloseTo(52.2572, 3);
    expect(second!.lon).toBeCloseTo(3.91937, 3);

    const [, other] = resolvePositions([f(EVEN), f(ODD)]);
    expect(Math.abs(other!.lat - 52.2572)).toBeLessThan(0.02);
  });

  it("does not pair frames of different aircraft, same parity, or with a bad CRC", () => {
    // Same frames but a different address: re-parity a synthetic odd frame for another aircraft.
    const otherOdd = ODD.slice(0, 2) + "AAAAAA" + ODD.slice(8, 22);
    const other = withParity(otherOdd);
    expect(resolvePositions([f(EVEN), f(other)])).toEqual([null, null]);
    expect(resolvePositions([f(EVEN), f(EVEN)])).toEqual([null, null]);
    const corrupt = ODD.slice(0, 20) + (ODD[20] === "0" ? "1" : "0") + ODD.slice(21);
    expect(resolvePositions([f(EVEN), f(corrupt)])).toEqual([null, null]);
  });

  it("ignores frames that are not airborne positions", () => {
    expect(resolvePositions([f(KLM), f(VELOCITY)])).toEqual([null, null]);
  });
});
