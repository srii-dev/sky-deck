import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DATA_BUSY_MESSAGE } from "@/lib/aircraft";
import { getAircraftFeed, getFlightRoute, searchAircraft } from "@/lib/adsb.functions";

/* The ADS-B server functions: input limits, per-visitor rate limits, and what is cached for how long. */

const server = vi.hoisted(() => ({
  ip: "",
  headers: [] as [string, string][],
  loadFeed: vi.fn(),
  search: vi.fn(),
  getJson: vi.fn(),
}));

// A server function becomes a plain function that validates its input and runs the handler.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (d: unknown) => d;
    const builder = {
      validator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (o: { data: unknown }) => unknown) {
        return async (o: { data: unknown }) => h({ data: validate(o.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => (name === "cf-connecting-ip" ? server.ip : undefined),
  setResponseHeader: (name: string, value: string) => server.headers.push([name, value]),
}));
vi.mock("@/lib/feed-hub.server", () => ({ loadFeedShared: server.loadFeed }));
vi.mock("@/lib/adsb-sources", async (original) => ({
  ...(await original<typeof import("@/lib/adsb-sources")>()),
  searchAircraftSources: server.search,
  getJson: server.getJson,
}));

const NO_STORE: [string, string] = ["Cache-Control", "no-store"];
const HOUR = 60 * 60 * 1000;

let visitor = 0;
const newVisitor = () => (server.ip = "203.0.113." + ++visitor);
beforeEach(() => {
  vi.useFakeTimers();
  newVisitor();
  server.headers = [];
  server.loadFeed.mockReset().mockResolvedValue({ aircraft: [], source: "adsb.lol" });
  server.search.mockReset().mockResolvedValue({ aircraft: [] });
  server.getJson.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("getAircraftFeed", () => {
  const call = (data: unknown) => getAircraftFeed({ data: data as never });
  const here = { lat: 42.3601, lon: -71.0589, radiusNm: 100 };

  it("refuses a viewport outside the allowed ranges", async () => {
    for (const bad of [
      { lat: 91 },
      { lon: -181 },
      { radiusNm: 0 },
      { radiusNm: 251 },
      { lat: "1" },
    ])
      await expect(call({ ...here, ...bad })).rejects.toThrow();
    expect(server.loadFeed).not.toHaveBeenCalled();
  });

  it("loads the snapped circle through the shared loader", async () => {
    const { snapFeedCircle } = await import("@/lib/adsb-sources");
    await expect(call(here)).resolves.toEqual({ aircraft: [], source: "adsb.lol" });
    const c = snapFeedCircle(here.lat, here.lon, here.radiusNm);
    expect(server.loadFeed).toHaveBeenCalledWith(c.lat, c.lon, c.radiusNm);
  });

  it("answers busy, uncached, once one visitor passes 240 calls a minute", async () => {
    for (let i = 0; i < 240; i++) await call(here);
    expect(server.headers).toEqual([]);

    await expect(call(here)).resolves.toMatchObject({
      aircraft: [],
      source: "none",
      busy: true,
      error: DATA_BUSY_MESSAGE,
    });
    expect(server.headers).toEqual([NO_STORE]);
    expect(server.loadFeed).toHaveBeenCalledTimes(240);

    const limited = server.ip;
    newVisitor();
    await call(here);
    expect(server.loadFeed).toHaveBeenCalledTimes(241);

    server.ip = limited;
    vi.advanceTimersByTime(60_000);
    await call(here);
    expect(server.loadFeed).toHaveBeenCalledTimes(242);
  });
});

describe("searchAircraft", () => {
  const call = (q: string) => searchAircraft({ data: { q } });

  it("refuses a query that is too short or too long", async () => {
    await expect(call(" a ")).rejects.toThrow();
    await expect(call("A".repeat(13))).rejects.toThrow();
    expect(server.search).not.toHaveBeenCalled();
  });

  it("cleans the query and answers a repeat from the cache", async () => {
    server.search.mockResolvedValue({ aircraft: [{ hex: "abc123" }] });
    const first = await call("  n-12 3?x ");
    expect(server.search).toHaveBeenCalledWith("N-123X");
    await expect(call("N-123X")).resolves.toEqual(first);
    expect(server.search).toHaveBeenCalledTimes(1);
  });

  it("limits new searches per visitor but still serves cached ones", async () => {
    for (let i = 0; i < 30; i++) await call("LIM" + i);

    await expect(call("LIM30")).resolves.toMatchObject({ aircraft: [], busy: true });
    expect(server.headers).toEqual([NO_STORE]);
    expect(server.search).toHaveBeenCalledTimes(30);
    await expect(call("LIM29")).resolves.toEqual({ aircraft: [] });
  });
});

describe("getFlightRoute", () => {
  const call = (callsign: string) => getFlightRoute({ data: { callsign } });
  const logan = {
    lat: 42.36,
    lon: -71.01,
    iata: "BOS",
    icao: "KBOS",
    name: "Logan",
    location: "B",
  };
  const heathrow = { lat: 51.47, lon: -0.45, iata: " ", name: 5 };
  const notFound = Object.assign(new Error("HTTP 404"), { status: 404 });

  it("takes the first and last usable airports and lets browsers cache the answer", async () => {
    server.getJson.mockResolvedValue({
      _airports: [{ name: "no position" }, logan, { lat: 1, lon: Number.NaN }, heathrow],
    });
    await expect(call("ba-w1")).resolves.toEqual({
      origin: logan,
      destination: {
        iata: null,
        icao: null,
        name: "Unknown airport",
        location: null,
        lat: 51.47,
        lon: -0.45,
      },
    });
    expect(server.getJson).toHaveBeenCalledWith(
      "https://vrs-standing-data.adsb.lol/routes/BA/BAW1.json",
      5000,
    );
    expect(server.headers).toEqual([
      ["Cache-Control", "public, max-age=3600, stale-while-revalidate=86400"],
    ]);
  });

  it("remembers a route for an hour, then asks again", async () => {
    server.getJson.mockResolvedValue({ _airports: [logan, heathrow] });
    await call("TTL1");
    vi.advanceTimersByTime(HOUR - 1);
    await call("TTL1");
    expect(server.getJson).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await call("TTL1");
    expect(server.getJson).toHaveBeenCalledTimes(2);
  });

  it("does not look up a callsign with fewer than three letters or digits", async () => {
    await expect(call("a--")).resolves.toBeNull();
    expect(server.getJson).not.toHaveBeenCalled();
  });

  it("has no route when fewer than two airports are usable", async () => {
    server.getJson.mockResolvedValueOnce({ _airports: [logan] }).mockResolvedValueOnce({});
    await expect(call("ONE1")).resolves.toBeNull();
    await expect(call("NONE1")).resolves.toBeNull();
  });

  it("remembers an unknown route (404) for the full hour", async () => {
    server.getJson.mockRejectedValue(notFound);
    await expect(call("UNK1")).resolves.toBeNull();
    expect(server.headers).not.toContainEqual(NO_STORE);
    vi.advanceTimersByTime(HOUR - 1);
    await call("UNK1");
    expect(server.getJson).toHaveBeenCalledTimes(1);
  });

  it("retries after a minute when the source failed, and tells browsers not to cache", async () => {
    server.getJson.mockRejectedValueOnce(Object.assign(new Error("HTTP 503"), { status: 503 }));
    await expect(call("ERR1")).resolves.toBeNull();
    expect(server.headers).toContainEqual(NO_STORE);

    vi.advanceTimersByTime(59_999);
    await call("ERR1");
    expect(server.getJson).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    server.getJson.mockResolvedValue({ _airports: [logan, heathrow] });
    await expect(call("ERR1")).resolves.toMatchObject({ origin: { iata: "BOS" } });
  });
});
