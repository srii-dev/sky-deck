/*
 * Trail export (Phase 22l): turn the positions this browser collected for one aircraft into a CSV
 * or GPX file. Pure functions; the download itself is in download.ts. The files carry a credit line
 * because the positions come from community ADS-B networks (see the Credits dialog).
 */
import type { TrailPoint } from "@/components/skydeck/map-config";

export interface TrailExportMeta {
  callsign: string | null;
  registration: string | null;
  hex: string;
  /** The provider that supplied the positions, when known. */
  source?: string | null | undefined;
  exportedAt: Date;
}

const NL = String.fromCharCode(10);
const FT_TO_M = 0.3048;

export const TRAIL_CREDIT =
  "Positions: community ADS-B data from adsb.lol and airplanes.live, collected by this browser while it was open. For education and hobby use only; not for navigation.";

export const CSV_COLUMNS = [
  "time_utc",
  "latitude",
  "longitude",
  "altitude_ft",
  "ground_speed_kt",
  "vertical_rate_fpm",
  "on_ground",
] as const;

/** Printable text only: control characters become spaces and runs of spaces collapse. */
export function cleanText(text: string, max = 80): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 32;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.split(" ").filter(Boolean).join(" ").slice(0, max);
}

/** Escape the five characters that matter inside XML text and attribute values. */
export function xmlEscape(text: string): string {
  return text
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&apos;");
}

/** A name for the aircraft: callsign, else registration, else the hex code. */
export function aircraftLabel(meta: TrailExportMeta): string {
  return cleanText(meta.callsign ?? meta.registration ?? meta.hex.toUpperCase(), 24);
}

/** Letters, digits, dash and underscore only, so the name is safe on every file system. */
export function safeFilePart(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const ok =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      ch === "-" ||
      ch === "_";
    out += ok ? ch : "-";
  }
  return out.split("-").filter(Boolean).join("-") || "aircraft";
}

function stamp(d: Date): string {
  return d.toISOString().slice(0, 16).split("-").join("").split(":").join("").replace("T", "-");
}

/** For example "skydeck-trail-DAL123-20261108-1405.csv". */
export function trailFilename(meta: TrailExportMeta, ext: "csv" | "gpx" | "kml"): string {
  return `skydeck-trail-${safeFilePart(aircraftLabel(meta))}-${stamp(meta.exportedAt)}.${ext}`;
}

/** Points worth exporting: finite coordinates, in time order. */
export function exportablePoints(trail: readonly TrailPoint[]): TrailPoint[] {
  return trail
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

const cell = (v: number | null | undefined, digits: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "";

export function trailToCsv(trail: readonly TrailPoint[], meta: TrailExportMeta): string {
  const lines = [
    `# SkyDeck trail for ${aircraftLabel(meta)} (ICAO hex ${cleanText(meta.hex, 12).toUpperCase()})`,
    `# ${TRAIL_CREDIT}`,
    `# Exported ${meta.exportedAt.toISOString()}${meta.source ? `; last provider: ${cleanText(meta.source, 30)}` : ""}`,
    CSV_COLUMNS.join(","),
  ];
  for (const p of exportablePoints(trail)) {
    lines.push(
      [
        new Date(p.t).toISOString(),
        p.lat.toFixed(5),
        p.lon.toFixed(5),
        cell(p.altFt, 0),
        cell(p.gs, 0),
        cell(p.vRate, 0),
        p.onGround ? "true" : "false",
      ].join(","),
    );
  }
  return lines.join(NL) + NL;
}

export function trailToGpx(trail: readonly TrailPoint[], meta: TrailExportMeta): string {
  const name = xmlEscape(`SkyDeck trail ${aircraftLabel(meta)}`);
  const desc = xmlEscape(
    `${TRAIL_CREDIT} Altitudes are barometric altitude in metres, not height above ground.`,
  );
  const points = exportablePoints(trail).map((p) => {
    const ele =
      typeof p.altFt === "number" && Number.isFinite(p.altFt)
        ? `<ele>${(p.altFt * FT_TO_M).toFixed(1)}</ele>`
        : "";
    return `      <trkpt lat="${p.lat.toFixed(5)}" lon="${p.lon.toFixed(5)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`;
  });
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="SkyDeck" xmlns="http://www.topografix.com/GPX/1/1">',
      "  <metadata>",
      `    <name>${name}</name>`,
      `    <desc>${desc}</desc>`,
      `    <time>${meta.exportedAt.toISOString()}</time>`,
      "  </metadata>",
      "  <trk>",
      `    <name>${name}</name>`,
      "    <trkseg>",
      ...points,
      "    </trkseg>",
      "  </trk>",
      "</gpx>",
    ].join(NL) + NL
  );
}

/** KML for Google Earth and similar: one line through every position, with altitude in metres above sea level. */
export function trailToKml(trail: readonly TrailPoint[], meta: TrailExportMeta): string {
  const name = xmlEscape(`SkyDeck trail ${aircraftLabel(meta)}`);
  const desc = xmlEscape(
    `${TRAIL_CREDIT} Altitudes are barometric altitude in metres, not height above ground.`,
  );
  const coords = exportablePoints(trail)
    .map((p) => {
      const alt = typeof p.altFt === "number" && Number.isFinite(p.altFt) ? p.altFt * FT_TO_M : 0;
      return `          ${p.lon.toFixed(5)},${p.lat.toFixed(5)},${alt.toFixed(1)}`;
    })
    .join(NL);
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      "  <Document>",
      `    <name>${name}</name>`,
      `    <description>${desc}</description>`,
      "    <Placemark>",
      `      <name>${name}</name>`,
      "      <LineString>",
      "        <altitudeMode>absolute</altitudeMode>",
      "        <coordinates>",
      coords,
      "        </coordinates>",
      "      </LineString>",
      "    </Placemark>",
      "  </Document>",
      "</kml>",
    ].join(NL) + NL
  );
}
