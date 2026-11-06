import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_CHARS,
  normalizeAirframesMessage,
  normalizeAirframesMessages,
  sanitizeText,
} from "@/lib/acars-messages";

/*
 * All messages here are INVENTED. They use the field names of the Airframes API but no real
 * aircraft, tail numbers or message text. Do not paste real captured messages into this repo.
 * Unsafe characters are built from numeric code points so the source file holds no invisible characters.
 */
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const NUL = cp(0x00);
const BEL = cp(0x07);
const DEL = cp(0x7f);
const ZERO_WIDTH_SPACE = cp(0x200b);
const RTL_OVERRIDE = cp(0x202e);
const ISOLATE = cp(0x2066);

const sample = {
  id: 1001,
  timestamp: "2026-01-02T03:04:05.000Z",
  tail: "N000XX",
  flightNumber: "TST123",
  label: "H1",
  fromHex: "AAAAAA",
  toHex: "BBBBBB",
  frequency: 131.55,
  sourceType: "acars",
  departingAirport: "KAAA",
  destinationAirport: "KBBB",
  text: "TEST MESSAGE ONE",
  station: { id: 5 },
  flight: { id: 9 },
};

describe("sanitizeText", () => {
  it("returns an empty string for non-strings", () => {
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(42)).toBe("");
    expect(sanitizeText(null)).toBe("");
  });

  it("strips control, zero-width and bidi-override characters but keeps newlines and tabs", () => {
    const dirty = `A${NUL}B${BEL}C${ZERO_WIDTH_SPACE}D${RTL_OVERRIDE}E${ISOLATE}F${DEL}G\tH\nI`;
    expect(sanitizeText(dirty)).toBe("ABCDEFG\tH\nI");
  });

  it("normalises line breaks and collapses long runs of blank lines", () => {
    expect(sanitizeText("a\r\nb\rc\n\n\n\n\nd  \ne")).toBe("a\nb\nc\n\nd\ne");
  });

  it("caps the length", () => {
    const out = sanitizeText("x".repeat(MAX_TEXT_CHARS + 50));
    expect(out).toHaveLength(MAX_TEXT_CHARS + 3);
    expect(out.endsWith("...")).toBe(true);
  });

  it("leaves markup as plain characters (it must only ever be rendered as text)", () => {
    expect(sanitizeText("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("normalizeAirframesMessage", () => {
  it("maps the documented fields", () => {
    expect(normalizeAirframesMessage(sample)).toEqual({
      id: 1001,
      time: Date.parse("2026-01-02T03:04:05.000Z"),
      tail: "N000XX",
      flight: "TST123",
      label: "H1",
      fromHex: "AAAAAA",
      toHex: "BBBBBB",
      frequency: 131.55,
      sourceType: "acars",
      departing: "KAAA",
      destination: "KBBB",
      text: "TEST MESSAGE ONE",
    });
  });

  it("tolerates missing and wrongly typed fields", () => {
    const m = normalizeAirframesMessage({ id: 7, tail: 5, text: { a: 1 }, frequency: "131" });
    expect(m).toMatchObject({
      id: 7,
      tail: null,
      text: "",
      frequency: null,
      time: null,
      label: null,
    });
  });

  it("reads numeric timestamps in seconds or milliseconds, and falls back to createdAt", () => {
    expect(normalizeAirframesMessage({ id: 1, timestamp: 1_767_323_045 })?.time).toBe(
      1_767_323_045_000,
    );
    expect(normalizeAirframesMessage({ id: 1, timestamp: 1_767_323_045_000 })?.time).toBe(
      1_767_323_045_000,
    );
    expect(
      normalizeAirframesMessage({ id: 1, timestamp: "garbage", createdAt: "2026-01-02T00:00:00Z" })
        ?.time,
    ).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  it("rejects items without a numeric id, and non-objects", () => {
    expect(normalizeAirframesMessage({ text: "no id" })).toBeNull();
    expect(normalizeAirframesMessage({ id: "12" })).toBeNull();
    expect(normalizeAirframesMessage("x")).toBeNull();
    expect(normalizeAirframesMessage(null)).toBeNull();
  });

  it("cleans text fields", () => {
    const m = normalizeAirframesMessage({
      ...sample,
      tail: `N0${ZERO_WIDTH_SPACE}00XX`,
      text: `A${NUL}B`,
    });
    expect(m?.tail).toBe("N000XX");
    expect(m?.text).toBe("AB");
  });
});

describe("normalizeAirframesMessages", () => {
  it("returns an empty list for a non-array body", () => {
    expect(normalizeAirframesMessages({ error: "nope" })).toEqual([]);
    expect(normalizeAirframesMessages(null)).toEqual([]);
  });

  it("skips bad items and sorts newest first", () => {
    const list = normalizeAirframesMessages([
      { ...sample, id: 1, timestamp: "2026-01-02T00:00:00Z" },
      { text: "bad" },
      { ...sample, id: 3, timestamp: "2026-01-02T02:00:00Z" },
      { ...sample, id: 2, timestamp: "2026-01-02T01:00:00Z" },
    ]);
    expect(list.map((m) => m.id)).toEqual([3, 2, 1]);
  });
});
