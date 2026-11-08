import { describe, expect, it } from "vitest";

import { downloadText } from "@/lib/download";
import { buildLocalExport, localExportFilename } from "@/lib/data-export";
import {
  clearLocalData,
  LOCAL_DATA_KEYS,
  pollIntervalMs,
  POLL_NORMAL_MS,
  POLL_SAVER_MS,
  readFlagPref,
  STORAGE_KEYS,
  writeFlagPref,
  type StorageLike,
} from "@/lib/local-settings";
import {
  cleanText,
  exportablePoints,
  safeFilePart,
  trailFilename,
  trailToCsv,
  trailToGpx,
  TRAIL_CREDIT,
  xmlEscape,
  type TrailExportMeta,
} from "@/lib/trail-export";
import type { TrailPoint } from "@/components/skydeck/map-config";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const NOW = new Date("2026-11-08T14:05:30Z");
const meta: TrailExportMeta = {
  callsign: "DAL123",
  registration: "N123DL",
  hex: "a1b2c3",
  source: "adsb.lol",
  exportedAt: NOW,
};
const trail: TrailPoint[] = [
  {
    lat: 40.1,
    lon: -74.2,
    altFt: 10000,
    onGround: false,
    t: Date.parse("2026-11-08T14:00:10Z"),
    gs: 250,
    vRate: 1500,
  },
  {
    lat: 40.0,
    lon: -74.1,
    altFt: null,
    onGround: true,
    t: Date.parse("2026-11-08T14:00:00Z"),
    gs: null,
  },
];

describe("trail export", () => {
  it("sorts points by time and drops non-finite ones", () => {
    const pts = exportablePoints([...trail, { lat: NaN, lon: 1, altFt: 1, onGround: false, t: 5 }]);
    expect(pts.map((p) => p.lat)).toEqual([40.0, 40.1]);
  });

  it("writes a CSV with a credit line, a header and one row per point", () => {
    const csv = trailToCsv(trail, meta);
    const lines = csv.split(String.fromCharCode(10)).filter(Boolean);
    expect(lines[0]).toContain("DAL123");
    expect(csv).toContain(TRAIL_CREDIT);
    expect(lines[3]).toBe(
      "time_utc,latitude,longitude,altitude_ft,ground_speed_kt,vertical_rate_fpm,on_ground",
    );
    expect(lines).toHaveLength(6);
    expect(lines[4]).toBe("2026-11-08T14:00:00.000Z,40.00000,-74.10000,,,,true");
    expect(lines[5]).toBe("2026-11-08T14:00:10.000Z,40.10000,-74.20000,10000,250,1500,false");
  });

  it("writes GPX with altitude in metres, times, and the credit in the description", () => {
    const gpx = trailToGpx(trail, meta);
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<trkpt lat="40.10000" lon="-74.20000"><ele>3048.0</ele>');
    expect(gpx).toContain("<time>2026-11-08T14:00:10.000Z</time>");
    expect(gpx).toContain("community ADS-B data");
    // The point without an altitude has no <ele> element.
    expect(gpx).toContain('<trkpt lat="40.00000" lon="-74.10000"><time>');
  });

  it("escapes text that came from the feed", () => {
    expect(xmlEscape(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
    const gpx = trailToGpx(trail, { ...meta, callsign: "<X&Y>" });
    expect(gpx).not.toContain("<X&Y>");
    expect(gpx).toContain("&lt;X&amp;Y&gt;");
  });

  it("keeps control characters out of the header comment", () => {
    const evil = String.fromCharCode(10) + "=HYPERLINK(1)" + String.fromCharCode(13);
    expect(cleanText(evil)).toBe("=HYPERLINK(1)");
    const csv = trailToCsv(trail, { ...meta, callsign: "A" + evil });
    const firstLine = csv.split(String.fromCharCode(10))[0]!;
    expect(firstLine.startsWith("# SkyDeck trail for A =HYPERLINK(1)")).toBe(true);
  });

  it("builds a safe file name", () => {
    expect(trailFilename(meta, "csv")).toBe("skydeck-trail-DAL123-20261108-1405.csv");
    expect(safeFilePart("../a b/c")).toBe("a-b-c");
    expect(safeFilePart("///")).toBe("aircraft");
    expect(trailFilename({ ...meta, callsign: null, registration: null }, "gpx")).toBe(
      "skydeck-trail-A1B2C3-20261108-1405.gpx",
    );
  });
});

describe("downloadText", () => {
  it("clicks a temporary link to a Blob URL and frees the URL later", () => {
    const clicks: string[] = [];
    const revoked: string[] = [];
    const later: (() => void)[] = [];
    const link = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push(`${this.download}|${this.href}`);
      },
      remove() {},
    };
    const body = { appendChild: () => link };
    const ok = downloadText("f.csv", "text/csv", "a,b", {
      doc: { createElement: () => link, body } as never,
      urlApi: {
        createObjectURL: () => "blob:fake",
        revokeObjectURL: (u: string) => {
          revoked.push(u);
        },
      },
      later: (fn) => {
        later.push(fn);
      },
    });
    expect(ok).toBe(true);
    expect(clicks).toEqual(["f.csv|blob:fake"]);
    expect(revoked).toEqual([]);
    later.forEach((fn) => fn());
    expect(revoked).toEqual(["blob:fake"]);
  });
});

