import type { AtisReport, FlightCategory, Metar, NasEvent } from "./airport-data";
import { TRAFFIC_RADIUS_NM, type AirportTraffic } from "./airport-traffic";
import type { RunwayGuess } from "./runway-traffic";

/*
 * Short plain-text brief for an airport page (Phase 4j). Rule-based: fixed sentence templates filled from
 * the weather, FAA status, ATIS, traffic and runway guess already on the page. No AI and nothing new is
 * fetched. A part that is unknown is left out or said to be unavailable; nothing is guessed.
 */

export interface AirportSummaryInput {
  metar: Metar | null;
  weatherFailed: boolean;
  /** FAA events; null when there is no FAA status for this airport or it could not be loaded. */
  nas: NasEvent[] | null;
  nasFailed: boolean;
  /** Current ATIS reports; null or empty when there is none or it could not be loaded. */
  atis: readonly AtisReport[] | null;
  traffic: AirportTraffic;
  runway: RunwayGuess | null;
}

const CATEGORY_TEXT: Record<FlightCategory, string> = {
  VFR: "good (VFR: clear enough to fly by sight)",
  MVFR: "marginal (MVFR: reduced visibility or lower clouds)",
  IFR: "poor (IFR: low visibility or low clouds)",
  LIFR: "very poor (LIFR: very low visibility or clouds)",
};

/** Wind as a short phrase, or null when unknown. */
export function windPhrase(m: Metar): string | null {
  if (m.windKt == null) return null;
  if (m.windKt === 0) return "calm wind";
  const dir = m.windVariable
    ? "variable wind"
    : "wind from " + String(m.windDir ?? "").padStart(3, "0") + "°";
  const gust = m.gustKt && m.gustKt > m.windKt ? ", gusting " + m.gustKt + " kt" : "";
  return dir + " at " + m.windKt + " kt" + gust;
}

function weatherSentence(i: AirportSummaryInput): string {
  const m = i.metar;
  if (!m) {
    return i.weatherFailed
      ? "Weather is not available right now."
      : "There is no current weather report for this airport.";
  }
  const wind = windPhrase(m);
  if (!m.flightCategory) return wind ? "Weather: " + wind + "." : "Weather report received.";
  return (
    "Flying conditions are " +
    CATEGORY_TEXT[m.flightCategory] +
    (wind ? ", with " + wind : "") +
    "."
  );
}

function faaSentence(i: AirportSummaryInput): string | null {
  if (i.nas === null) return i.nasFailed ? "FAA status is not available right now." : null;
  if (i.nas.length === 0) return "The FAA reports no delays or closures.";
  const shown = i.nas.slice(0, 2).map((e) => e.summary + (e.reason ? " (" + e.reason + ")" : ""));
  const more = i.nas.length > 2 ? " and " + (i.nas.length - 2) + " more" : "";
  return "FAA: " + shown.join("; ") + more + ".";
}

function atisSentence(i: AirportSummaryInput): string | null {
  const first = i.atis?.[0];
  if (!first) return null;
  const letter = first.code ? "information " + first.code : "a current report";
  return (
    "ATIS " +
    letter +
    (first.time ? " was broadcast at " + first.time + "Z" : " is available") +
    "."
  );
}

function trafficSentence(i: AirportSummaryInput): string {
  const t = i.traffic;
  if (t.nearby === 0) {
    return "This map sees no aircraft within " + TRAFFIC_RADIUS_NM + " nm right now.";
  }
  const flow =
    t.arriving.length || t.departing.length
      ? ": " + t.arriving.length + " arriving and " + t.departing.length + " departing (inferred)"
      : "";
  return t.nearby + " aircraft within " + TRAFFIC_RADIUS_NM + " nm" + flow + ".";
}

function runwaySentence(i: AirportSummaryInput): string | null {
  const r = i.runway;
  if (!r || r.ends.length === 0) return null;
  return "Runway in use is probably " + r.ends.map((e) => e.label).join(" and ") + " (a guess).";
}

/** The brief as separate sentences, in the order weather, FAA, ATIS, runway, traffic. */
export function airportSummary(i: AirportSummaryInput): string[] {
  return [
    weatherSentence(i),
    faaSentence(i),
    atisSentence(i),
    runwaySentence(i),
    trafficSentence(i),
  ].filter((s): s is string => s !== null);
}
