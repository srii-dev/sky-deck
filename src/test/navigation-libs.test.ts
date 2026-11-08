import { afterEach, describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft";
import { locationErrorMessage } from "@/lib/geolocate";
import {
  addView,
  cleanName,
  loadViews,
  MAX_NAME_LENGTH,
  MAX_SAVED_VIEWS,
  removeView,
  sanitizeViews,
  SAVED_VIEWS_KEY,
  storeViews,
  type SavedView,
} from "@/lib/saved-views";
import { addRecent, loadRecent, MAX_RECENT, rankAircraft, storeRecent } from "@/lib/search-rank";
import { buildShareSearch, parseShareParams } from "@/lib/share-link";

afterEach(() => {
  localStorage.clear();
});

const ac = (over: Partial<Aircraft>): Aircraft =>
  ({
    hex: "abc123",
    callsign: null,
    registration: null,
    type: null,
    description: null,
    operator: null,
    lat: 0,
    lon: 0,
    altFt: null,
    onGround: false,
    gs: null,
    track: null,
    vRate: null,
    squawk: null,
    category: null,
    kind: "plane",
    kindLabel: "Plane",
    seenPos: 0,
    ...over,
  }) as Aircraft;

describe("share links", () => {
  it("reads a full link", () => {
    const s = parseShareParams(
      "?lat=40.7128&lon=-74.006&z=9.5&p=45&b=-15&hex=A835AF&base=satellite",
    );
    expect(s).toEqual({
      lat: 40.7128,
      lon: -74.006,
      zoom: 9.5,
      pitch: 45,
      bearing: -15,
      hex: "a835af",
      basemap: "satellite",
    });
  });

  it("ignores out-of-range, malformed and incomplete values", () => {
    expect(parseShareParams("?lat=95&lon=10&z=5")).toEqual({});
    expect(parseShareParams("?lat=40")).toEqual({});
    expect(parseShareParams("?lat=abc&lon=1")).toEqual({});
    expect(parseShareParams("?lat=1&lon=2&z=99").zoom).toBeUndefined();
    expect(parseShareParams("?hex=zzzzzz&base=neon")).toEqual({});
    expect(parseShareParams("")).toEqual({});
  });

  it("builds a query string and keeps unrelated parameters", () => {
    const search = buildShareSearch(
      { lat: 40.712812, lon: -74.00601, zoom: 9.456, pitch: 45.4, hex: "A835AF", basemap: "dark" },
      "?mock=1&lat=1",
    );
    const p = new URLSearchParams(search);
    expect(p.get("mock")).toBe("1");
    expect(p.get("lat")).toBe("40.7128");
    expect(p.get("lon")).toBe("-74.006");
    expect(p.get("z")).toBe("9.46");
    expect(p.get("p")).toBe("45");
    expect(p.get("hex")).toBe("a835af");
    expect(p.get("base")).toBe("dark");
  });

  it("round-trips", () => {
    const state = { lat: 51.47, lon: -0.4543, zoom: 11, pitch: 30, bearing: 90 };
    const back = parseShareParams(buildShareSearch(state));
    expect(back).toMatchObject(state);
  });
});

describe("saved views", () => {
  const v = (name: string): SavedView => ({ name, lat: 10, lon: 20, zoom: 8 });

  it("cleans names", () => {
    expect(cleanName("  My   airport  ")).toBe("My airport");
    expect(cleanName("x".repeat(100)).length).toBe(MAX_NAME_LENGTH);
  });

  it("adds newest first, replaces the same name, refuses an empty name", () => {
    let list = addView([], v("Home"))!;
    list = addView(list, v("Work"))!;
    expect(list.map((x) => x.name)).toEqual(["Work", "Home"]);
    list = addView(list, { ...v("home"), zoom: 12 })!;
    expect(list.map((x) => x.name)).toEqual(["home", "Work"]);
    expect(list[0]!.zoom).toBe(12);
    expect(addView(list, v("   "))).toBeNull();
  });

  it("keeps at most MAX_SAVED_VIEWS", () => {
    let list: SavedView[] = [];
    for (let i = 0; i < MAX_SAVED_VIEWS + 5; i++) list = addView(list, v(`View ${i}`))!;
    expect(list.length).toBe(MAX_SAVED_VIEWS);
  });

  it("removes by name", () => {
    expect(removeView([v("a"), v("b")], "a").map((x) => x.name)).toEqual(["b"]);
  });

  it("drops malformed stored entries", () => {
    const clean = sanitizeViews([
      v("ok"),
      { name: "", lat: 1, lon: 1, zoom: 1 },
      { name: "bad lat", lat: 200, lon: 1, zoom: 1 },
      { name: "no zoom", lat: 1, lon: 1 },
      "string",
      null,
    ]);
    expect(clean.map((x) => x.name)).toEqual(["ok"]);
    expect(sanitizeViews("nope")).toEqual([]);
  });

  it("stores and loads, and survives corrupt storage", () => {
    storeViews([v("Home")]);
    expect(loadViews().map((x) => x.name)).toEqual(["Home"]);
    localStorage.setItem(SAVED_VIEWS_KEY, "{not json");
    expect(loadViews()).toEqual([]);
  });
});

describe("search ranking", () => {
  const list = [
    ac({
      hex: "000001",
      callsign: "UAL1367",
      registration: "N29124",
      type: "B752",
      operator: "United Airlines",
    }),
    ac({
      hex: "000002",
      callsign: "DAL88",
      registration: "N801NW",
      type: "A333",
      operator: "Delta Air Lines",
    }),
    ac({ hex: "000003", callsign: "UPS2", registration: "N300UP", type: "B744", operator: "UPS" }),
    ac({
      hex: "a1b2c3",
      callsign: "AAL10",
      registration: "N1",
      type: "B752",
      operator: "American Airlines",
    }),
  ];

  it("ranks an exact callsign before a prefix", () => {
    expect(rankAircraft("UPS2", list)[0]!.hex).toBe("000003");
    expect(rankAircraft("UAL", list)[0]!.hex).toBe("000001");
  });

  it("finds by registration with or without a dash", () => {
    expect(rankAircraft("N-29124", list)[0]!.hex).toBe("000001");
  });

  it("finds by hex prefix", () => {
    expect(rankAircraft("a1b2", list)[0]!.hex).toBe("a1b2c3");
  });

  it("finds by aircraft type and lists every match", () => {
    expect(
      rankAircraft("B752", list)
        .map((a) => a.hex)
        .sort(),
    ).toEqual(["000001", "a1b2c3"]);
  });

  it("finds by airline name, including a word inside it", () => {
    expect(rankAircraft("delta", list)[0]!.hex).toBe("000002");
    expect(
      rankAircraft("lines", list)
        .map((a) => a.hex)
        .sort(),
    ).toEqual(["000001", "000002", "a1b2c3"]); // United Airlines, Delta Air Lines, American Airlines
    expect(rankAircraft("united air", list)[0]!.hex).toBe("000001");
  });

  it("returns nothing for a short query and respects the limit", () => {
    expect(rankAircraft("u", list)).toEqual([]);
    expect(rankAircraft("B7", list, 1)).toHaveLength(1);
  });
});

describe("recent searches", () => {
  it("puts the newest first, removes duplicates, caps the list", () => {
    let r: string[] = [];
    for (const t of ["ual1", "dal2", "UAL1", "aa3", "b4", "c5", "d6"]) r = addRecent(r, t);
    expect(r[0]).toBe("d6");
    expect(r.length).toBe(MAX_RECENT);
    expect(r.filter((x) => x.toLowerCase() === "ual1").length).toBeLessThanOrEqual(1);
  });

  it("ignores very short terms and survives corrupt storage", () => {
    expect(addRecent(["abc"], "a")).toEqual(["abc"]);
    localStorage.setItem("skydeck:recent-searches", "[1, 2");
    expect(loadRecent()).toEqual([]);
    storeRecent(["abc"]);
    expect(loadRecent()).toEqual(["abc"]);
  });
});

describe("my location", () => {
  it("explains each error code", () => {
    expect(locationErrorMessage(1)).toMatch(/blocked/);
    expect(locationErrorMessage(2)).toMatch(/not available/);
    expect(locationErrorMessage(3)).toMatch(/too long/);
    expect(locationErrorMessage(undefined)).toMatch(/Could not/);
  });
});