describe("local data export", () => {
  it("exports the settings, saved views and recent searches that are stored", () => {
    const s = fakeStorage({
      [STORAGE_KEYS.units]: "metric",
      [STORAGE_KEYS.basemap]: "satellite",
      [STORAGE_KEYS.layers]: JSON.stringify({ terrain: false, showTrail: true, trail3d: "x" }),
      [STORAGE_KEYS.view]: JSON.stringify({ lat: 1, lon: 2, zoom: 8, extra: "ignored" }),
      [STORAGE_KEYS.savedViews]: JSON.stringify([
        { name: "Home", lat: 40, lon: -74, zoom: 9 },
        { name: "", lat: 0, lon: 0, zoom: 1 },
      ]),
      [STORAGE_KEYS.recentSearches]: JSON.stringify(["DAL1", 5, "KJFK"]),
      [STORAGE_KEYS.batterySaver]: "1",
      [STORAGE_KEYS.shortcuts]: "0",
    });
    const out = buildLocalExport(s, NOW);
    expect(out.settings.units).toBe("metric");
    expect(out.settings.basemap).toBe("satellite");
    expect(out.settings.layers).toEqual({ terrain: false, showTrail: true });
    expect(out.settings.batterySaver).toBe(true);
    expect(out.settings.keyboardShortcuts).toBe(false);
    expect(out.settings.guideSeen).toBeNull();
    expect(out.lastMapView).toEqual({ lat: 1, lon: 2, zoom: 8 });
    expect(out.savedViews).toEqual([{ name: "Home", lat: 40, lon: -74, zoom: 9 }]);
    expect(out.recentSearches).toEqual(["DAL1", "KJFK"]);
    expect(out.exportedAt).toBe("2026-11-08T14:05:30.000Z");
    expect(localExportFilename(NOW)).toBe("skydeck-my-data-2026-11-08.json");
  });

  it("copes with an empty or corrupt store", () => {
    const empty = buildLocalExport(fakeStorage(), NOW);
    expect(empty.savedViews).toEqual([]);
    expect(empty.lastMapView).toBeNull();
    const bad = buildLocalExport(
      fakeStorage({
        [STORAGE_KEYS.units]: "furlongs",
        [STORAGE_KEYS.savedViews]: "{not json",
        [STORAGE_KEYS.layers]: "7",
      }),
      NOW,
    );
    expect(bad.settings.units).toBeNull();
    expect(bad.savedViews).toEqual([]);
    expect(bad.settings.layers).toEqual({});
  });
});

describe("local settings", () => {
  it("lists every key once, including the ones the other modules own", () => {
    expect(new Set(LOCAL_DATA_KEYS).size).toBe(LOCAL_DATA_KEYS.length);
    for (const k of [
      "skydeck:units",
      "skydeck:basemap",
      "skydeck:view",
      "skydeck:saved-views",
      "skydeck:recent-searches",
      "skydeck:layers",
      "skydeck.flags",
    ]) {
      expect(LOCAL_DATA_KEYS).toContain(k);
    }
  });

  it("removes every key and reports how many held a value", () => {
    const s = fakeStorage({
      [STORAGE_KEYS.units]: "metric",
      [STORAGE_KEYS.savedViews]: "[]",
      unrelated: "keep",
    });
    expect(clearLocalData(s)).toBe(2);
    expect(s.data).toEqual({ unrelated: "keep" });
    expect(clearLocalData(null)).toBe(0);
  });

  it("reads and writes yes/no preferences, with a fallback", () => {
    const s = fakeStorage();
    expect(readFlagPref("k", true, s)).toBe(true);
    writeFlagPref("k", false, s);
    expect(s.data["k"]).toBe("0");
    expect(readFlagPref("k", true, s)).toBe(false);
    s.data["k"] = "garbage";
    expect(readFlagPref("k", true, s)).toBe(true);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readFlagPref("k", true, throwing)).toBe(true);
    expect(() => writeFlagPref("k", true, throwing)).not.toThrow();
    expect(clearLocalData(throwing)).toBe(0);
  });

  it("polls more slowly in battery saver", () => {
    expect(pollIntervalMs(false)).toBe(POLL_NORMAL_MS);
    expect(pollIntervalMs(true)).toBe(POLL_SAVER_MS);
    expect(POLL_SAVER_MS).toBeGreaterThan(POLL_NORMAL_MS);
  });
});
