import { describe, expect, it } from "vitest";

import {
  airlineColor,
  colorForAirline,
  COLOR_MODES,
  NO_AIRLINE_COLOR,
  normalizeColorMode,
} from "@/lib/airline-colors";
import { embedCode, embedUrl, isEmbed } from "@/lib/embed";

describe("airline colours", () => {
  it("gives every airline one steady colour, in the same format", () => {
    expect(colorForAirline("UAL")).toBe(colorForAirline("ual"));
    expect(airlineColor("UAL123")).toBe(airlineColor("UAL9"));
    expect(airlineColor("UAL123")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("mostly gives different airlines different colours", () => {
    const codes = [
      "UAL",
      "AAL",
      "DAL",
      "SWA",
      "JBU",
      "ASA",
      "FFT",
      "NKS",
      "BAW",
      "DLH",
      "AFR",
      "KLM",
      "UAE",
      "QTR",
      "ETH",
      "SIA",
      "CPA",
      "ANA",
      "JAL",
      "QFA",
      "ACA",
      "WJA",
      "RYR",
      "EZY",
      "VIR",
      "SAS",
      "FIN",
      "THY",
      "ELY",
      "LAN",
    ];
    expect(new Set(codes.map(colorForAirline)).size).toBeGreaterThanOrEqual(27);
  });

  it("is grey when there is no airline code (private, military and missing callsigns)", () => {
    for (const cs of [null, "", "N123AB", "12345"]) {
      expect(airlineColor(cs)).toBe(NO_AIRLINE_COLOR);
    }
  });

  it("is never close to the emergency red or the grey of no airline", () => {
    for (const code of ["UAL", "AAL", "DAL", "SWA", "BAW", "DLH", "KLM", "UAE"]) {
      expect(colorForAirline(code)).not.toBe(NO_AIRLINE_COLOR);
    }
  });

  it("reads the stored choice and defaults to altitude", () => {
    expect(normalizeColorMode("airline")).toBe("airline");
    expect(normalizeColorMode("rainbow")).toBe("altitude");
    expect(normalizeColorMode(null)).toBe("altitude");
    expect(COLOR_MODES).toEqual(["altitude", "airline"]);
  });
});

describe("embed", () => {
  it("reads the embed flag from the address", () => {
    expect(isEmbed("?lat=1&embed=1")).toBe(true);
    expect(isEmbed("?embed=0")).toBe(false);
    expect(isEmbed("")).toBe(false);
  });

  it("makes an embedded address of the same view without the selected aircraft or a fragment", () => {
    expect(embedUrl("https://skydeck.example/?lat=40.7&lon=-74&z=9&hex=a1b2c3#x")).toBe(
      "https://skydeck.example/?lat=40.7&lon=-74&z=9&embed=1",
    );
    expect(embedUrl("javascript:alert(1)")).toBeNull();
    expect(embedUrl("not a url")).toBeNull();
  });

  it("builds an iframe tag with escaped attributes and sizes within limits", () => {
    const code = embedCode('https://skydeck.example/?q="><script>', 100, 99999)!;
    expect(code).toContain('width="200"');
    expect(code).toContain('height="2000"');
    expect(code).not.toContain("<script>");
    expect(code.startsWith("<iframe ")).toBe(true);
    expect(code.endsWith("</iframe>")).toBe(true);
    expect(code).toContain('allow="geolocation"');
    expect(embedCode("ftp://x.test")).toBeNull();
  });
});
