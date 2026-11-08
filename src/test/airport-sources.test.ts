import { afterEach, describe, expect, it } from "vitest";
import {
  isValidIcao,
  loadAirportBrief,
  NAS_TTL_MS,
  resetAirportSourceState,
  WEATHER_TTL_MS,
} from "@/lib/airport-sources";

afterEach(() => resetAirportSourceState());

const INFO = [{ icaoId: "KJFK", iataId: "JFK", name: "JFK", elev: 4, runways: [] }];
const METAR = [
  { icaoId: "KJFK", rawOb: "METAR KJFK 081651Z 28014KT", wdir: 280, wspd: 14, fltCat: "VFR" },
];
const TAF = [{ icaoId: "KJFK", rawTAF: "TAF KJFK 081733Z" }];
const NAS =
  "<A><Delay_type><Ground_Delay_List><Ground_Delay><ARPT>JFK</ARPT><Reason>wx</Reason><Avg>20 minutes</Avg></Ground_Delay></Ground_Delay_List></Delay_type></A>";

function makeFetch(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [key, make] of Object.entries(overrides)) if (url.includes(key)) return make();
    if (url.includes("/airport?")) return new Response(JSON.stringify(INFO));
    if (url.includes("/metar?")) return new Response(JSON.stringify(METAR));
    if (url.includes("/taf?")) return new Response(JSON.stringify(TAF));
    return new Response(NAS);
  }) as typeof fetch;
  return { impl, calls };
}

describe("loadAirportBrief", () => {
  it("loads all parts", async () => {
    const { impl } = makeFetch();
    const b = await loadAirportBrief("kjfk", "jfk", { fetchImpl: impl });
    expect(b.icao).toBe("KJFK");
    expect(b.info?.elevM).toBe(4);
    expect(b.metar?.flightCategory).toBe("VFR");
    expect(b.taf?.raw).toContain("TAF");
    expect(b.nas?.[0]?.kind).toBe("ground-delay");
    expect(b.failed).toEqual([]);
  });

  it("reports a failed part without losing the others", async () => {
    const { impl } = makeFetch({ nasstatus: () => new Response("no", { status: 503 }) });
    const b = await loadAirportBrief("KJFK", "JFK", { fetchImpl: impl });
    expect(b.nas).toBeNull();
    expect(b.failed).toEqual(["nas"]);
    expect(b.metar).not.toBeNull();
  });

  it("treats an empty body as no data, not a failure", async () => {
    const { impl } = makeFetch({ "/metar?": () => new Response("") });
    const b = await loadAirportBrief("KJFK", "JFK", { fetchImpl: impl });
    expect(b.metar).toBeNull();
    expect(b.failed).toEqual([]);
  });

  it("skips the FAA feed without an IATA code", async () => {
    const { impl, calls } = makeFetch();
    const b = await loadAirportBrief("KJFK", null, { fetchImpl: impl });
    expect(b.nas).toBeNull();
    expect(b.failed).toEqual([]);
    expect(calls.some((u) => u.includes("nasstatus"))).toBe(false);
  });

  it("caches within the time to live and refetches after", async () => {
    const { impl, calls } = makeFetch();
    let t = 1_000_000;
    const deps = { fetchImpl: impl, now: () => t };
    await loadAirportBrief("KJFK", "JFK", deps);
    const first = calls.length;
    await loadAirportBrief("KJFK", "JFK", deps);
    expect(calls.length).toBe(first);
    t += Math.max(WEATHER_TTL_MS, NAS_TTL_MS) + 1;
    await loadAirportBrief("KJFK", "JFK", deps);
    // Weather (2 requests) and FAA status (1) are fetched again; airport info stays cached.
    expect(calls.length).toBe(first + 3);
  });

  it("retries once after a server error, but not after a 404", async () => {
    let n = 0;
    const flaky = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/metar?")) {
        n += 1;
        return n === 1 ? new Response("x", { status: 503 }) : new Response(JSON.stringify(METAR));
      }
      if (url.includes("/taf?")) return new Response(JSON.stringify(TAF));
      if (url.includes("/airport?")) return new Response("nope", { status: 404 });
      return new Response(NAS);
    }) as typeof fetch;
    const b = await loadAirportBrief("KJFK", "JFK", { fetchImpl: flaky });
    expect(b.metar).not.toBeNull();
    expect(n).toBe(2);
    expect(b.failed).toEqual(["info"]);
  });

  it("validates codes", () => {
    expect(isValidIcao("KJFK")).toBe(true);
    expect(isValidIcao("JFK")).toBe(true);
    expect(isValidIcao("K J")).toBe(false);
    expect(isValidIcao("TOOLONG")).toBe(false);
  });
});
