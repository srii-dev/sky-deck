import { describe, expect, it } from "vitest";

import { MAX_TEXT_CHARS, type AcarsMessage } from "@/lib/acars-messages";
import { findAbbreviations, GLOSSARY, summarizeMessage } from "@/lib/acars-explain";

// All text below is invented for the tests; no real message is used anywhere in the repository.
const msg = (over: Partial<AcarsMessage> = {}): AcarsMessage => ({
  id: 1,
  time: Date.UTC(2026, 10, 10, 14, 5),
  tail: "N000XX",
  flight: "TST123",
  label: "ZZ",
  fromHex: "000000",
  toHex: "FFFFFF",
  frequency: 131.55,
  sourceType: "acars",
  departing: "KAAA",
  destination: "KBBB",
  text: "TEST ETA 1234 RWY 99 PAX 000",
  ...over,
});

describe("findAbbreviations", () => {
  it("finds standard abbreviations as whole capital words, once each, in order", () => {
    const found = findAbbreviations("ETA 1234 RWY 09 ETA AGAIN PAX");
    expect(found.map((f) => f.abbr)).toEqual(["ETA", "RWY", "PAX"]);
    expect(found[0]!.meaning).toBe("estimated time of arrival");
  });

  it("does not match inside other words, in lower case, or by inherited object keys", () => {
    expect(findAbbreviations("eta Etat STARTING PAXES RWYS")).toEqual([]);
    expect(findAbbreviations("constructor toString __proto__ hasOwnProperty")).toEqual([]);
  });

  it("splits on punctuation and line breaks", () => {
    expect(findAbbreviations("RWY/TWY\nZFW:123,TOW-456").map((f) => f.abbr)).toEqual([
      "RWY",
      "TWY",
      "ZFW",
      "TOW",
    ]);
  });

  it("has a meaning for every glossary word and no empty ones", () => {
    for (const [k, v] of Object.entries(GLOSSARY)) {
      expect(k).toMatch(/^[A-Z]{2,6}$/);
      expect(v.length).toBeGreaterThan(5);
    }
  });
});

describe("summarizeMessage", () => {
  it("lists the fields, the abbreviations and says label codes are not explained", () => {
    const s = summarizeMessage(msg());
    expect(s.fields.find((f) => f.label === "Received")!.value).toBe("2026-11-10 14:05 UTC");
    expect(s.fields.find((f) => f.label === "Route")!.value).toBe("KAAA to KBBB");
    expect(s.fields.find((f) => f.label === "Frequency")!.value).toBe("131.55 MHz");
    expect(s.abbreviations.map((a) => a.abbr)).toEqual(["ETA", "RWY", "PAX"]);
    expect(s.notes.join(" ")).toMatch(/Label codes are not explained/);
    expect(s.partial).toBe(false);
  });

  it("marks missing data unavailable instead of inventing it", () => {
    const s = summarizeMessage(
      msg({
        time: null,
        tail: null,
        flight: "  ",
        label: null,
        frequency: null,
        departing: "KAAA",
        destination: null,
      }),
    );
    for (const name of ["Received", "Aircraft", "Flight", "Label", "Frequency", "Route"]) {
      expect(s.fields.find((f) => f.label === name)!.value).toBeNull();
    }
    expect(s.notes.join(" ")).not.toMatch(/Label codes/);
  });

  it("marks empty and cut messages as partial", () => {
    const empty = summarizeMessage(msg({ text: "" }));
    expect(empty.partial).toBe(true);
    expect(empty.notes.join(" ")).toMatch(/no text/);
    const cut = summarizeMessage(
      msg({ text: "ETA ".repeat(MAX_TEXT_CHARS / 4).slice(0, MAX_TEXT_CHARS) + "..." }),
    );
    expect(cut.partial).toBe(true);
    expect(cut.notes.join(" ")).toMatch(/cut at 1000/);
  });

  it("says plainly when nothing could be explained", () => {
    const s = summarizeMessage(msg({ text: "QQQ 123 WWW" }));
    expect(s.abbreviations).toEqual([]);
    expect(s.notes.join(" ")).toMatch(/No explanation available/);
    expect(s.partial).toBe(false);
  });
});
