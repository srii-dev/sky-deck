// Stub ADS-B provider for the end-to-end flow tests (Phase 16f). No dependencies: node e2e/stub-upstream.mjs <port>
// The app sends its provider and route requests here when ADSB_UPSTREAM_OVERRIDE is set (src/lib/upstream-override.ts),
// with the real host as the first part of the path, for example /api.adsb.lol/v2/point/40.7/-73.95/150.
//
// Answers, in the readsb v2 shape the app parses:
//   /<provider>/v2/point/<lat>/<lon>/<radius nm>    aircraft within that circle
//   /<provider>/v2/hex/<hex>, /callsign/<cs>, /reg/<reg>
//   /vrs-standing-data.adsb.lol/routes/<xx>/<callsign>.json    a route, or 404
//   /__stub/health                                   200 when ready (Playwright waits for it)
//   /__stub/fail?status=500|429[&ms=60000]           every provider and route request fails with that status for ms
//   /__stub/fail?status=0                            back to normal
// Anything else is 404. <provider> is api.adsb.lol or api.airplanes.live; both get the same data.
import { createServer } from "node:http";

// INVENTED test data: these callsigns, registrations and hex codes describe no real aircraft, flight or operator;
// any match with a real one is a coincidence. They sit around the map's default centre (40.72, -73.95), plus one far
// away (SKD999) that only a search can find. Altitude and speed stay constant so the panel text is predictable.
const AIRCRAFT = [
  {
    hex: "a5c101",
    flight: "SKD101",
    r: "N101SD",
    t: "B738",
    desc: "BOEING 737-800",
    category: "A3",
    lat: 40.8,
    lon: -73.7,
    alt: 12000,
    gs: 280,
    squawk: "3401",
  },
  {
    hex: "a5c202",
    flight: "SKD202",
    r: "N202SD",
    t: "A320",
    desc: "AIRBUS A-320",
    category: "A3",
    lat: 40.55,
    lon: -74.2,
    alt: 24000,
    gs: 410,
    squawk: "2215",
  },
  {
    hex: "a5c303",
    flight: "SKD303",
    r: "N303SD",
    t: "B77W",
    desc: "BOEING 777-300ER",
    category: "A5",
    lat: 40.95,
    lon: -73.6,
    alt: 35000,
    gs: 480,
    squawk: "1130",
  },
  {
    hex: "a5c404",
    flight: "SKD404",
    r: "N404SD",
    t: "A359",
    desc: "AIRBUS A-350-900",
    category: "A5",
    lat: 40.4,
    lon: -73.8,
    alt: 8000,
    gs: 250,
    squawk: "4521",
  },
  {
    hex: "a5c505",
    flight: "N505SD",
    r: "N505SD",
    t: "C172",
    desc: "CESSNA 172",
    category: "A1",
    lat: 40.9,
    lon: -74.1,
    alt: 3500,
    gs: 105,
    squawk: "1200",
  },
  {
    hex: "a5c606",
    flight: "N606SD",
    r: "N606SD",
    t: "PA28",
    desc: "PIPER PA-28",
    category: "A1",
    lat: 40.62,
    lon: -74.3,
    alt: 2500,
    gs: 95,
    squawk: "1200",
  },
  {
    hex: "a5c707",
    flight: "N707SD",
    r: "N707SD",
    t: "EC35",
    desc: "EUROCOPTER EC-135",
    category: "A7",
    lat: 40.75,
    lon: -73.98,
    alt: 1200,
    gs: 110,
    squawk: "1200",
  },
  {
    hex: "a5c808",
    flight: "N808SD",
    r: "N808SD",
    t: "AS21",
    desc: "SCHLEICHER ASK-21",
    category: "B1",
    lat: 41.0,
    lon: -74.25,
    alt: 4500,
    gs: 50,
    squawk: "1200",
  },
  {
    hex: "a5c912",
    flight: "N912SD",
    r: "N912SD",
    t: "C68A",
    desc: "CESSNA 680A",
    category: "A2",
    lat: 40.45,
    lon: -74.05,
    alt: 18000,
    gs: 360,
    squawk: "5120",
  },
  // The military flag (dbFlags bit 1).
  {
    hex: "ae0909",
    flight: "KNGT91",
    r: "09-0909",
    t: "C17",
    desc: "BOEING C-17",
    category: "A5",
    lat: 41.05,
    lon: -73.85,
    alt: 20000,
    gs: 380,
    squawk: "4401",
    dbFlags: 1,
  },
  // On the ground at JFK: it does not move.
  {
    hex: "a5c110",
    flight: "SKD110",
    r: "N110SD",
    t: "E75L",
    desc: "EMBRAER 175",
    category: "A3",
    lat: 40.6413,
    lon: -73.7781,
    alt: "ground",
    gs: 12,
    squawk: "2000",
  },
  // Squawking 7700 (general emergency).
  {
    hex: "a5c711",
    flight: "SKD711",
    r: "N711SD",
    t: "E75L",
    desc: "EMBRAER 175",
    category: "A3",
    lat: 40.68,
    lon: -74.12,
    alt: 9000,
    gs: 300,
    squawk: "7700",
  },
  // Far away (Los Angeles): not in the default view, only found by a search.
  {
    hex: "a5c999",
    flight: "SKD999",
    r: "N999SD",
    t: "B738",
    desc: "BOEING 737-800",
    category: "A3",
    lat: 33.95,
    lon: -118.2,
    alt: 16000,
    gs: 300,
    squawk: "6001",
  },
];

