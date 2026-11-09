import { describe, expect, it } from "vitest";
import {
  addRecentFlight,
  addWatch,
  isWatched,
  MAX_RECENT_FLIGHTS,
  MAX_WATCH_ITEMS,
  normalizeKey,
  recentFlightLabel,
  removeWatch,
  sanitizeRecentFlights,
  sanitizeWatchlist,
  watchMatches,
  type WatchItem,
} from "@/lib/watchlist";
import {
  ALERT_COOLDOWN_MS,
  detectWatchEvents,
  newAlertState,
  type AlertAircraft,
  type AlertState,
} from "@/lib/watch-alerts";
import { mergeRecentFlights, mergeWatchlists } from "@/lib/cloud-merge";

describe("watchlist", () => {
  it("normalises keys per kind", () => {
    expect(normalizeKey("flight", " ual-123 ")).toBe("UAL123");
    expect(normalizeKey("aircraft", " A1B2C3 ")).toBe("a1b2c3");
    expect(normalizeKey("airport", "kjfk")).toBe("KJFK");
  });

  it("adds newest first, ignores repeats, refuses bad keys and a full list", () => {
    let list: WatchItem[] = [];
    list = addWatch(list, "flight", "ual123", "UAL123", 1)!;
    list = addWatch(list, "airport", "KJFK", "JFK", 2)!;
    expect(list.map((w) => w.key)).toEqual(["KJFK", "UAL123"]);
    expect(addWatch(list, "flight", "UAL 123", "again", 3)).toHaveLength(2);
    expect(addWatch(list, "aircraft", "zzzzzz", "x", 3)).toBeNull();
    expect(addWatch(list, "flight", "ab", "x", 3)).toBeNull();
    expect(addWatch(list, "airport", "K", "x", 3)).toBeNull();
    let full: WatchItem[] = [];
    for (let i = 0; i < MAX_WATCH_ITEMS; i++) {
      full = addWatch(full, "flight", "FLT" + String(i).padStart(3, "0"), "f", i)!;
    }
    expect(addWatch(full, "flight", "NEW999", "n", 99)).toBeNull();
  });

  it("removes and finds items", () => {
    const list = addWatch([], "aircraft", "A1B2C3", "N123AB", 1)!;
    expect(isWatched(list, "aircraft", "a1b2c3")).toBe(true);
    expect(isWatched(list, "flight", "a1b2c3")).toBe(false);
    expect(removeWatch(list, "aircraft", "A1B2C3")).toEqual([]);
  });

  it("matches an aircraft by flight or by hex", () => {
    let list = addWatch([], "flight", "UAL123", "UAL123", 1)!;
    list = addWatch(list, "aircraft", "abc123", "N1", 2)!;
    expect(watchMatches(list, { hex: "ABC123", callsign: null })).toHaveLength(1);
    expect(watchMatches(list, { hex: "000000", callsign: "ual123" })).toHaveLength(1);
    expect(watchMatches(list, { hex: "abc123", callsign: "UAL123" })).toHaveLength(2);
    expect(watchMatches(list, { hex: "000000", callsign: "DAL1" })).toHaveLength(0);
  });

  it("cleans stored data", () => {
    const out = sanitizeWatchlist([
      { kind: "flight", key: "ual 123", label: "  UAL   123  ", addedAt: 5 },
      { kind: "flight", key: "UAL123" },
      { kind: "bogus", key: "x" },
      { kind: "airport", key: "KJFK", addedAt: "no" },
      null,
      "x",
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: "UAL123", label: "UAL 123", addedAt: 5 });
    expect(out[1]?.addedAt).toBe(0);
    expect(sanitizeWatchlist("nope")).toEqual([]);
  });
});

