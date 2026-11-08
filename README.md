# SkyDeck

A live 3D flight tracker for the web. See aircraft move in real time on a terrain map, tap any plane for details, follow it, and watch for emergency squawks.

SkyDeck is an independent project. It is inspired by the general category of flight-tracker apps and is not affiliated with, endorsed by, or a copy of any commercial app.

> **Status:** early work in progress. The live map, search, filters, trails and aircraft categories work, and so do the glide-range ring with reachable airports, an ADS-B message inspector and on-demand ACARS messages. Unchecked items under [Roadmap](#roadmap) are planned, not built.

## Features

- **Live aircraft** on a full-screen MapLibre map, refreshed about every 7 seconds, with positions smoothed between updates so planes glide instead of jumping
- **3D terrain and buildings**, with Dark, Satellite and Light map styles
- **Aircraft details panel**: callsign, registration, type, operator, altitude, speed, vertical rate, heading, squawk, ICAO hex, route (when known), and status (climbing, cruising, descending, on ground)
- **Category icons**: light aircraft, narrowbody, heavy jet, business jet, helicopter, glider, balloon, drone and ground vehicle, with a collapsible legend
- **Altitude-coloured trails**, optionally drawn in 3D at real altitude, plus a follow-aircraft mode
- **Search** by callsign, registration, ICAO hex, aircraft type, airline name (when known) or airport code, with recent searches
- **Shareable links, my location and saved views**: the address always describes the current view (map position, selected aircraft, basemap), so you can copy it; one button centres the map on you, and named views are kept in your browser
- **Airport pages**: search an airport code to see its weather (METAR, TAF, flight category), FAA delays and closure notices, runways, elevation, the current digital ATIS text, a short rule-based brief (written by fixed rules, not AI), a link to the FAA charts for US airports, a guess of the runway in use (from the wind and from aircraft lined up with a runway; air traffic control decides), and counts of aircraft near it (arriving and departing are inferred from altitude, climb or descent and heading). At high zoom the map also shows aprons, taxiway names and gate numbers near airports. "My location" also lists the nearest airports. Local time, NOTAMs, terminal buildings as a separate layer and airport cameras are not included
- **Layers, ruler, flight chart and full screen**: a Layers menu switches terrain, the trail, the 3D trail and the glide ring (choices are remembered); the ruler measures distance and bearing between two clicked points; the aircraft panel charts altitude, speed and vertical rate since you started watching
- **Settings, shortcuts and first-run guide**: a gear button opens Settings (units, map style, layer defaults, battery saver, shortcuts on or off, a JSON download of your saved data and a delete). Single-key shortcuts (press ? for the list) and a short guide on your first visit. Everything is kept in your browser only
- **Trail download and aircraft facts**: download the selected aircraft's trail as CSV or GPX (built in your browser, with a data credit). An "About this aircraft" card shows type, operator, age and emitter category when the data feed has them, and says Unknown when it does not
- **Phone layout**: a swipeable bottom sheet, 40 px touch targets, safe-area spacing, a landscape layout and a battery saver (aircraft refresh every 15 s instead of 7 s)
- **Filters**: altitude range, aircraft type, airline, hide ground traffic, emergency squawks only
- **Emergency alerts** for squawks 7500, 7600 and 7700
- **Units**: aviation, metric or imperial
- **Wide-area coverage**: zoomed-out views are split into up to six overlapping circles, merged and de-duplicated, with a notice when a view is only partly covered
- **Provider back-off and pacing**: when a data source rate-limits or fails, SkyDeck backs off and falls back to the next one. Requests to each provider are spaced out, and identical in-flight requests are shared
- **Glide-range ring** (educational estimate only): for the selected aircraft, a ring showing how far it could glide from its height above the terrain, with a slider for the rule-of-thumb glide ratio
- **Reachable airports**: airports inside the ring are listed in the aircraft panel, shown on the map, and the nearest is named in the panel header. About 4,500 large and medium airports from OurAirports, loaded on demand
- **ADS-B message inspector** at `/inspector` (also linked from the Filters popover): paste raw Mode S frames and see the downlink format, ICAO address, CRC check and decoded fields. It runs entirely in your browser
- **ACARS messages** for the selected aircraft, loaded only when you press a button, from the public Airframes API (see "How it works" and the notes under Known limitations)

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

**No API keys or environment variables are needed.** All data sources and map tiles are free and keyless (ACARS messages use Airframes' anonymous public API).

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
   │  adsb.lol → airplanes.live (fallback order, ~5 s cache)
   ▼
Free community ADS-B sources
```

- **The browser never calls ADS-B providers directly.** All requests go through server functions, which avoids CORS problems and keeps provider changes in one place.
- **The one exception is ACARS messages** (`src/lib/airframes-client.ts`): the browser calls the public Airframes API directly, on demand and only for the selected aircraft. That way each visitor has their own request budget and no message passes through or is stored on our server. Message text is cleaned and shown as plain text only.
- **Pacing and sharing** (`src/lib/request-control.ts`, `PROVIDER_MIN_GAP_MS` in `src/lib/adsb-sources.ts`): requests to each ADS-B provider are spaced out, and callers asking for the same area at the same time share one upstream request. A cached tile is aged before it is sent, and when a provider's queue is long a cached tile up to 30 s old is served instead of waiting. All of this works per server instance only.
- **Coverage** (`src/lib/coverage.ts`): each source caps a query at 250 nm. The map asks for fixed tiles, so everyone looking at the same area asks for the same tiles and shares the server cache: zoomed-in views use 100 nm or 200 nm tiles, mid-size views one circle with a snapped centre and radius, and views over 250 nm up to six circles of about 247 nm on a fixed grid.
- **Feed** (`src/hooks/use-aircraft-feed.ts`): fetches circles a few at a time, merges them, keeps the freshest position per ICAO hex, and schedules the next refresh only after the previous one finishes. If every provider fails, the last good aircraft stay on screen for up to 2 minutes (the status chip shows their age), then the list clears.
- **Categories** (`src/lib/aircraft-kind.ts`): the aircraft kind comes from the ADS-B emitter category when present, then from ICAO type-code rules, and falls back to a generic plane. It is assigned server-side so the map, panel and future features read one value.
- **Map** (`src/components/skydeck/FlightMap.tsx`): MapLibre is lazy-loaded on the client only. Overlays are re-added after every basemap change, because switching styles replaces the whole style.

### Project layout

```
src/
  components/skydeck/   map, panels, legends, search, filters
  hooks/                aircraft feed and polling
  lib/                  ADS-B proxy, coverage planner, aircraft types, glide and airport
                        maths, Mode S decoder, ACARS client, request pacing, units
  routes/               app routes (the map at /, the message inspector at /inspector)
  test/                 tests
scripts/                build-airports.mjs (regenerates the airport list from OurAirports)
```

## Data sources and attribution

SkyDeck relies on free community data. Please be gentle with it and respect each provider's terms.

- **Aircraft positions:** [adsb.lol](https://adsb.lol) and [airplanes.live](https://airplanes.live). The [OpenSky Network](https://opensky-network.org) is deliberately not used: its terms limit the REST API to non-profit research and education, and require a written license for operational use in a live product
- **Routes:** the community route data published by adsb.lol
- **Airport weather, runways and elevation:** the [NOAA Aviation Weather Center](https://aviationweather.gov) data API, through a server proxy with a short cache. Its [usage notes](https://aviationweather.gov/data/api/) (read on 2026-11-08) ask for small, infrequent requests (at most 100 a minute) with a custom User-Agent, and do not allow cross-origin browser calls; they state no licence, attribution wording or commercial-use rule. It is US government data
- **Airport delays and closures:** the FAA [NAS Status](https://nasstatus.faa.gov) feed, through the same proxy. The site and its XML feed state no licence, rate limit or attribution wording (checked 2026-11-08; the pages it links to, such as the FAA privacy policy, refused an automated fetch and were not read). It is US government data
- **Digital ATIS:** [atis.info](https://atis.info) (datis.clowd.io redirects there), through the server proxy with a short cache. It documents its API but states no licence or terms (checked 2026-11-08), so treat it as a small third-party service
- **Airport charts:** only an outbound link to the FAA's own [terminal procedures search](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/); no chart is fetched or copied
- **Airports (reachable-airport list and map markers):** large and medium airports from [OurAirports](https://ourairports.com/data/) open data (Unlicense), filtered by `scripts/build-airports.mjs`
- **Map data:** OpenStreetMap contributors, served through [OpenFreeMap](https://openfreemap.org)
- **ACARS messages:** [Airframes](https://airframes.io), through its anonymous public API. Data provided by Airframes.io and its community of feeders. The API is still pre-release and its terms are still being finalized
- **Satellite imagery:** Esri, Vantor, Earthstar Geographics, and the GIS User Community
- **Terrain:** Mapzen / AWS Terrain Tiles

Each of these has its own licence and usage terms. Check them before deploying publicly or commercially.

The same credits, with the wording each source asks for, are shown in the app: open the Filters menu and choose "Credits and data sources" (also linked at the bottom of the message inspector). The list lives in `src/lib/credits.ts`, so update it when a source changes.

## Known limitations

- Free sources have no flight history, so a trail only shows the time you have been watching.
- Airport search covers about 114 major airports. The reachable-airports list uses a larger set (about 4,500 large and medium airports), so small airfields are missing and "none listed" does not mean none reachable.
- The glide ring and reachable airports are straight-line, still-air estimates that ignore terrain, wind and runway suitability. They are for education only.
- ACARS messages come from a pre-release third-party API: anonymous access, CORS and the rate limit (60 requests a minute per visitor) can change without notice. The messages are received by volunteers, can be incomplete or wrong, and may contain sensitive details. Nothing is stored. Whether and how you may receive, show or republish radio messages depends on your country, so check the law before deploying this publicly. This project is not legal advice.
- Some flights show "Route not available" because the free route lookup does not know every flight.
- Wide views still hit provider rate limits. The nearest three circles refresh every poll; farther circles refresh every other poll and keep their last positions. A cold view with nothing cached can come back empty until a provider answers.
- The in-memory cache, request sharing, pacing and back-off state live per server instance, so they behave differently on serverless hosting.
- The emergency-squawk banner has been tested automatically but rarely seen with live data.

## Roadmap

Done and planned:

- [x] Glide range ring and reachable airports (educational estimate only)
- [x] ADS-B message inspector for pasted raw frames
- [ ] ADS-B message inspector with live frames from your own receiver
- [x] ACARS messages for the selected aircraft (Airframes, on demand)
- [ ] ACARS browse page, and a viewer for your own decoder's output
- [ ] Airport pages with weather and crowd-sourced security wait times
- [ ] Replay, plain-English alerts and a watchlist
- [ ] Expanded aircraft silhouettes

## Development notes

- This project was started in Lovable and syncs with GitHub. If you still use Lovable, avoid force-pushing or rewriting pushed history, and keep the connected branch in a working state.
- The app name lives in one place: `src/config/brand.ts`.
- Pull requests are checked by GitHub Actions (`.github/workflows/ci.yml`: install, test, type check, lint, build). Run the same four commands locally before opening one.
- `GET /api/health` answers 200 while the server is running (for uptime checks). Browser errors that reach the root error boundary are written to the server log as `[client-error]` lines.
- Architecture rules for contributors and coding agents are in `AGENTS.md`. `CONTRIBUTING.md` explains how to set up, test and submit changes, `ARCHITECTURE.md` maps the code, and `CHANGELOG.md` lists changes. The phase plan is in `dev-plan.md`.

## Disclaimer

SkyDeck is for education and hobby use. It is **not** for navigation, flight planning, or any operational or safety purpose. Data may be delayed, incomplete or wrong.

## License

Released under the MIT License. See `LICENSE` for the full text.
