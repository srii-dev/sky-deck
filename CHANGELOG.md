# Changelog

All notable changes to SkyDeck. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project will use [Semantic Versioning](https://semver.org/) from the first release (see CONTRIBUTING.md, "Releases"). Nothing has been released yet, so everything below is under Unreleased.

## Unreleased

### Added

- Backend foundation, rest of Phase 18 (18d, 18e, 18g, 18h in part): optional email sign-in with sign-out and account deletion backed by a real Supabase project, a per-visitor rate limiter (used on the error-report endpoint), an AI service wrapper (fallback order, daily budgets, kill switch, cache, Gemini and Workers AI adapters; nothing calls it yet), and a data inventory in `DATA.md`.
- Smooth motion (Phase 20: 20a, 20b, 20c, 20d, 20h, 20j and part of 20g): aircraft are drawn a few seconds in the past and interpolated between real position reports, with an adaptive delay, fading ghosts for aircraft missing from the data, a trail and panel that match the drawn moment, a Smooth/Live setting and a simulated-feed test.
- Weather layers (Phase 7: 7a, 7b, 7c, 7e): precipitation radar with a past-frames timeline, echo tops, SIGMET/AIRMET polygons and pilot reports, with a details card. Lightning (7d) and winds aloft (7f) were not built.
- Airport pages, rest of Phase 4 (4d, 4e, 4g ATIS part, 4h, 4j): the likely runway now also uses aircraft lined up with a runway (falling back to the wind), the current digital ATIS text, a rule-based airport brief, a link to the FAA charts for US airports, and aprons, taxiway names and gate numbers on the map at high zoom. Credits and README now describe the aviationweather.gov and FAA usage notes as read, and credit atis.info.
- Airport pages: weather, FAA delays and closures, runways, a wind-based likely runway, nearby traffic counts, and nearby airports after "My location" (Phase 4 half 1: 4a, 4b, 4c, 4d, 4f).
- Live 3D flight map with aircraft panel, category icons, search, filters, altitude-coloured trails, units and emergency squawk alerts (Phase 1).
- Glide-range ring, reachable airports in the panel and on the map, about 4,500 airports loaded on demand, and a "nearest in range" line (Phases 2a to 2e, #2, #4 to #7).
- ADS-B message inspector for pasted Mode S frames, linked from the Filters menu (Phase 3a, #8, #9).
- On-demand ACARS messages for the selected aircraft from the public Airframes API (#10).
- Credits and data sources dialog (#14).
- Continuous integration on pull requests, `GET /api/health`, and browser error reports written to the server log (#19).
- Feature flags for shipping unfinished work switched off.
- Shareable links (the address holds the view, the selected aircraft and the basemap), a Link button, a My location button, saved views, and better search (ranked results, aircraft type, airline name, recent searches).
- A Layers menu (terrain, trail, 3D trail, glide ring; choices remembered), a distance and bearing ruler, a flight chart (altitude, speed, vertical rate) in the aircraft panel, and a full-screen button.
- A Settings dialog (units, map style, layer defaults, battery saver, keyboard-shortcut switch, a JSON download of the data kept in your browser, and a delete), single-key keyboard shortcuts with a help list, a skippable first-run guide, and an "About this aircraft" card with Unknown for missing details (Phase 22h, 22i, 22j, 22m).
- Download the selected aircraft's trail as CSV or GPX, built in the browser with a data credit (Phase 22l).
- Phone polish: a swipeable 40 px sheet handle, 40 px touch targets, a shorter HUD on phones, safe-area insets, a landscape layout, and a battery saver that refreshes every 15 s (Phase 22n).
- Dependabot configuration and a dependency audit step in CI.
- Server configuration module and `.env.example` for secrets, and a first database migration (profiles with row-level security), neither used by the app yet.

### Changed

- Zoomed-in views request fixed shared tiles; cached tiles are aged, and a busy provider is answered from a tile up to 30 s old (#17).
- Requests to each data provider are spaced out, and identical in-flight requests are shared (#3).
- The last good aircraft stay on screen for up to 2 minutes when every provider fails (#18).
- The route lookup answers with a one-hour browser cache header (#18).
- Dependencies updated to clear 27 of 28 known vulnerabilities, including zod 4 (server input validation) and vite 8.1.6.
- The status chip says "Loading" before the first response, and the search placeholder fits a 375 px screen (#15).

### Removed

- OpenSky Network as a data provider (its terms require a written licence for live use) (#13).

### Fixed

- A failed feed request no longer falls back to a cached result of any age; the limit is 30 s (#17).
- The Filters button no longer wraps to a second row while loading at 1280 px, and the map credit no longer runs over the altitude legend on phones (#15).