describe("recently viewed", () => {
  it("puts the newest first, replaces the same airframe and limits the list", () => {
    let list = addRecentFlight(
      [],
      { hex: "A1B2C3", callsign: "UAL1", registration: null, type: "B738" },
      1,
    );
    list = addRecentFlight(
      list,
      { hex: "d4e5f6", callsign: null, registration: "N1", type: null },
      2,
    );
    list = addRecentFlight(
      list,
      { hex: "a1b2c3", callsign: "UAL1", registration: null, type: "B738" },
      3,
    );
    expect(list.map((r) => r.hex)).toEqual(["a1b2c3", "d4e5f6"]);
    expect(list[0]?.viewedAt).toBe(3);
    for (let i = 0; i < 30; i++) {
      list = addRecentFlight(
        list,
        { hex: i.toString(16).padStart(6, "0"), callsign: null, registration: null, type: null },
        10 + i,
      );
    }
    expect(list).toHaveLength(MAX_RECENT_FLIGHTS);
    expect(
      addRecentFlight(list, { hex: "nothex", callsign: null, registration: null, type: null }, 99),
    ).toHaveLength(MAX_RECENT_FLIGHTS);
  });

  it("labels and cleans", () => {
    expect(recentFlightLabel({ hex: "abc123", callsign: "UAL1", registration: "N1" })).toBe("UAL1");
    expect(recentFlightLabel({ hex: "abc123", callsign: null, registration: "N1" })).toBe("N1");
    expect(recentFlightLabel({ hex: "abc123", callsign: null, registration: null })).toBe("ABC123");
    expect(sanitizeRecentFlights([{ hex: "xyz" }, { hex: "ABC123", callsign: " UAL1 " }])).toEqual([
      { hex: "abc123", callsign: "UAL1", registration: null, type: null, viewedAt: 0 },
    ]);
  });
});

function ac(p: Partial<AlertAircraft>): AlertAircraft {
  return {
    hex: "abc123",
    callsign: "UAL123",
    lat: 40.64,
    lon: -73.78,
    onGround: true,
    squawk: null,
    seenPos: 1,
    ...p,
  };
}
const WATCH: WatchItem[] = [{ kind: "flight", key: "UAL123", label: "UAL123", addedAt: 1 }];
const AIRPORTS = [{ icao: "KJFK", name: "JFK", lat: 40.6413, lon: -73.7781 }];

function run(
  updates: AlertAircraft[][],
  watch: WatchItem[] = WATCH,
  start = 1_000_000,
  step = 7000,
) {
  let state: AlertState = newAlertState();
  const all: string[] = [];
  updates.forEach((u, i) => {
    const r = detectWatchEvents(state, u, { watch, airports: AIRPORTS, now: start + i * step });
    state = r.state;
    for (const e of r.events) all.push(e.kind + ":" + e.title);
  });
  return all;
}

