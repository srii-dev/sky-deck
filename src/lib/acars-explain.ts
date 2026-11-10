/*
 * Plain-English help for an ACARS message (Phase 6c and 6d), by fixed rules only: no AI, and nothing is guessed.
 * The only explanation is a short glossary of standard aviation abbreviations (ICAO and common airline use) that
 * appear in the message as whole words. Message label codes are NOT explained: SkyDeck has no verified list of what
 * each label means, and a wrong explanation is worse than none. The original text is always shown as received.
 * Pure functions; message text is untrusted and is only ever compared, never rendered as markup.
 */
import { MAX_TEXT_CHARS, type AcarsMessage } from "./acars-messages";

export const EXPLAINED_BY =
  "Explained by SkyDeck rules, not by AI. Abbreviations only; it can miss or misread.";

/** Standard abbreviations. Only entries with one clear meaning in aviation text belong here. */
export const GLOSSARY: Readonly<Record<string, string>> = {
  ACARS: "Aircraft Communications Addressing and Reporting System",
  ADS: "Automatic Dependent Surveillance",
  APU: "auxiliary power unit",
  ATC: "air traffic control",
  ATIS: "automatic terminal information service",
  CAVOK: "ceiling and visibility OK",
  CPDLC: "controller-pilot data link communications",
  ETA: "estimated time of arrival",
  ETD: "estimated time of departure",
  FMC: "flight management computer",
  FMS: "flight management system",
  FOB: "fuel on board",
  GPS: "global positioning system",
  IFR: "instrument flight rules",
  ILS: "instrument landing system",
  LDW: "landing weight",
  MEL: "minimum equipment list",
  METAR: "routine aviation weather report",
  NOTAM: "notice to air missions",
  PAX: "passengers",
  PIREP: "pilot weather report",
  RWY: "runway",
  SID: "standard instrument departure",
  SIGMET: "significant weather advisory",
  STAR: "standard terminal arrival route",
  TAF: "terminal aerodrome forecast",
  TOW: "takeoff weight",
  TWY: "taxiway",
  VFR: "visual flight rules",
  ZFW: "zero fuel weight",
};

export interface Abbreviation {
  abbr: string;
  meaning: string;
}

/** Abbreviations that appear in the text as whole upper-case words, each once, in order of first appearance. */
export function findAbbreviations(text: string): Abbreviation[] {
  const seen = new Set<string>();
  const out: Abbreviation[] = [];
  for (const word of text.split(/[^A-Za-z0-9]+/)) {
    if (!word || seen.has(word)) continue;
    // Whole words only, and only as written in capitals: "eta" or "Staring" must not match.
    const meaning = Object.prototype.hasOwnProperty.call(GLOSSARY, word)
      ? GLOSSARY[word]
      : undefined;
    if (meaning) {
      seen.add(word);
      out.push({ abbr: word, meaning });
    }
  }
  return out;
}

export interface MessageField {
  label: string;
  /** Null when the data did not carry it: shown as "unavailable". */
  value: string | null;
}

export interface MessageSummary {
  fields: MessageField[];
  abbreviations: Abbreviation[];
  /** Plain notes about what could not be shown or explained. */
  notes: string[];
  /** True when the message is empty or was cut short. */
  partial: boolean;
}

const orNull = (v: string | null | undefined): string | null => (v && v.trim() ? v : null);

export function summarizeMessage(m: AcarsMessage): MessageSummary {
  const route = m.departing && m.destination ? m.departing + " to " + m.destination : null;
  const fields: MessageField[] = [
    {
      label: "Received",
      value:
        m.time != null
          ? new Date(m.time).toISOString().replace("T", " ").slice(0, 16) + " UTC"
          : null,
    },
    { label: "Aircraft", value: orNull(m.tail) },
    { label: "Flight", value: orNull(m.flight) },
    { label: "Label", value: orNull(m.label) },
    { label: "From address", value: orNull(m.fromHex) },
    { label: "To address", value: orNull(m.toHex) },
    { label: "Frequency", value: m.frequency != null ? m.frequency + " MHz" : null },
    { label: "Link", value: orNull(m.sourceType) },
    { label: "Route", value: route },
  ];
  const notes: string[] = [];
  const cut = m.text.endsWith("...") && m.text.length >= MAX_TEXT_CHARS;
  const empty = m.text.trim() === "";
  if (empty) notes.push("This message has no text.");
  if (cut) notes.push("The text was cut at " + MAX_TEXT_CHARS + " characters.");
  const abbreviations = findAbbreviations(m.text);
  if (!empty && abbreviations.length === 0) {
    notes.push(
      "No explanation available: nothing in this text matches the abbreviations SkyDeck knows.",
    );
  }
  if (m.label)
    notes.push("Label codes are not explained: SkyDeck has no verified list of their meanings.");
  return { fields, abbreviations, notes, partial: empty || cut };
}
