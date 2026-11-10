import { describe, expect, it } from "vitest";

import { pointAtAircraft } from "@/lib/measure";
import { DEFAULT_NOTIFY, NOTIFY_KINDS, sanitizeNotify } from "@/lib/notify-prefs";
import { MAP_ACTIONS, mapActionFromSearch, withoutMapAction } from "@/lib/site-meta";
import { STORAGE_KEYS } from "@/lib/local-settings";

describe("ruler from the selected aircraft", () => {
  it("gives the point as longitude then latitude, and nothing for a bad position", () => {
    expect(pointAtAircraft({ lat: 40.64, lon: -73.78 })).toEqual([-73.78, 40.64]);
    expect(pointAtAircraft({ lat: Number.NaN, lon: 1 })).toBeNull();
    expect(pointAtAircraft({ lat: 1, lon: Infinity })).toBeNull();
  });
});

describe("message choices", () => {
  it("defaults to everything on and has a switch for every kind", () => {
    expect(Object.values(DEFAULT_NOTIFY).every(Boolean)).toBe(true);
    expect(NOTIFY_KINDS.map((k) => k.key).sort()).toEqual(Object.keys(DEFAULT_NOTIFY).sort());
    for (const k of NOTIFY_KINDS) {
      expect(k.label.length).toBeGreaterThan(3);
      expect(k.hint.length).toBeGreaterThan(10);
    }
  });

  it("keeps stored booleans and falls back to on for anything else", () => {
    expect(
      sanitizeNotify({ watch: false, stages: "no", rules: 0, achievements: false, extra: false }),
    ).toEqual({
      watch: false,
      stages: true,
      rules: true,
      achievements: false,
    });
    for (const bad of [null, undefined, "x", 5, [], [true]]) {
      expect(sanitizeNotify(bad)).toEqual(DEFAULT_NOTIFY);
    }
  });

  it("is part of the saved-data reset list", () => {
    expect(Object.values(STORAGE_KEYS)).toContain("skydeck:notify");
  });
});

describe("header links into the map", () => {
  it("reads only the two known actions", () => {
    expect(mapActionFromSearch("?open=search")).toBe("search");
    expect(mapActionFromSearch("?lat=1&open=account")).toBe("account");
    expect(mapActionFromSearch("?open=delete")).toBeNull();
    expect(mapActionFromSearch("")).toBeNull();
  });

  it("builds links that read back, and strips the action but keeps the rest", () => {
    for (const [action, href] of Object.entries(MAP_ACTIONS)) {
      expect(mapActionFromSearch(href.slice(1))).toBe(action);
    }
    expect(withoutMapAction("?open=search")).toBe("");
    expect(withoutMapAction("?lat=40.7&open=account&z=9")).toBe("?lat=40.7&z=9");
    expect(withoutMapAction("?lat=40.7")).toBe("?lat=40.7");
  });
});
