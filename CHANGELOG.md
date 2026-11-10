# Changelog

All notable changes to SkyDeck. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project will use [Semantic Versioning](https://semver.org/) from the first release (see CONTRIBUTING.md, "Releases"). Nothing has been released yet, so everything below is under Unreleased.

## Unreleased

### Added

- Early post-release ideas (Phase 24b, 24d, 24f): colour aircraft by airline, a Day and night layer with sunrise and sunset, and an embeddable map (`embed=1`) with a copyable iframe snippet. A map image to share (24e) and the rest of Phase 24 were not built.
- Clean view (Phase 22k) on the K key and in Settings, a KML trail download and a CSV download of the aircraft shown (Phase 22l).
- Error reports for errors no boundary sees (Phase 21c): script errors in event handlers and timers and unhandled promise rejections are sent to the same server log line, at most five per page and without browser-extension and resize noise. The CI dependency audit now fails on high or critical advisories (Phase 21g).
- Refresh budget for the aircraft feed (Phase 19i): the server limits optional upstream refreshes per minute, keeping busy tiles fresh and answering quiet ones from a slightly older copy (never older than 60 s). Set with `FEED_BUDGET_PER_MIN` (default 90). A store shared between server instances (19h) was not built.
- Community pages (Phase 23a, 23b, 23c, 23d, 23f, 23g in part, 23h in part): Help and FAQ, What's new (from this changelog), a status page that asks the data providers, a press kit, issue templates behind a Feedback link, and written terms for feedback and a takedown process. A moderation page (23e) was not built.
- Final testing notes (Phase 17): `RELEASE.md` with the release checklist, the security review, failure drills, the accessibility check, a soft-launch and rollback plan and the known issues. Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) on server and static responses.
- Platform (Phase 16a, 16c, 16d, 16e): self-hosted fonts (no request to Google), an installable web app with a small service worker and an offline page, the map library split into its own file, and About, Privacy, Terms and Disclaimer pages (drafts). Cloudflare deployment (16b), end-to-end tests (16f) and a language setting (16g) were not built.
- Themes, header and footer, and search metadata (Phase 15c, 15d in part, 15g in part): a light theme and a Dark, Light or System choice in Settings, a header and footer on the inspector and not-found pages, `robots.txt` and `sitemap.xml`, canonical links when `SITE_URL` is set, and schema.org data on the map page. Removing Lovable (15a), the brand (15b), the landing page (15e), share images (15f) and the full design pass (15h) were not built.
- Flight facts (Phase 14a): a card in the aircraft panel with the phase, route length, progress along the route, time to the destination and heading against the destination. The airport brief (14b) already existed from Phase 4; AI insights (14c) were not built.
- Collection, achievements and daily challenges (Phase 13a, 13b, 13c): aircraft types and registrations you open are remembered in this browser, 13 achievements, three daily challenges and a Collection dialog behind a trophy button. Account sync and aircraft photos (13d) were not built.
- More aircraft silhouettes (Phase 12a): four-engine heavy, twin-engine heavy, rear-engine jet, turboprop and military jet shapes chosen from the type code, listed in the Aircraft types key. 3D aircraft models (12b) and 3D airports (12c) were not built.
- Track a flight (Phase 11a): add a flight number in the Watchlist and see its stage (at the gate, taxiing, taking off, climbing, cruising, descending, on approach, landing, arrived) on a seven step bar, with the route, a rough distance and time to go, and its last changes; notable changes raise an in-app alert. A route on file that does not fit where the aircraft is, is ignored and said so. Inbound aircraft (11b), gates and baggage (11c) and lock-screen updates (11d) were not built.
- Alert rules (Phase 10: 10b, 10c, 10d, 10e): rules on aircraft type, military flag, flight number, altitude, squawk, in the air and a circular area drawn on the map, created in plain English or by hand, checked on every update while the page is open. Web push when the tab is closed (10f) was not built.
- Session replay (Phase 9a): the page records the last 30 minutes of what it received and can play it back with a scrub bar and speeds. The 30-day replay (9b) and incident history (9c) were not built.
- Personal features (Phase 5): a watchlist of flights, aircraft and airports with in-app takeoff, landing and emergency alerts, recently viewed flights, account sync of both lists, a chase camera, skeleton loading states, reduced-motion support (map camera moves and CSS animations) and an accessibility check of the new controls.
- Backend foundation, rest of Phase 18 (18d, 18e, 18g, 18h in part): optional email sign-in with sign-out and account deletion backed by a real Supabase project, a per-visitor rate limiter (used on the error-report endpoint), an AI service wrapper (fallback order, daily budgets, kill switch, cache, Gemini and Workers AI adapters; nothing calls it yet), and a data inventory in `DATA.md`.
- Routes, terrain and airspace (Phase 8: 8a, 8b, 8d, and special use areas from 8c): a route line for the selected flight, a terrain profile along it, FAA Class B/C/D airspace and special use areas on the map with a click card. Temporary flight restrictions (8c) and filed-route waypoints (8e) were not built.
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

- The dark theme's destructive red is a little darker, so white text on it reaches 4.5:1 (it was 3.7:1).
- `public/robots.txt` is replaced by a `/robots.txt` route that also points at the sitemap and keeps crawlers off `/api/`.
- Zoomed-in views request fixed shared tiles; cached tiles are aged, and a busy provider is answered from a tile up to 30 s old (#17).
- Requests to each data provider are spaced out, and identical in-flight requests are shared (#3).
- The last good aircraft stay on screen for up to 2 minutes when every provider fails (#18).
- The route lookup answers with a one-hour browser cache header (#18).
- Dependencies updated to clear 27 of 28 known vulnerabilities, including zod 4 (server input validation) and vite 8.1.6.
- The status chip says "Loading" before the first response, and the search placeholder fits a 375 px screen (#15).

### Removed

- OpenSky Network as a data provider (its terms require a written licence for live use) (#13).

### Fixed

- The two `profiles` row-level security policies now call `auth.uid()` once per query instead of once per row (database advisor warning).
- Legal page titles no longer repeat the site name.
- A Cessna 172 or 177 was classified as a heavy jet (the C-17 pattern matched it) and drawn with the heavy jet icon.
- The tracked flights hook changed the length of a React dependency list when flights were added or removed.
- A failed feed request no longer falls back to a cached result of any age; the limit is 30 s (#17).
- The Filters button no longer wraps to a second row while loading at 1280 px, and the map credit no longer runs over the altitude legend on phones (#15).
