import { afterEach, describe, expect, it } from "vitest";
import { AIRPORTS } from "@/lib/airports";
import {
  currentAirportList,
  isLargeLoaded,
  loadLargeAirports,
  resetAirportList,
  rowToAirport,
} from "@/lib/airport-list";
import { reachableAirports } from "@/lib/reachable-airports";

afterEach(() => {
  resetAirportList();
});

describe("airport list loading", () => {
  it("starts with the short built-in list", () => {
    expect(isLargeLoaded()).toBe(false);
    expect(currentAirportList()).toBe(AIRPORTS);
  });

  it("switches to the larger list after loading, and loads only once", async () => {
    const [a, b] = await Promise.all([loadLargeAirports(), loadLargeAirports()]);
    expect(a).toBe(b);
    expect(isLargeLoaded()).toBe(true);
    expect(currentAirportList()).toBe(a);
    expect(await loadLargeAirports()).toBe(a);
  });

  it("maps a generated row to an Airport", () => {
    expect(rowToAirport(["JFK", "KJFK", "John F Kennedy", "New York", 40.6398, -73.7789])).toEqual({
      iata: "JFK",
      icao: "KJFK",
      name: "John F Kennedy",
      city: "New York",
      lat: 40.6398,
      lon: -73.7789,
    });
  });
});

describe("generated airport data", () => {
  it("is large, unique, well-formed and a superset of the short list's codes", async () => {
    const list = await loadLargeAirports();
    expect(list.length).toBeGreaterThan(3000);
    expect(new Set(list.map((x) => x.iata)).size).toBe(list.length);
    expect(new Set(list.map((x) => x.icao)).size).toBe(list.length);
    for (const x of list) {
      expect(x.iata).toMatch(/^[A-Z0-9]{3}$/);
      expect(x.icao).toMatch(/^[A-Z0-9]{4}$/);
      expect(x.lat).toBeGreaterThanOrEqual(-90);
      expect(x.lat).toBeLessThanOrEqual(90);
      expect(x.lon).toBeGreaterThanOrEqual(-180);
      expect(x.lon).toBeLessThanOrEqual(180);
      expect(x.name.length).toBeGreaterThan(0);
    }
    const large = new Set(list.map((x) => x.iata));
    const missing = AIRPORTS.filter((x) => !large.has(x.iata)).map((x) => x.iata);
    // The short list is hand-picked majors; nearly all must be in the OurAirports large/medium set.
    expect(missing.length).toBeLessThanOrEqual(3);
  });

  it("finds more nearby airports than the short list does", async () => {
    const list = await loadLargeAirports();
    // 60 nm around Los Angeles: the short list has LAX only; the large list adds more.
    const small = reachableAirports(34.05, -118.24, 60, 20, AIRPORTS);
    const big = reachableAirports(34.05, -118.24, 60, 20, list);
    expect(small.map((r) => r.airport.iata)).toContain("LAX");
    expect(big.length).toBeGreaterThan(small.length);
    expect(big.map((r) => r.airport.iata)).toContain("LAX");
  });
});