// Real airports (public coordinates), invented pairings.
const AIRPORTS = {
  JFK: {
    iata: "JFK",
    icao: "KJFK",
    name: "John F Kennedy International Airport",
    location: "New York",
    lat: 40.6413,
    lon: -73.7781,
  },
  BOS: {
    iata: "BOS",
    icao: "KBOS",
    name: "Logan International Airport",
    location: "Boston",
    lat: 42.3656,
    lon: -71.0096,
  },
};
const ROUTES = { SKD101: ["JFK", "BOS"] };

const PERIOD_S = 600;
const toR = Math.PI / 180;

/** Where an aircraft is at `nowMs`: each flies a circle at its own speed, so trails and interpolation have work. */
function position(a, i, nowMs) {
  if (a.alt === "ground") return { lat: a.lat, lon: a.lon, track: 90 };
  const radiusNm = (a.gs * PERIOD_S) / (2 * Math.PI * 3600);
  const theta = ((nowMs / 1000 / PERIOD_S) * 2 * Math.PI + i) % (2 * Math.PI);
  const lat = a.lat + (radiusNm * Math.cos(theta)) / 60;
  const lon = a.lon + (radiusNm * Math.sin(theta)) / (60 * Math.cos(a.lat * toR));
  return { lat, lon, track: (((theta / toR + 90) % 360) + 360) % 360 };
}

function readsb(a, i, nowMs) {
  const p = position(a, i, nowMs);
  return {
    hex: a.hex,
    type: "adsb_icao",
    flight: a.flight.padEnd(8, " "),
    r: a.r,
    t: a.t,
    desc: a.desc,
    ...(a.dbFlags ? { dbFlags: a.dbFlags } : {}),
    alt_baro: a.alt,
    ...(a.alt === "ground" ? {} : { alt_geom: a.alt + 150 }),
    gs: a.gs,
    track: Math.round(p.track * 10) / 10,
    baro_rate: 0,
    squawk: a.squawk,
    category: a.category,
    lat: Math.round(p.lat * 1e6) / 1e6,
    lon: Math.round(p.lon * 1e6) / 1e6,
    seen_pos: 0.4,
    seen: 0.2,
    messages: 1000 + i,
    rssi: -20,
  };
}

function distanceNm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function list(match) {
  const now = Date.now();
  const ac = AIRCRAFT.map((a, i) => readsb(a, i, now)).filter(match);
  return { ac, msg: "No error", now, total: ac.length, ctime: now, ptime: 0 };
}

let fail = { status: 0, until: 0 };

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const path = decodeURIComponent(url.pathname);

  if (path === "/__stub/health") return send(res, 200, { ok: true });
  if (path === "/__stub/fail") {
    const status = Number(url.searchParams.get("status") ?? 0);
    const ms = Number(url.searchParams.get("ms") ?? 60_000);
    // shortcut: the switch is global to this stub, so only a test that runs alone may use it (see playwright.config.ts).
    fail =
      status === 500 || status === 429
        ? { status, until: Date.now() + ms }
        : { status: 0, until: 0 };
    return send(res, 200, fail);
  }
  if (fail.status && Date.now() < fail.until)
    return send(res, fail.status, { msg: "stub failure" });

  let m =
    /^\/api\.(?:adsb\.lol|airplanes\.live)\/v2\/point\/(-?[\d.]+)\/(-?[\d.]+)\/([\d.]+)$/.exec(
      path,
    );
  if (m) {
    const [lat, lon, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return send(
      res,
      200,
      list((a) => distanceNm(lat, lon, a.lat, a.lon) <= r),
    );
  }
  m = /^\/api\.(?:adsb\.lol|airplanes\.live)\/v2\/(hex|callsign|reg)\/([A-Za-z0-9-]+)$/.exec(path);
  if (m) {
    const [kind, q] = [m[1], m[2].toUpperCase()];
    const key = { hex: "hex", callsign: "flight", reg: "r" }[kind];
    return send(
      res,
      200,
      list((a) => String(a[key]).trim().toUpperCase() === q),
    );
  }
  m = /^\/vrs-standing-data\.adsb\.lol\/routes\/[A-Z0-9]{2}\/([A-Z0-9]+)\.json$/.exec(path);
  if (m && ROUTES[m[1]]) {
    const [from, to] = ROUTES[m[1]];
    return send(res, 200, { callsign: m[1], _airports: [AIRPORTS[from], AIRPORTS[to]] });
  }
  return send(res, 404, { msg: "not found" });
});

const port = Number(process.argv[2] ?? process.env.STUB_PORT ?? 4176);
server.listen(port, "127.0.0.1", () => console.log(`stub upstream on http://127.0.0.1:${port}`));
