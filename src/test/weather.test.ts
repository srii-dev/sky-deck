import { afterEach, describe, expect, it } from "vitest";
import {
  frameAgeLabel,
  isRainViewerHost,
  nextFrameIndex,
  parseRadarIndex,
  radarTileUrl,
  reselectFrame,
} from "@/lib/radar";
import {
  altitudeText,
  hazardColor,
  parseGairmets,
  parsePireps,
  parseSigmets,
} from "@/lib/weather-advisories";
import {
  loadAdvisories,
  loadPireps,
  normalizeBox,
  resetWeatherSourceState,
  ADVISORY_TTL_MS,
} from "@/lib/weather-sources";

afterEach(() => resetWeatherSourceState());

// Shapes copied from real answers received on 2026-11-08 (trimmed).
const RADAR = {
  version: "2.0",
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: [
      { time: 1794158400, path: "/v2/radar/c269dae764c1" },
      { time: 1794157800, path: "/v2/radar/7b142b9b4d27" },
    ],
    nowcast: [],
  },
};

describe("radar index", () => {
  it("parses frames oldest first and builds a tile url", () => {
    const idx = parseRadarIndex(RADAR);
    expect(idx?.frames.map((f) => f.time)).toEqual([1794157800000, 1794158400000]);
    const first = idx?.frames[0];
    expect(idx && first ? radarTileUrl(idx, first) : "").toBe(
      "https://tilecache.rainviewer.com/v2/radar/7b142b9b4d27/256/{z}/{x}/{y}/2/1_1.png",
    );
  });

  it("refuses hosts outside rainviewer.com and unsafe paths", () => {
    expect(isRainViewerHost("https://tilecache.rainviewer.com")).toBe(true);
    expect(isRainViewerHost("http://tilecache.rainviewer.com")).toBe(false);
    expect(isRainViewerHost("https://evilrainviewer.com")).toBe(false);
    expect(isRainViewerHost("not a url")).toBe(false);
    expect(parseRadarIndex({ ...RADAR, host: "https://example.com" })).toBeNull();
    const bad = { ...RADAR, radar: { past: [{ time: 1, path: "/v2/radar/../x" }] } };
    expect(parseRadarIndex(bad)).toBeNull();
  });

  it("returns null for empty or wrong shapes", () => {
    expect(parseRadarIndex(null)).toBeNull();
    expect(parseRadarIndex({ host: RADAR.host, radar: { past: [] } })).toBeNull();
    expect(parseRadarIndex({ host: RADAR.host })).toBeNull();
  });

  it("labels frame ages", () => {
    const now = 10_000_000;
    expect(frameAgeLabel(now, now)).toBe("now");
    expect(frameAgeLabel(now - 12 * 60_000, now)).toBe("12 min ago");
    expect(frameAgeLabel(now - 65 * 60_000, now)).toBe("1 h 5 min ago");
    expect(frameAgeLabel(now - 120 * 60_000, now)).toBe("2 h ago");
  });

  it("steps through frames and keeps the chosen one on refresh", () => {
    expect(nextFrameIndex(0, 3)).toBe(1);
    expect(nextFrameIndex(2, 3)).toBe(0);
    expect(nextFrameIndex(0, 0)).toBe(0);
    const old = [
      { time: 1, path: "a" },
      { time: 2, path: "b" },
    ];
    const fresh = [
      { time: 2, path: "b" },
      { time: 3, path: "c" },
    ];
    expect(reselectFrame(old, 1, fresh)).toBe(0);
    expect(reselectFrame(old, 0, fresh)).toBe(1);
  });
});

const NOW = 1794164000000;
const SIGMETS = [
  {
    icaoId: "KKCI",
    alphaChar: "A",
    seriesId: "XRAY 4",
    validTimeFrom: 1794162660,
    validTimeTo: 1794177060,
    hazard: "TURB",
    altitudeHi2: 15000,
    altitudeLow1: null,
    rawAirSigmet: "SIGMET XRAY 4 VALID UNTIL 082231",
    coords: [
      { lon: -111.178, lat: 48.905 },
      { lon: -111.284, lat: 46.413 },
      { lon: -113.278, lat: 46.212 },
      { lon: -115.384, lat: 48.987 },
      { lon: -111.178, lat: 48.905 },
    ],
  },
  { hazard: "ICE", validTimeTo: 1, coords: [] },
  {
    hazard: "TS",
    validTimeTo: 1794177060,
    coords: [
      { lon: 1, lat: 1 },
      { lon: 2, lat: 2 },
    ],
  },
];

