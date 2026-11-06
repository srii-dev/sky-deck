# SkyDeck

A live 3D flight tracker for the web. See aircraft move in real time on a terrain map, tap any plane for details, follow it, and watch for emergency squawks.

SkyDeck is an independent project. It is inspired by the general category of flight-tracker apps and is not affiliated with, endorsed by, or a copy of any commercial app.

> **Status:** early work in progress (Phase 1). The live map, search, filters, trails and aircraft categories work. Everything under [Roadmap](#roadmap) is planned, not built.

## Features

- **Live aircraft** on a full-screen MapLibre map, refreshed about every 7 seconds, with positions smoothed between updates so planes glide instead of jumping
- **3D terrain and buildings**, with Dark, Satellite and Light map styles
- **Aircraft details panel**: callsign, registration, type, operator, altitude, speed, vertical rate, heading, squawk, ICAO hex, route (when known), and status (climbing, cruising, descending, on ground)
- **Category icons**: light aircraft, narrowbody, heavy jet, business jet, helicopter, glider, balloon, drone and ground vehicle, with a collapsible legend
- **Altitude-coloured trails**, optionally drawn in 3D at real altitude, plus a follow-aircraft mode
- **Search** by callsign, registration, ICAO hex or airport code
- **Filters**: altitude range, aircraft type, airline, hide ground traffic, emergency squawks only
- **Emergency alerts** for squawks 7500, 7600 and 7700
- **Units**: aviation, metric or imperial
- **Wide-area coverage**: zoomed-out views are split into up to six overlapping circles, merged and de-duplicated, with a notice when a view is only partly covered
- **Provider back-off**: when a data source rate-limits or fails, SkyDeck backs off and falls back to the next one

## Tech stack

- TanStack Start (React 19, TanStack Router and Query), Vite, Tailwind CSS 4, shadcn/ui
- MapLibre GL JS for the map
- Server functions as a thin ADS-B proxy with a short in-memory cache
- Vitest and Testing Library for tests

## Getting started

**Requirements:** a current Node.js LTS (22 recommended) and [Bun](https://bun.sh). The repo ships a `bun.lock`, so Bun gives you the exact dependency versions. npm may also work, but it ignores that lockfile.

```sh
git clone https://github.com/srii-dev8/sky-deck.git
cd sky-deck
bun install
bun run dev
```

Then open the URL that Vite prints (usually http://localhost:3000 or http://localhost:5173).

**No API keys or environment variables are needed.** All data sources and map tiles are free and keyless.

### Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run preview` | Does not currently work with the Cloudflare-targeted build |
| `bun run test` | Run the tests once |
| `bun run test:watch` | Run the tests in watch mode |
| `bun run lint` | Lint the code |
| `bun run format` | Format with Prettier |

## How it works

```
Browser (map, UI)
   │  server function calls
   ▼
Server functions (src/lib/adsb.functions.ts)
   │  adsb.lol → airplanes.live → OpenSky (fallback order, ~5 s cache)
   ▼
Free community ADS-B sources
```

- **The browser never calls ADS-B providers directly.** All requests go through server functions, which avoids CORS problems and keeps provider changes in one place.
- **Coverage** (`src/lib/coverage.ts`): each source caps a query at 250 nm. A large view is covered with up to six circles of about 247 nm on a fixed grid, so small pans reuse the same circles.
- **Feed** (`src/hooks/use-aircraft-feed.ts`): fetches circles a few at a time, merges them, keeps the freshest position per ICAO hex, and schedules the next refresh only after the previous one finishes.
- **Categories** (`src/lib/aircraft-kind.ts`): the aircraft kind comes from the ADS-B emitter category when present, then from ICAO type-code rules, and falls back to a generic plane. It is assigned server-side so the map, panel and future features read one value.
- **Map** (`src/components/skydeck/FlightMap.tsx`): MapLibre is lazy-loaded on the client only. Overlays are re-added after every basemap change, because switching styles replaces the whole style.

### Project layout

```
src/
  components/skydeck/   map, panels, legends, search, filters
  hooks/                aircraft feed and polling
  lib/                  ADS-B proxy, coverage planner, aircraft types, units
  routes/               app routes
  test/                 tests
```

## Data sources and attribution

SkyDeck relies on free community data. Please be gentle with it and respect each provider's terms.

- **Aircraft positions:** [adsb.lol](https://adsb.lol), [airplanes.live](https://airplanes.live) and the [OpenSky Network](https://opensky-network.org)
- **Routes:** the community route data published by adsb.lol
- **Airports (reachable-airport list and map markers):** large and medium airports from [OurAirports](https://ourairports.com/data/) open data (Unlicense), filtered by `scripts/build-airports.mjs`
- **Map data:** OpenStreetMap contributors, served through [OpenFreeMap](https://openfreemap.org)
- **Satellite imagery:** Esri, Maxar, Earthstar Geographics
- **Terrain:** Mapzen / AWS Terrain Tiles

Each of these has its own licence and usage terms. Check them before deploying publicly or commercially.

## Known limitations

- Free sources have no flight history, so a trail only shows the time you have been watching.
- Airport search covers about 110 major airports.
- Some flights show "Route not available" because the free route lookup does not know every flight.
- Wide views still hit provider rate limits. The nearest three circles refresh every poll; farther circles refresh every other poll and keep their last positions. A cold view with nothing cached can come back empty until a provider answers.
- The in-memory cache and back-off state live per server instance, so they behave differently on serverless hosting.
- The emergency-squawk banner has been tested automatically but rarely seen with live data.

## Roadmap

Planned, not yet built:

- [ ] Glide range ring and reachable airports (educational estimate only)
- [ ] ADS-B message inspector, with decoding of raw frames from your own receiver
- [ ] ACARS message viewer using a self-hosted decoder feed
- [ ] Airport pages with weather and crowd-sourced security wait times
- [ ] Replay, plain-English alerts and a watchlist
- [ ] Expanded aircraft silhouettes

## Development notes

- This project was started in Lovable and syncs with GitHub. If you still use Lovable, avoid force-pushing or rewriting pushed history, and keep the connected branch in a working state.
- The app name lives in one place: `src/config/brand.ts`.
- Architecture rules for contributors and coding agents are in `AGENTS.md`.

## Disclaimer

SkyDeck is for education and hobby use. It is **not** for navigation, flight planning, or any operational or safety purpose. Data may be delayed, incomplete or wrong.

## License

Released under the MIT License. See `LICENSE` for the full text.