describe("watch alerts", () => {
  it("raises a takeoff only after the airborne state is seen twice", () => {
    expect(run([[ac({})], [ac({ onGround: false })]])).toEqual([]);
    expect(run([[ac({})], [ac({ onGround: false })], [ac({ onGround: false })]])).toEqual([
      "takeoff:UAL123 took off",
    ]);
  });

  it("raises a landing", () => {
    const air = ac({ onGround: false });
    const gnd = ac({ onGround: true });
    expect(run([[air], [gnd], [gnd]])).toEqual(["landing:UAL123 landed"]);
  });

  it("ignores a one-update flicker", () => {
    const air = ac({ onGround: false });
    const gnd = ac({ onGround: true });
    expect(run([[gnd], [air], [gnd], [gnd], [gnd]])).toEqual([]);
  });

  it("does not alert on the first sight of an aircraft or after a long gap", () => {
    expect(run([[ac({ onGround: false })]])).toEqual([]);
    const gnd = ac({});
    const air = ac({ onGround: false });
    expect(run([[gnd], [air], [air]], WATCH, 1_000_000, 120_000)).toEqual([]);
  });

  it("ignores aircraft with an old position and unwatched aircraft", () => {
    const stale = ac({ seenPos: 60 });
    expect(
      run([[ac({})], [{ ...stale, onGround: false }], [{ ...stale, onGround: false }]]),
    ).toEqual([]);
    expect(
      run([
        [ac({ callsign: "DAL9", hex: "111111" })],
        [ac({ callsign: "DAL9", hex: "111111", onGround: false })],
        [ac({ callsign: "DAL9", hex: "111111", onGround: false })],
      ]),
    ).toEqual([]);
  });

  it("alerts for a watched airframe by hex", () => {
    const watch: WatchItem[] = [{ kind: "aircraft", key: "abc123", label: "N1", addedAt: 1 }];
    const a = ac({ callsign: null });
    expect(run([[a], [{ ...a, onGround: false }], [{ ...a, onGround: false }]], watch)).toEqual([
      "takeoff:ABC123 took off",
    ]);
  });

  it("watches an airport: movements within 6 nm count, farther ones do not", () => {
    const watch: WatchItem[] = [{ kind: "airport", key: "KJFK", label: "JFK", addedAt: 1 }];
    const near = ac({ callsign: "DAL9", hex: "111111" });
    const far = ac({ callsign: "AAL9", hex: "222222", lat: 41.5 });
    const out = run(
      [
        [near, far],
        [
          { ...near, onGround: false },
          { ...far, onGround: false },
        ],
        [
          { ...near, onGround: false },
          { ...far, onGround: false },
        ],
      ],
      watch,
    );
    expect(out).toEqual(["takeoff:DAL9 took off"]);
  });

  it("raises an emergency once and respects the cooldown", () => {
    const a = ac({ squawk: "7700" });
    const out = run([[ac({})], [a], [a], [a]]);
    expect(out).toEqual(["emergency:UAL123 is squawking general emergency code 7700"]);
    // After the cooldown a repeat is allowed again.
    let state = newAlertState();
    const opts = (now: number) => ({ watch: WATCH, airports: AIRPORTS, now });
    state = detectWatchEvents(state, [ac({})], opts(0)).state;
    const first = detectWatchEvents(state, [a], opts(7000));
    expect(first.events).toHaveLength(1);
    const cleared = detectWatchEvents(first.state, [ac({})], opts(14_000));
    const again = detectWatchEvents(cleared.state, [a], opts(21_000));
    expect(again.events).toHaveLength(0);
    const later = detectWatchEvents(again.state, [ac({})], opts(ALERT_COOLDOWN_MS + 30_000));
    expect(
      detectWatchEvents(later.state, [a], opts(ALERT_COOLDOWN_MS + 37_000)).events,
    ).toHaveLength(1);
  });

  it("does not change the state it is given", () => {
    const s0 = newAlertState();
    detectWatchEvents(s0, [ac({})], { watch: WATCH, airports: AIRPORTS, now: 1 });
    expect(s0.snaps.size).toBe(0);
  });
});

describe("cloud merge", () => {
  const w = (key: string, at: number): WatchItem => ({
    kind: "flight",
    key,
    label: key,
    addedAt: at,
  });

  it("unites both lists and lists what to upload", () => {
    const r = mergeWatchlists([w("AAA1", 5), w("BBB2", 3)], [w("BBB2", 4), w("CCC3", 9)]);
    expect(r.merged.map((x) => x.key)).toEqual(["CCC3", "AAA1", "BBB2"]);
    expect(r.toUpload.map((x) => x.key)).toEqual(["AAA1"]);
    expect(r.dropped).toBe(0);
    // The earlier added date stays.
    expect(r.merged.find((x) => x.key === "BBB2")?.addedAt).toBe(3);
  });

  it("keeps the newest items when over the limit", () => {
    const local = Array.from({ length: 40 }, (_, i) =>
      w("LOC" + String(i).padStart(3, "0"), 100 + i),
    );
    const remote = Array.from({ length: 40 }, (_, i) =>
      w("REM" + String(i).padStart(3, "0"), 200 + i),
    );
    const r = mergeWatchlists(local, remote);
    expect(r.merged).toHaveLength(MAX_WATCH_ITEMS);
    expect(r.dropped).toBe(30);
    expect(r.toUpload.every((x) => r.merged.some((m) => m.key === x.key))).toBe(true);
  });

  it("merges recent flights by newest view", () => {
    const rf = (hex: string, at: number) => ({
      hex,
      callsign: null,
      registration: null,
      type: null,
      viewedAt: at,
    });
    const r = mergeRecentFlights(
      [rf("aaaaaa", 10), rf("bbbbbb", 5)],
      [rf("bbbbbb", 8), rf("cccccc", 3)],
    );
    expect(r.merged.map((x) => x.hex)).toEqual(["aaaaaa", "bbbbbb", "cccccc"]);
    expect(r.toUpload.map((x) => x.hex)).toEqual(["aaaaaa"]);
    expect(mergeRecentFlights([], []).merged).toEqual([]);
  });
});