describe("advisories", () => {
  it("parses a SIGMET and drops expired or too short ones", () => {
    const out = parseSigmets(SIGMETS, "sigmet", NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      hazard: "TURB",
      label: "Turbulence",
      topFt: 15000,
      severity: "moderate",
    });
    expect(out[0]?.ring).toHaveLength(5);
  });

  it("closes an open ring", () => {
    const open = [
      {
        hazard: "TS",
        validTimeTo: 1794177060,
        coords: [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 0 },
          { lon: 1, lat: 1 },
        ],
      },
    ];
    const ring = parseSigmets(open, "isigmet", NOW)[0]?.ring ?? [];
    expect(ring).toHaveLength(4);
    expect(ring[3]).toEqual(ring[0]);
  });

  it("keeps only the G-AIRMET slot closest to now and skips lines", () => {
    const ring = [
      { lat: "45", lon: "-120" },
      { lat: "45", lon: "-119" },
      { lat: "44", lon: "-119" },
    ];
    const g = [
      {
        validTime: new Date(NOW - 60_000).toISOString(),
        hazard: "IFR",
        geometryType: "AREA",
        coords: ring,
        tag: "1",
        due_to: "CIG BLW 010",
      },
      {
        validTime: new Date(NOW + 3 * 3600_000).toISOString(),
        hazard: "ICE",
        geometryType: "AREA",
        coords: ring,
        tag: "2",
      },
      {
        validTime: new Date(NOW - 60_000).toISOString(),
        hazard: "FZLVL",
        geometryType: "LINE",
        coords: ring,
        tag: "3",
      },
    ];
    const out = parseGairmets(g, NOW);
    expect(out.map((a) => a.hazard)).toEqual(["IFR"]);
    expect(out[0]?.text).toBe("CIG BLW 010");
  });

  it("colours hazards by group", () => {
    expect(hazardColor("TS")).toBe(hazardColor("CONVECTIVE"));
    expect(hazardColor("TURB-HI")).toBe(hazardColor("TURB"));
    expect(hazardColor("UNKNOWN")).toBe("#94a3b8");
  });

  it("formats altitudes", () => {
    expect(altitudeText(15000)).toBe("15,000 ft");
    expect(altitudeText(35000)).toBe("FL350");
    expect(altitudeText(null)).toBeNull();
  });
});

describe("pilot reports", () => {
  const rows = [
    {
      icaoId: "KMSC",
      obsTime: 100,
      lat: 43.3,
      lon: -72.5,
      fltLvl: 45,
      acType: "C25C",
      tbInt1: "",
      icgInt1: "",
      rawOb: "UA /OV VSF",
    },
    {
      icaoId: "KBOS",
      obsTime: 200,
      lat: 42.3,
      lon: -71,
      fltLvl: 240,
      acType: "B738",
      tbInt1: "MOD",
      icgInt1: "",
      rawOb: "UA /OV BOS TB MOD",
    },
    { icaoId: "KBAD", obsTime: 300, lat: null, lon: 1, rawOb: "x" },
  ];

  it("parses, ranks severity and sorts newest first", () => {
    const out = parsePireps(rows);
    expect(out.map((p) => p.aircraft)).toEqual(["B738", "C25C"]);
    expect(out[0]?.severity).toBe("moderate");
    expect(out[1]?.severity).toBe("info");
    expect(out[0]?.obsAt).toBe(200_000);
  });

  it("handles non-arrays", () => {
    expect(parsePireps({})).toEqual([]);
  });
});

describe("weather loader", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body));

  function makeFetch(fail: string[] = []) {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (fail.some((f) => url.includes(f))) return new Response("no", { status: 503 });
      if (url.includes("/airsigmet")) return ok(SIGMETS);
      if (url.includes("/isigmet")) return ok([]);
      if (url.includes("/gairmet")) return ok([]);
      if (url.includes("/pirep"))
        return ok([{ icaoId: "KBOS", obsTime: 200, lat: 42.3, lon: -71, rawOb: "UA" }]);
      return new Response("", { status: 404 });
    }) as typeof fetch;
    return { impl, calls };
  }

  it("loads, caches and refetches after the time to live", async () => {
    const { impl, calls } = makeFetch();
    let t = NOW;
    const deps = { fetchImpl: impl, now: () => t };
    const a = await loadAdvisories(deps);
    expect(a.advisories).toHaveLength(1);
    expect(a.failed).toEqual([]);
    await loadAdvisories(deps);
    expect(calls).toHaveLength(3);
    t += ADVISORY_TTL_MS + 1;
    await loadAdvisories(deps);
    expect(calls).toHaveLength(6);
  });

  it("reports a failed feed, keeps the others and does not cache a partial answer", async () => {
    const { impl, calls } = makeFetch(["/isigmet"]);
    const deps = { fetchImpl: impl, now: () => NOW };
    const a = await loadAdvisories(deps);
    expect(a.failed).toEqual(["isigmet"]);
    expect(a.advisories).toHaveLength(1);
    await loadAdvisories(deps);
    expect(calls.length).toBe(6);
  });

  it("rounds and limits the PIREP box and caches per box", async () => {
    const { impl, calls } = makeFetch();
    const deps = { fetchImpl: impl, now: () => NOW };
    const r = await loadPireps({ south: 40.2, west: -75.7, north: 44.1, east: -70.2 }, deps);
    expect(r?.box).toEqual({ south: 40, west: -76, north: 45, east: -70 });
    expect(r?.pireps).toHaveLength(1);
    expect(calls[0]).toContain("bbox=40,-76,45,-70");
    await loadPireps({ south: 40.5, west: -75.2, north: 44.9, east: -70.9 }, deps);
    expect(calls).toHaveLength(1);
  });

  it("clamps big boxes and rejects bad ones", () => {
    const big = normalizeBox({ south: -60, west: -170, north: 70, east: 170 });
    expect(big && big.north - big.south).toBe(30);
    expect(big && big.east - big.west).toBe(30);
    expect(normalizeBox({ south: 10, west: 0, north: 5, east: 5 })).toBeNull();
    expect(normalizeBox({ south: 0, west: 10, north: 5, east: -10 })).toBeNull();
    expect(normalizeBox({ south: NaN, west: 0, north: 5, east: 5 })).toBeNull();
  });
});
