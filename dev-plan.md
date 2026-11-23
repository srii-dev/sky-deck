# SkyDeck dev plan

The full phase plan for SkyDeck, as of 2026-11-07. SkyDeck is meant to become Sri's own take on a full-featured flight tracker app, built for the web. It is independent: it uses its own name, code and visuals and is not affiliated with any commercial app. The README describes what exists today and `CHANGELOG.md` what was released.

## How to read this plan

**Status**

- **Done**: merged into `dev`.
- **Open**: planned for the first public release, not started.
- **Needs decision**: waiting on a choice from Sri (listed in "Decisions needed").
- **Post-release**: deliberately after the first public release (Phase 24 and later).
- **Not planned**: considered and left out.

**Three questions for every feature**, so a feature never depends on data we do not have:

1. What does the user see?
2. What data does it need, and where does it come from?
3. What does the user see when that data is missing?

**Source verification levels** used in the data-source table:

- **Tested**: I made one real request on 2026-11-07 and saw the result (status, format, CORS header).
- **Docs/search**: seen in official documentation or search results only. Not tested, and the terms were not read in full.
- **None found**: no free source was found.

Terms were not fully read for any source. Read each source's terms before building on it (as was done for OpenSky, airplanes.live and Airframes).

**Where the feature ideas come from.** The feature list for later phases comes from public descriptions of an iOS flight tracker app (its App Store listing, release notes and one partner video), gathered through research notes. These are advertised features, not tested ones, and none were verified by using that app.

## Ground rules

- Free only: no paid services. Free tiers are fine, but every feature must degrade gracefully when a free quota runs out.
- **A backend is now allowed** (the earlier "no backend, no keys" rule was dropped on 2026-11-07). Secrets live only in server-side environment variables, never in the repo, the browser bundle or the README. `.env` files stay out of git.
- Live ADS-B data goes through the server proxies. Airframes ACARS stays browser-direct and on demand until the legal review and the Airframes answer are in (see Phase 6).
- OpenSky is not a provider and stays out without a written licence.
- No new dependencies without asking. No edits to `src/components/ui/*`.
- Map overlays must be re-installed in the `style.load` handler.
- The stack stays React 19 + TypeScript (TanStack Start). The repo is already all `.ts` and `.tsx` (104 files, no plain JavaScript in `src`), so no conversion phase is needed.
- Phone, tablet and desktop must all work (check 1280, ~746 and 375 px).
- Educational and hobby use only: no navigation, flight planning or safety claims.
- AGENTS.md still carries the old no-backend wording and must be updated (with Sri's approval) when Phase 18 starts.

## Numbering note

The original plan had five phases: 1 live map, 2 glide and reach, 3 message inspector, 4 airports, 5 personal features. The ACARS card was later labelled "Phase 4a" in local plan files and PR history, which clashed with the original Phase 4 (airports). This plan keeps Phases 1 to 5 and moves ACARS to **Phase 6** (the built card is 6a; it was called "4a" before). Weather and the other feature areas continue from Phase 7. Because a backend is now allowed, **Phase 18** (backend foundation) is added and comes before the backend-dependent features. Foundation and operations phases added later also have numbers: 18 backend, 19 scale and data pipeline, 20 real-time experience, 21 operations, 22 app polish, 23 community and help. The number order is not the build order (see Remaining work).

## Research notes

Backend, free-AI and data-source research (2026-11-07) lives in [`SOURCES.md`](SOURCES.md). The Backend and AI choices are settled (see Decisions needed).

## Phase 0: Before any public launch (blockers)

Not features, but nothing is deployed until these are settled.

| Phase | Item | Status | What is needed |
| --- | --- | --- | --- |
| 0a | Esri satellite imagery terms. **Switch prepared (2026-11-16):** `VITE_FLAGS=-satellite` builds without Satellite (nothing from Esri). The decision is still the owner's. | Open | Read Esri's terms in a normal browser. Keep, use a free API key (now possible with a backend), swap the style, or drop Satellite. |
| 0b | airplanes.live returns 403 to our server | Open | Email the operator for approval, or accept adsb.lol as the only provider. |
| 0c | Airframes anonymous API | Open | Send the draft email (kept locally) and recheck anonymous access, CORS and limits. |
| 0d | ACARS legal review. **Switch prepared (2026-11-16):** `VITE_FLAGS=-acars` builds without the ACARS card (nothing from Airframes). The decision is still the owner's. | Open | Showing radio messages publicly touches 47 U.S.C. 605. Consult a lawyer before deploying. Not legal advice. |
| 0e | Self-host the two Google fonts | Done | Sri must approve the font downloads (names, source, size) first. |
| 0f | Credits wording | Open | Match each source's current terms once Esri and airplanes.live are decided. |
| 0g | Route data freshness | Checked | The hosted route file checked was about 7 weeks old and the upstream repo's last commit is a year old. Add a README note; treat "Route not available" as normal. |
| 0h | **Looked at in Phase 22 round 5:** on a cold development server the first page load fails server function calls (`Invalid server function ID`, 500s) until the plugin has compiled them, and aborted requests are logged when a page is reloaded mid-load; both are development-only. An `Uncaught (in promise) ReferenceError: document is not defined` appears once in that window and could not be traced. One real bug was found and fixed: a hydration warning from the theme script setting the colour scheme on `<html>` (Phase 15c). Cold-start console errors and Vite worker errors in dev | Open | Cause unknown; reproduce before fixing. |
| 0i | Server feed stale-cache quirk | Open | On failure the handler may return an older cached result with no age limit. |
| 0j | Cloudflare deployment | Open | Nothing is deployed; `bun run preview` does not work with the Cloudflare build. |
| 0k | AGENTS.md and README wording | Open | Replace the old no-backend and keyless rules once Phase 18 is approved (needs Sri's OK to edit AGENTS.md). |

## Phase 18: Backend foundation

New. Needed before 4k, 5g, 6f, 6h, 9b, 10f and any stored data.

| Phase | Work |
| --- | --- |
| 18a | Record the platform. **Done in 18 half 1 (docs):** Supabase for sign-in and data, Cloudflare for hosting, caching and AI, and MongoDB Atlas (free tier) later for the FAA NOTAM store written by the SWIM service (decision 2026-11-07); the picture is in `ARCHITECTURE.md` and the configuration rules in `CONTRIBUTING.md`. **Not done:** the wording in `AGENTS.md` and README that still describes the old no-backend rule needs the owner's approval; the proposed text is in local `docs/plan-18-half-1.md`. |
| 18b | Secrets and configuration. **Done in 18 half 1:** `src/lib/server-config.server.ts` (groups `supabase` and `gemini`; `requireConfig` names missing variables and never prints values; refuses to run if a secret-looking `VITE_` variable exists), `.env.example` (names only), and `.env` files are now git-ignored (they were not before). Nothing reads these yet; features call `requireConfig` when they are built. Not verified: that the `.server.ts` suffix keeps the file out of the browser bundle, and that `process.env` carries Cloudflare secrets on Workers (to check in 16b). |
| 18c | Database schema and migrations. **Done in 18 half 1 (not run):** `supabase/migrations/20261107000000_profiles.sql` (one `profiles` table with row-level security and a signup trigger), `supabase/README.md` (rules, how to apply, planned tables) and `src/test/migrations.test.ts` (every table must enable row-level security, no secrets in SQL). The SQL has never been run: no Supabase project or local Postgres was available. A local database or emulator needs the Supabase CLI and Docker, which are not installed. |
| 18d | **Done in Phase 18 (email only):** sign in, create account, sign out and delete account through the Account dialog (Settings), `@supabase/supabase-js`, session kept in this browser, friendly errors; account deletion is a database function. Tested end to end on the real project with a test user created in the database. **Not done:** Google sign-in (needs a Google Cloud OAuth client), the email confirmation link was not exercised (Auth Site URL must be set in the Supabase dashboard to the site address), password reset. |
| 18e | **Partly done in Phase 18:** a per-visitor sliding-window limiter (in memory per instance), used on the error-report endpoint (5 a minute per visitor, 20 per instance); size limits there already existed. A hide-or-delete tool for bad reports waits for the first user-written content (4k). Abuse protection: per-visitor rate limits on every write endpoint, input validation, size limits, a way to hide or delete bad reports. |
| 18f | **Shared feed cache done 2026-11-22:** the feed loader runs in one global `FeedHub` Durable Object (see 19h). **Not done:** scheduled jobs (Supabase keep-alive, nightly refresh) and the SWIM consumer. Shared cache and scheduled jobs (provider cache that survives across isolates, keep-alive for the free Supabase project that pauses, nightly data refresh). Fixes the "per server instance only" limit of pacing and caching. Also the SWIM consumer: a small always-on Node service that reads the FAA JMS queue and writes NOTAMs to **MongoDB Atlas (free tier, 512 MB; the Student Pack credit is not needed yet)**. Workers cannot be that long-lived consumer, so it needs somewhere free to run; none has been chosen or researched yet. Cloudflare Workers cannot use MongoDB's HTTP Data API (ended 2025-09-30) and the driver over TCP is unverified there, so the app reads NOTAMs through the service or a cache, not directly. |
| 18g | **Done in Phase 18 as a library, unused and not run against the real providers:** `src/lib/ai-service.ts` with fallback order, daily budgets, kill switch, cache, labelled output and Gemini and Workers AI adapters. Needs the Gemini key (server-side only) and the Cloudflare binding before use. |
| 18h | **Partly done in Phase 18:** `DATA.md` lists what is stored where, for how long and how to delete it; the public privacy page is Phase 16e. Privacy basics: what is stored, how long, how to delete it, written in the privacy page (Phase 16e). |
| 18i | **Not done:** seed users need either the service role key or SQL inserts into the auth schema; decide when the first feature needs sample data. Test accounts and seed data: a fixed set of test users, test reports and sample data for development and for each half-phase test pass, kept in the repo (no real data, no secrets). |

## Phase 19: Scale and data pipeline

New. The app works for one visitor. A public launch changes the load, and the free data providers have limits we do not control (adsb.lol publishes none, airplanes.live already blocks our server). This phase decides how many visitors the app can serve without being blocked.

| Phase | Work |
| --- | --- |
| 19a | Measure today's upstream request rate per visitor and per server instance, then estimate it for 10, 100 and 1,000 visitors. Write the result down before building. **Done 2026-11-07** (local report): a zoomed-in visitor makes one feed call every 7 s (measured, 0.14 calls/s); wide views average 4.5 circles per poll (computed); one server instance tops out near 2 requests/s (500 ms pacing), about 14 zoomed-in visitors; zoomed-in views barely share the server cache. |
| 19b | Central ingestion, per server instance. **Done in 19 half 1:** cache hits are aged (`ageMs`, `seenPos` shifted), a cached tile up to 30 s old is served when the first provider's queue is over 1.5 s, a failed fetch no longer falls back to a cache entry older than 30 s, and per-instance counters exist for the load test. The store shared across instances (KV or a Durable Object) waits for deployment: see 19h. |
| 19c | Tile-based coverage. **Done in 19 half 1:** views up to 40 nm use a 100 nm lattice (radius 75 nm), up to 90 nm a 200 nm lattice (radius 145 nm), mid-size views up to 250 nm one circle with a snapped centre and radius, and views over 250 nm keep the 350 nm lattice. Every visitor asks for the same tiles. |
| 19d | Provider strategy. **Done in 19 half 1 (documents only):** a written strategy and a draft email to the adsb.lol operator (Sri sends it). Open: the operator's answer, whether to run an own feeder, and whether airplanes.live ever becomes usable. A real 429 from adsb.lol was seen after about three requests in 1.2 s, so the 500 ms pacing gap may be too small; decide with the operator's answer, do not change it blindly. |
| 19e | Cache headers for static data. **Done in 19 half 2:** the route lookup answers with `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` (checked in a browser); an audit of every static or slow-changing fetch is in the half-phase report. Feed responses stay uncached on purpose. A CDN in front of the server functions is not assumed: whether Cloudflare caches Worker responses needs the deployment (16b). |
| 19f | Load model. **Done in 19 half 2** as a test (`src/test/feed-load.test.ts`): a seeded crowd of 10, 100 and 1,000 visitors runs through the real tile planner and the real server cache with a fake provider and clock. At 1,000 visitors the offered calls are about 2,600 per 7 s poll, and upstream calls are about 116 per poll (16.6 per second) over 125 distinct tiles, against about 750 distinct circles with one circle per visitor. No real provider is contacted. A real-network load test waits for the deployment. |
| 19g | Graceful overload. **Done in 19 half 2:** while every provider fails, the last good aircraft stay on screen for up to 2 minutes (the status chip shows the age and the map stops moving them after 40 s), then the list clears. Together with the 30 s cache fallback from half 1. |
| 19h | **Done 2026-11-22 for the feed:** a Durable Object (chosen by Sri over Workers Cache, which would also bill static files and needs opt-outs on every page) runs `loadFeedCached`, so the cache, pacing and refresh budget are the same for every instance. Checked in the local Workers runtime (one object, feed answers 200). Other caches stay per instance. Store shared across server instances (Cloudflare KV or a Durable Object) behind the same cache interface, so every isolate reads the same tiles and the same pacing budget. Needs the deployment from 16b to test. |
| 19i | **Done in Phase 19 (per server instance):** `src/lib/refresh-budget.ts` keeps a budget of optional upstream requests per minute (`FEED_BUDGET_PER_MIN`, default 90, 0 for no limit; a starting guess until the provider says what it allows). Below 60% of it every tile refreshes as before; as it fills up the busiest tiles keep refreshing and quiet tiles are answered from a copy up to 30 s old; once it is used up, copies up to 60 s old are served. Tiles with no copy and copies older than 60 s are always refreshed and are not counted, so the real rate is the budget plus about one request per tile a minute. In the crowd model (80 tiles, uneven demand, 5 minutes) the upstream rate fell from about 690 to about 120 a minute, busy tiles refreshed about every 20 s and quiet ones about every 50 s, and no copy older than 60 s was served. Not tested against a real provider; not shared between instances (19h). |

## Phase 20: Real-time experience

New. Goal: motion that looks continuous and live, like the commercial trackers: a few seconds of deliberate delay, but no gaps, jumps or aircraft that freeze and then snap.

Why it needs a deliberate delay: today the browser polls every 7 s and moves each aircraft forward by dead reckoning (speed and track), then corrects with an easing step when the next poll arrives. Extrapolating forward is a guess, so planes drift, snap or freeze when data is late. If the display instead shows the world a few seconds in the past, every point on screen sits between two real samples, so it can be interpolated and never guessed. The price is latency: the display runs about one and a half sample intervals behind the data. The sample interval is the lever: with 7 s polling the delay would be about 10 s, with a faster shared feed (Phase 19) it can drop to roughly 3 to 5 s. These numbers are targets to test, not measured. The data itself (receivers, aggregator, our provider) already carries some seconds of delay that we cannot remove, and no source is guaranteed to be gap-free.

| Phase | Work |
| --- | --- |
| 20a | **Done in Phase 20:** per-aircraft sample buffer (last 12 reports) with the report's true time (arrival minus its age). |
| 20b | **Done in Phase 20:** draws at now minus the delay by interpolating position, altitude, heading and speed; dead reckoning only past the newest report, capped at 30 s (not 'a few seconds': the real feed stalls for 25 s or more), then held and dimmed. |
| 20c | **Done in Phase 20:** delay from the 90th percentile of update gaps plus typical report age plus 1 s (4 to 25 s), default 10 s, changes at most 0.1 s per second; Settings has Smooth and Live (2 to 5 s). Measured on the real feed: it settled at about 15 s. |
| 20d | **Done in Phase 20:** an aircraft missing from the data stays and keeps moving, fades over the last 20 s and is removed after 60 s. The 'last seen' age is shown in the aircraft panel (queue item 6, 2026-11-16; not yet seen with live data). |
| 20e | Push instead of poll: the server sends changes to the browser as they arrive (server-sent events or a WebSocket through a Durable Object) from the shared tile cache, instead of every visitor polling. Cuts latency and requests; depends on 19b and 19c. |
| 20f | Change-only updates: send only aircraft that changed since the last update, with compact fields, to keep bandwidth small at faster refresh rates. |
| 20g | **Partly done in Phase 20:** the delay in use is shown in Settings and, as 'N s behind', in the status chip (queue item 6; not yet seen with live data). No browser/server clock offset is estimated (sample times use the browser clock and the provider's report age). Clock alignment: estimate the offset between browser and server clocks so timestamps compare correctly, and tell the user the current delay (for example "Live, 8 s behind") in the status chip. |
| 20h | **Done in Phase 20:** the trail stops at the drawn moment and the panel's position, altitude, speed, heading and vertical rate come from the drawn moment. The flight charts still use all samples. |
| 20i | Pan and zoom without holes: prefetch the tiles around the view and keep a short buffer for them, so moving the map does not show an empty area while data loads. |
| 20j | **Partly done in Phase 20:** a simulated feed test (jitter, dropped and late updates) counts jumps and freezes. A small read-only debug box (delay, drawn moment, feed age) shows only with the `labs` flag (queue item 6; not yet seen with live data). Tests and metrics: simulated feeds with jitter, dropped updates and late packets; count visible jumps, freezes and gaps; a small debug overlay with delay, buffer length and update age. |
| 20k | Reuse the buffer for session replay (9a) and for the 30-day replay design (9b). |

Rules to update when this lands: AGENTS.md says positions are dead-reckoned with an easing correction on each poll, and that polling cadence lives in `use-aircraft-feed.ts`. Both change (needs Sri's OK to edit AGENTS.md).

## Phase 21: Operations and developer workflow

New. Removing Lovable (15a) also removes its error reporting and editor tooling, and there are currently no automated checks on pull requests.

| Phase | Work |
| --- | --- |
| 21a | Continuous integration. **Done in 21 half 1:** `.github/workflows/ci.yml` runs install (frozen lockfile), test, type check, lint and build on every pull request and on pushes to `dev`. Its first run is the pull request that adds it. Actions are pinned by version tag only; pinning by commit hash comes with 21g. |
| 21b | **Still deferred:** needs the deployment (16b). Preview deployments per pull request and a staging environment. **Deferred:** needs the deployment from 16b (nothing is hosted yet). |
| 21c | **Phase 21 round 3:** `window` errors and unhandled promise rejections are now sent to the same `[client-error]` log line (boundary names `window-error` and `unhandled-rejection`), at most 5 per page load, without resize-loop, abort, cross-origin and browser-extension noise; seen working in the browser. Server-side errors beyond what `server.ts` logs, and removing the Lovable hook (15a), are still open. Error reporting that replaces `lovable-error-reporting.ts`. **Done in 21 half 1 (browser side):** errors that reach the root error boundary are sent to a server function that writes one `[client-error]` log line per report (sizes capped, query strings and fragments stripped, 20 reports a minute per instance, repeats of the same message skipped for 60 s in the browser). The platform's log view is the inbox, and nothing is stored by the app. The Lovable hook is still called until 15a removes it. Not done: global `window.onerror` and unhandled-rejection capture, and server-side errors beyond what `server.ts` already logs. |
| 21d | Logging, uptime checks and alerts. **Prepared (2026-11-16):** `scripts/uptime-check.mjs` and `.github/workflows/uptime.yml` (every 30 minutes, needs the repository variable `SITE_URL`; GitHub runs scheduled workflows only from the default branch, `main`, which now follows `dev`). Not seen running. **Started in 21 half 1:** `GET /api/health` returns 200 with a timestamp while the server runs, calls no provider and exposes no internal state, so an uptime checker can use it. Not done: the uptime checker itself and quota alarms (need the deployment and the free-tier dashboards, 16b and 18). |
| 21e | **Decision kept (2026-11-10): no analytics** at launch, so no consent banner and no extra third party; revisit only if the owner wants numbers. Privacy-friendly traffic analytics, or none. **Decision (proposal, 2026-11-07): none until Phase 17.** Reason: no analytics means no consent banner and no extra third party. If numbers are wanted at launch, evaluate a cookieless option then (for example Cloudflare Web Analytics; free and cookieless are NOT verified), with no personal data. |
| 21f | **Still deferred:** needs a decision on how backups are made for the Supabase project (what the free plan offers has not been checked) and a restore rehearsal. Database backups and a restore rehearsal. **Deferred:** needs the database from Phase 18. |
| 21g | **Round 3:** the CI audit step now fails the run on high or critical advisories (`bun audit --audit-level=high`, checked locally: it passes today and a moderate level would fail); the full report stays informational because one moderate advisory in a development tool (`minimatch` in `typescript-eslint`) is still open. Dependency updates. **Done in 21 half 2:** `.github/dependabot.yml` (weekly, grouped minor and patch pull requests against `dev`, for Bun and for GitHub Actions); the CI actions are pinned to commit hashes; CI prints a `bun audit` report that is informational for now. **Audit fix, done 2026-11-07 on `ide/audit-fix`:** of 28 known vulnerabilities, 27 are cleared (`bun audit fix` for 24, `vitest` 4.1.12 for 2, `zod` 4.6.6 for 1; `vite` pin 8.1.5 to 8.1.6). One moderate remains: `minimatch` 10.x inside `typescript-eslint` (development only; needs a `typescript-eslint` release that allows minimatch 11). Make the audit step blocking once it is clear. |
| 21h | Versioning, changelog and release process. **Done in 21 half 2:** `CHANGELOG.md` (Keep a Changelog, everything under Unreleased), and the release steps and versioning rule (0.x until launch, first tag `v0.1.0` at the soft launch) in `CONTRIBUTING.md`. No version tag or `package.json` version was changed. |
| 21i | Documentation for contributors. **Done in 21 half 2:** `CONTRIBUTING.md` (setup, the four checks, branches, the half-phase test pass, adding a data source safely, releases, dependencies) and `ARCHITECTURE.md`. A `CLAUDE.md` proposal is drafted in local `docs/claude-md-proposal.md` and is NOT added to the repository: it needs the owner's OK. |
| 21j | Feature flags. **Done in 21 half 2:** `src/lib/flags.ts` (defaults in code, then the build-time `VITE_FLAGS` list, then a tester's `skydeck.flags` list in the browser; `-name` turns a flag off) and the `useFlag` hook; one registered flag, `labs`, off by default. Server-side flags are not included yet. |
| 21k | **Done (queue item 8, PR 64, 2026-11-20):** `e2e/screens.spec.ts` screenshots every public page at 1280, 746 and 375 px in both themes (no sideways scroll, no page error, heading present) and CI keeps them as the `screenshots` artifact; there are no pixel baselines on purpose. |

## Phase 2f: Descent path

The original plan listed a descent path as the last slice of Phase 2. Its exact wording is not in the repo, so confirm the intent before scoping it.

- **Sees**: a projected descent line for the selected aircraft along its track.
- **Needs**: speed, track, vertical rate, terrain (all available).
- **Missing data**: show nothing, no guessing.
- Status: Open, scope to be confirmed. Still-air estimate only, same disclaimers as the glide ring.

## Phase 3: ADS-B message inspector

- **3a** Done. Not decoded yet and labelled as such: Gillham altitude, GNSS height, aircraft status (type code 28), target state (type code 29), Comm-B, ACAS. (Surface position and operational status were added in 3c.)
- **3b** Open, needs decision: feed the inspector from a receiver Sri owns (for example `dump1090` or `readsb` output). Plan only until receiver and format are chosen.
- **3c** **Partly done (2026-11-16):** surface position (type codes 5 to 8: movement, track, local and global CPR decoding with an optional reference position in the page) and operational status (type code 31: version, NIC supplement A, raw NACp and SIL). Tested against the three frames and values printed in chapter 4 of "The 1090 Megahertz Riddle" (published); the movement table is checked at every boundary and the operational status fields have synthetic tests only (the book gives the layout but no example frame). **Not done:** Gillham altitude, type code 28 and 29, GNSS height and the meaning of the NACp and SIL values: no bit layout or published example for them could be read, so none was written from memory. Open: decode the labelled gaps, each with tests against published frames.

## Phase 4: Airports

Reuses the OurAirports data from Phase 2. Sources are in the table above.

| Phase | Feature | Sees | Data | Backend? |
| --- | --- | --- | --- | --- |
| 4a | Airport pages | **Done in 4 half 1 (without local time, which has no timezone source, and without runways drawn on the map):** panel opened from search with name, codes, elevation, runways and traffic counts. Page per airport, found by IATA or ICAO code: name, local time, elevation, runways on the map, nearby traffic count, arrivals and departures inferred from tracked aircraft | OurAirports, ADS-B feed | No |
| 4b | Airport weather | **Done in 4 half 1:** METAR, TAF and flight-category badge through a server proxy. Current METAR, TAF, flight-category badge | aviationweather.gov through a server proxy with a short cache | No |
| 4c | Nearby airports | **Done in 4 half 1:** list of the nearest airports shown after "My location" (the position is not sent anywhere). List near the user's location, only if they allow it | OurAirports + browser geolocation | No |
| 4d | Active runway | **Done in Phase 4 (wind plus aircraft):** the likely runway ends combine the METAR wind with aircraft in the current feed that are low, lined up with a runway and on its centreline (descending = arrival, climbing = departure, fast on the ground = roll); with too little traffic it falls back to the wind alone. Uses one snapshot of positions, not a stored history; air traffic control decides. Which runways are in use, inferred from recent arrivals and departures and METAR wind | ADS-B tracks + METAR | No |
| 4e | Airport map detail | **Done in Phase 4 (aprons, taxiway names and gate numbers; no separate terminal layer):** checked the OpenFreeMap tiles first: the aeroway layer has runway, taxiway (with names), apron, aerodrome and gate (with numbers); Dark and Light already draw runways and taxiways, so aprons, taxiway names and gates are added at high zoom on every basemap. Terminals are not a class in the tiles (plain buildings, already shown by 3D buildings), and there are no signs. Gates, taxiways, terminal buildings and signs for major airports | OpenStreetMap aeroway data (check the OpenFreeMap schema first) | No |
| 4f | FAA delays and ground stops | **Done in 4 half 1:** delay, ground delay program and closure entries for the airport. Status banner on the airport page | FAA NAS Status XML, server proxy | No |
| 4g | D-ATIS and NOTAMs | **D-ATIS done in Phase 4 (NOTAMs not done: they need Phase 18b and 18f):** current ATIS text from atis.info through a separate server call, with its own cache. Current ATIS text; NOTAMs with severity colours and plain-English wording | atis.info; NOTAMs from the FAA SWIM feed (stored by the consumer in 18f) | Yes (Phase 18b, 18f) |
| 4h | Airport charts | **Done in Phase 4:** outbound link to the FAA chart search for US airports (cycle computed, nothing fetched). Link to US airport and approach charts | FAA d-TPP | No |
| 4i | Airport cameras | Embedded live camera streams | Curated YouTube list | No |
| 4j | Airport brief | **Done in Phase 4 (rule-based part):** a few fixed-template sentences from weather category, FAA status, ATIS, runway guess and traffic. Short text combining weather, delays, ATIS and traffic | Rule-based from 4a to 4g (AI version in 14c) | No |
| 4k | Security wait times | Per checkpoint, a wait for each lane type: Regular, PreCheck, Touchless ID and CLEAR+. A "Report your wait" form (checkpoint, lane type, minutes), the average of the last 60 minutes per lane, a busy-hours chart, and a "not enough data" state per lane. Only lane types that have reports are shown for a checkpoint | Crowd-sourced reports (no official feed found) | Yes (Phase 18, Supabase). Never show invented numbers; mark fallback figures "Estimated". Reports need sign-in or per-visitor rate limits (18e) and a way to hide bad ones. |

## Phase 5: Personal features and polish

| Phase | Feature | Backend? |
| --- | --- | --- |
| 5a | **Done in Phase 5:** a Watch button for the airframe and for the flight number in the aircraft panel and one for airports in the airport panel; a Watchlist dialog (star in the map tools) with live status; up to 50 items, kept in this browser. | No |
| 5b | **Done in Phase 5:** in-app messages for takeoff, landing and emergency squawk of watched items and for movements within 6 nm of a watched airport, only while the page is open, only in the area the map loaded; a takeoff or landing needs the new state in two updates in a row; one alert per item and kind every 10 minutes; a switch in the dialog. No browser notifications and nothing in the background. | No |
| 5c | **Done in Phase 5:** the 15 most recently viewed flights, in the Watchlist dialog. | No |
| 5d | **Done in Phase 5 (basic):** a Chase camera switch next to Follow: the map tilts to 68 degrees, zooms in to at least 12 and turns smoothly to the aircraft's heading. There is no camera offset behind the aircraft and no terrain-aware height. | No |
| 5e | **Partly done in Phase 5:** skeleton placeholders for airport data and the terrain profile, and a retry button on the terrain profile. The rest of the loading, error and rate-limit states already existed (busy feed notice, airport and weather retry). Loading skeletons, error and rate-limit states | No |
| 5f | **More done (queue item 8, PR 64):** `e2e/a11y.spec.ts` checks names, labels, ids and tab order on every page, tabs through each text page, opens the map dialogs and popovers with the keyboard, and measures text contrast in both themes; it found that dialogs lost focus on close (fixed with `src/lib/return-focus.ts`). A screen reader pass still needs a person. Earlier notes: **Partly done in Phase 5:** an automated check of the page with the aircraft panel and dialogs open found no unnamed controls, duplicate ids or positive tab indexes; map camera moves no longer force animation for visitors who prefer reduced motion and a global reduced-motion rule stops pulsing and flashing effects; one small toggle enlarged. Not done: a screen-reader walk-through, a colour contrast measurement, a keyboard-only pass of every dialog; the switches are 36 by 20 px (shadcn default, their labels are the click target). Accessibility pass (keyboard, focus, contrast, screen reader labels, reduced motion) | No |
| 5g | **Done in Phase 5:** the watchlist and recent flights sync to the signed-in user's account (two tables with row-level security and limits); on sign-in both lists are united once, then every change is written to both; a failed save leaves the list on the device and shows a note. Tested end to end on the real project. A removal made on another device while signed out comes back (a union cannot tell removed from never had). | Yes (Phase 18d) |

## Phase 6: Pilot messages (ACARS)

Today: an on-demand card in the aircraft panel (6a) and, since 2026-11-22, the ACARS panel for all aircraft with AI headlines (6b, 6f). Until the legal review and the Airframes answer are in, the guardrails stay: browser-direct, plain text, attributed, nothing stored, no real message text in the repo, tests or docs. Message text may pass through the server to the AI providers (decision 2026-11-22, AGENTS.md).

| Phase | Feature | Notes |
| --- | --- | --- |
| 6a | ACARS card in the panel | Done. |
| 6b | **Done 2026-11-22 (PR #77), as a panel, not a page:** the latest 100 messages from all aircraft every ~16 s while the panel is open, up to 300 kept, All / Interesting / Breaking filters. The Airframes answer (0c) and the legal review (0d) are still open. Browse page | Recent Airframes messages, filter by label and text, same on-demand guardrails. |
| 6c | **Round 5 check:** `airframesio/acars-message-documentation` has no licence and says its documentation is still pending, with only about ten label descriptions, so nothing was copied; permission or a licence from its maintainers is needed first. **Partly done in Phase 6:** each message has an Explain this message section that lists the standard aviation abbreviations found in it as whole capital words (about 30, for example ETA, RWY, PAX), tagged "Explained by SkyDeck rules, not by AI". Label codes are NOT explained: no verified list of label meanings was found (the sources checked, the decoder repository and libacars, have no table in what was read), so none was invented. The documentation repository `airframesio/acars-message-documentation` is the next place to look once its licence is confirmed. Plain-English decoding by rules | A dictionary of message labels and common abbreviations, tagged "explained by SkyDeck rules". No AI. |
| 6d | **Done in Phase 6 except the report button:** the original text is labelled Original received message (monospaced, as received, with a Copy button), next to an Explain this message section; metadata the data did not carry is shown as unavailable, and empty or cut messages are marked partial. Not built: the report a wrong summary button. Seen only in component tests with invented text, not on a live message. | Expandable "Original received message" (monospaced, exactly as received, copyable) next to the explanation. Metadata fields shown separately and marked "unavailable" when missing. Partial or undecodable messages marked as such. A "report a wrong summary" button once Phase 18 exists. |
| 6e | **Not built:** needs a VHF receiver and a decoder output format check. Own receiver | Viewer for the output of a decoder Sri runs (`acarsdec` or `dumpvdl2`). Needs a VHF receiver. |
| 6f | **Done 2026-11-22 (PR #77):** one-line AI headlines for every message in batches of 8 (emergency, caution and weather first), and on opening a message a longer story plus a downloadable Markdown report. Workers AI (Llama 4 Scout) first, Gemini fallback, rate limited per visitor, cached per instance, nothing stored. Not cached in a database, and no daily cap visible to users yet. The legal review is still open. AI summaries | Uses the free AI plan in "Backend and AI options" (on demand, cached, daily cap, labelled "AI-generated", original always available). Needs Phase 18g and the ACARS legal review. |
| 6g | **Not built:** needs stored messages or web push (10f). Message notifications | Notification levels (All, Interesting, Breaking) for watched aircraft. Depends on 5b. |
| 6h | **Not built:** needs stored messages; waits for the Airframes answer and the legal review. Message history and flight-day search | Needs stored messages. A backend now exists, but storing and republishing messages still needs the Airframes answer and the legal review. |
| 6i | **Changed 2026-11-22:** Sri asked for alert colours, so SkyDeck now sorts messages itself by fixed text rules (`src/lib/acars-alert.ts`: emergency, caution, weather/ATC, position, routine; red also for a live 7500/7600/7700 squawk). The Airframes category fields are still unchecked. Source-provided message categories | Original decision on 2026-11-07 (replaced): SkyDeck does not invent its own "drama" or "interesting" feed. If the API supplies a category or flag (for example diversion, medical, maintenance), SkyDeck shows it as supplied, with the original message and the legal notes. |

## Phase 7: Aviation weather layers

All are map overlays that must survive a basemap switch.

| Phase | Feature | Source (see table) |
| --- | --- | --- |
| 7a | **Done in Phase 7:** RainViewer radar tiles, personal and educational use, attribution link shown with the timeline. The NOAA MRMS fallback was not built. | RainViewer (tested); NOAA MRMS WMS as US fallback |
| 7b | **Done in Phase 7:** play, pause and scrub over the past frames (about 2 hours); RainViewer sent no forecast frames, so none are shown. | RainViewer past frames only |
| 7c | **Done in Phase 7 (US only, current frame only):** Iowa Mesonet NEXRAD echo-top WMS layer. The Mesonet disclaimer was not read in full. | Iowa State Mesonet WMS (US) |
| 7d | **Not built:** Blitzortung is not allowed without permission and GOES GLM needs a processing job. Lightning, coloured by age | Blitzortung is not allowed without permission; GOES GLM needs a processing job. Stretch goal |
| 7e | **Done in Phase 7:** US and international SIGMETs, G-AIRMET (the slot nearest to now; line features such as freezing-level lines are not drawn) and PIREPs (last 2 hours, view limited to 30 degrees), with a click card. | aviationweather.gov (tested) |
| 7f | **Not built:** the aviationweather.gov wind/temperature product answers that it was discontinued with the retirement of the NAM model (checked 2026-11-08). Needs another source. Winds aloft | aviationweather.gov wind and temperature product (endpoint to confirm) |

## Phase 8: Routes, terrain and airspace

| Phase | Feature | Notes |
| --- | --- | --- |
| 8a | **Done in Phase 8:** a dashed great-circle line between the origin and destination from the route lookup, with airport labels, switchable in Layers (on by default for the selected flight); labelled approximate because the real path is not known. | Origin and destination from the existing route lookup; great-circle line labelled as an approximation. |
| 8b | **Done in Phase 8:** a terrain profile card in the aircraft panel along the straight route line (60 samples from the AWS Terrarium tiles at zoom 7, coarse), with the aircraft's position and altitude in text; the chart is scaled to the terrain. The track-based profile and the PIREP overlay were not done. | Elevation along the track and the route using the AWS terrain tiles we already load. PIREP overlay after 7e. |
| 8c | **Not built as TFRs:** the only related FAA layer (`National_Defense_Airspace_TFR_Areas`) has 8 standing areas, not the daily TFRs. **Special use areas (restricted, prohibited, warning, alert, MOA) are shown instead** from `Special_Use_Airspace`, with their times of use as text; whether an area is active now is not known. Temporary flight restriction polygons | No keyless feed found (see table). Options: NOTAM access (4g) or scraping tfr.faa.gov after reading its terms. Educational, not for planning. |
| 8d | **Done in Phase 8, with a different layer than planned:** `Boundary_Airspace` holds ARTCC boundaries and special rules, not Class B/C/D; the right layer is `Class_Airspace` (Class B, C, D with floor and ceiling). Queried per rounded 1 degree box (6 degrees at most), simplified, cached 12 hours on the server. The FAA service allows only 6,000 request units a minute to all callers together (an HTTP 429 was seen during testing). | FAA ArcGIS `Boundary_Airspace` (tested), cached. |
| 8e | **Not built:** no free source found. Filed-route waypoints | No free source found; likely stays unbuilt. |

## Phase 9: History and replay

| Phase | Feature | Notes |
| --- | --- | --- |
| 9a | Session replay | **Done in Phase 9:** the page records every aircraft update for about 30 minutes (up to 150,000 reports, in memory) and replays it: a History button in the map tools, a replay bar with play, pause, scrub, 1x/4x/16x/60x and Back to live; aircraft are interpolated between recorded reports and the selected aircraft's trail follows the clock. The aircraft panel is hidden during a replay. The same sample idea as Phase 20, kept longer. Replay what the browser has recorded since the page opened. No backend. |
| 9b | 30-day flight replay | **Not built:** needs positions stored for 30 days. Our own recorder needs an always-on job and storage (not available before deployment, Phase 16b, and the shared store 18f); adsb.lol's historical dumps are large and under the ODbL (terms and size not checked). Needs stored positions: either our own recorder (backend, storage limits) or adsb.lol historical dumps (ODbL, large). Needs Phase 18 and a storage plan. |
| 9c | Aircraft incident history | **Not built:** NTSB's site answers (the CAROL data site redirects, the aviation query page loads) but its terms and a way to look up accidents by registration were not read or tried; documented events only, never a safety rating. Per-airframe past incidents with date, description and source, from NTSB data (US only) once its terms are confirmed. Documented events, never a safety rating. |

## Phase 10: Alerts

| Phase | Feature | Backend? |
| --- | --- | --- |
| 10a | Emergency squawk banner | Done in Phase 1. |
| 10b | **Done in Phase 10:** rules with aircraft type, military flag, flight number prefix, altitude range, squawk, in the air or on the ground and an area, checked on every aircraft update while the page is open; an alert when an aircraft starts matching (the first pass only learns, so a new rule never floods), 30 minute cooldown per aircraft and rule, at most 3 messages per rule per update; up to 20 rules; the dialog shows how many aircraft match now. Rules are kept in this browser, not synced to the account. | No (tab open) |
| 10c | **Done in Phase 10:** areas are circles drawn on the map with two clicks (centre, then a point on the edge, 1 to 500 nm) or named by an airport or city in plain English; they are shown as dashed circles. Polygons are not supported. | No |
| 10d | **Done in Phase 10:** a Military condition uses the feed's military flag (readsb dbFlags bit 1, already part of the aircraft data since Phase 22). Only the military flag is used, never the privacy flags. | No (add `dbFlags` to the feed schema first) |
| 10e | **Done in Phase 10 as a keyword parser, not AI:** understands heavy/narrowbody/business jet/light/helicopter/glider/balloon/drone, military, below/above/between altitudes (5,000, 5k, FL350), callsign/flight prefixes, squawk codes and emergency/hijack, in the air or on the ground, and within N nm/miles/km of an airport code or city; says what it understood and what it ignored, and refuses places it cannot find. An AI version can use the same result shape later. | A small rule parser first; an AI version uses the free AI plan (Phase 18g) |
| 10f | **Not built:** web push when the tab is closed needs a backend job that checks rules on a schedule and push subscriptions (Phase 18f, deployment). Notifications when the tab is closed (web push) | Yes (Phase 18, scheduled checks) |

## Phase 11: My flights

| Phase | Feature | Notes |
| --- | --- | --- |
| 11a | Track a flight in progress | **Done in Phase 11:** a Track a flight box in the Watchlist; the stage (gate, taxi, takeoff, climb, cruise, descent, approach, landing, taxi in, at the gate) is inferred from altitude, vertical rate, speed and distance to the route's airports, shown on a seven step bar with route, straight line distance and a rough time to go; stage changes are remembered in this browser and raise in-app alerts. Only works while the aircraft is in the area the map has loaded. A route on file that is far from the aircraft is ignored (route data can be weeks old). |
| 11b | Inbound aircraft | **Not built:** needs schedule data; free tiers are too small. Post-release unless a source appears. |
| 11c | Clearance, gates, baggage claim | **Not built:** no free source found. Not available. |
| 11d | Lock-screen style updates | **Not built:** iOS Live Activities have no web equivalent. A web push version needs 10f. |

## Phase 12: 3D and visuals

| Phase | Feature | Notes |
| --- | --- | --- |
| 12a | Expanded aircraft silhouettes | **Done in Phase 12:** shapes for four-engine heavy, twin-engine heavy (the old heavy icon had four engines), rear-engine jet, turboprop and military jet, chosen from the type code in `aircraft-shape.ts`; the category (`kind`) is unchanged, so colours, alerts and panels are unaffected. Not drawn: tri-jets, seaplanes, per-airline or per-model outlines (about 13 shapes in all). |
| 12b | 3D aircraft models | **Not built:** MapLibre cannot draw glTF models by itself; it needs a 3D layer library (three.js or deck.gl, not approved as a dependency) and model files whose licence has to be checked first. Generic models by category; check the licence of any model asset. |
| 12c | 3D airports | **Not built:** the tiles have no 3D airport data (terminals are plain buildings, already shown by the 3D buildings layer), so this would need modelled airports from a source whose licence is checked. Builds on 4e and the existing 3D buildings. |

## Phase 13: Collection and gamification

Browser-local until sign-in (5g) exists, then synced.

| Phase | Feature |
| --- | --- |
| 13a | **Done in Phase 13:** every type and registration opened on the map is remembered in this browser (up to 600 types and 3,000 registrations), with first time, times opened and the icon shape; a trophy button opens the Collection. Not synced to the account yet (that needs a table and a migration). |
| 13b | **Done in Phase 13:** 13 achievements (5, 25 and 100 types; 10, 50 and 250 registrations; helicopter, glider, heavy jet, four-engine heavy, turboprop plus rear-engine jet, military, one of each main category), worked out from the collection with a progress bar and a message when one unlocks. |
| 13c | **Done in Phase 13:** three daily challenges, the same for everyone on the same date, rotating through eight (including "find a helicopter, a glider and a heavy jet"); progress counts what was opened today. |
| 13d | **Round 5 check:** the Planespotters terms could not be read (the contact page refuses automated requests and the API root has none); Sri needs to read them in a browser and say whether thumbnails with a link to the photographer are allowed. **Not built:** the Planespotters terms were not read, and hotlinking third-party photos needs attribution and a licence check first. Aircraft photos on collected aircraft (Planespotters API, after reading its terms) |

## Phase 14: Insights

Rule-based first; the AI versions use the free AI plan.

| Phase | Feature |
| --- | --- |
| 14a | **Done in Phase 14:** a Flight facts card in the aircraft panel: phase (the Phase 11 stage rules), route length, how far along it is, time to the destination with the clock time it implies, and whether the nose points at the destination. A route that does not fit where the aircraft is, is ignored and said so. Estimates from the broadcast position and a straight line, without winds or air traffic control. |
| 14b | **Already done in Phase 4 (4j):** the airport panel's rule-based brief from weather, FAA status, ATIS, runway guess and traffic. Nothing new was needed. Airport brief (see 4j) |
| 14c | **Not built:** needs a configured AI provider key on the server (Gemini or Workers AI, Phase 18g); none is set, and nothing in the page calls the AI service wrapper yet. AI insights: per-flight and airport briefs, on demand, cached, labelled |

## Phase 22: App polish and everyday features

Features that every flight tracker is expected to have and that the first list missed.

| Phase | Feature | Notes |
| --- | --- | --- |
| 22a | Shareable links | **Done in 22 half 1:** the address holds lat, lon, zoom, pitch, bearing, the selected aircraft (`hex`) and the basemap (`base`); it updates 0.5 s after each change (`history.replaceState`), a link opens the same view and selects the aircraft, and the Link button copies it. A shared basemap also becomes this browser's remembered basemap (known small side effect). Shown in a toast when the clipboard is blocked. |
| 22b | **Round 4 note:** the weather, airspace and route layers are in the Layers popover (Phases 7 and 8). Layer panel | **Done in 22 half 2:** a Layers popover in the map tools column with switches for terrain and buildings, the aircraft trail, the 3D trail and the glide ring (needs a selected aircraft); terrain, trail and 3D trail are remembered in this browser. The existing HUD buttons stay and share the same state. Airports, weather and airspace are not layers yet (those layers do not exist). |
| 22c | My location | **Done in 22 half 1:** a button asks the browser for the position, moves the map there and keeps nothing. The blocked-permission message was seen in the browser pane; the success path was not. |
| 22d | **Round 5:** with the ruler on and an aircraft selected, a Start at the selected aircraft button in the ruler bar sets the first point at it (unit tested; the button itself was not clicked in the browser). Distance and bearing ruler | **Done in 22 half 2:** a Ruler button: click two points on the map, a dashed line is drawn and the readout shows great-circle distance (in the chosen units) and bearing; a third click starts again, Clear removes it. The line is re-installed after a basemap change like the other overlays. Not done: measuring from the selected aircraft. |
| 22e | Saved views | **Done in 22 half 1:** named views (up to 20) in this browser: save, go to, delete. Cloud sync waits for sign-in (18d). |
| 22f | Per-flight charts | **Done in 22 half 2:** a Flight chart card in the aircraft panel with altitude, ground speed and vertical rate lines (range and time span shown) built from the positions this browser has seen since the page opened; it starts empty. Stored history waits for Phase 9. |
| 22g | Search upgrades | **Done in 22 half 1:** results are ranked (exact, prefix, type, airline name, contains) over callsign, registration, hex, aircraft type and operator, and the last 5 searches are offered when the box is empty. Airline-name search only works where the provider supplies an operator name, which is often missing; a callsign prefix (the 3-letter airline code) works for most flights. |
| 22h | Aircraft details upgrades | **Done in Phase 22 part 3:** an "About this aircraft" card in the aircraft panel shows type description, operator, age (from the feed's year of manufacture) and emitter category, with "Unknown" for anything missing, and a military flag when the feed's database sets it. The values come from fields the live feed already carries (desc, ownOp, year, dbFlags); the operator falls back to the callsign prefix. Not done: a separate open aircraft database. That would be a new data source, so it waits for its own review. adsb.lol records carry none of these fields, so most aircraft show Unknown until such a source exists. |
| 22i | **Round 5:** Settings, Messages while the page is open has four switches (watched items, tracked flights, alert rules, achievements), kept in this browser; they are in-page messages only. Language is still not built. **Round 4 note:** reduced motion is read since Phase 5f, and a Theme choice since Phase 15c; language and notification choices are still not built. Settings page | **Done in Phase 22 part 3:** a Settings dialog (gear button in the map tools column) with units, map style, layer defaults, a battery saver, a switch for keyboard shortcuts, links to the quick guide, the shortcut list and Credits, a JSON download of the data kept in this browser, and a two-step delete that resets everything and reloads. Not done: language (nothing is translated yet; planned in 16g), reduced motion (the app does not read the system setting yet), notification choices (nothing sends notifications), and a separate remembered-view switch (the delete removes the remembered position). |
| 22j | Keyboard shortcuts | **Done in Phase 22 part 3:** / focuses search, N and P select the next and previous aircraft (callsign order, among the aircraft shown), Esc closes the ruler, then the aircraft, then the airport, T, R, 3 and G toggle terrain, the trail, the 3D trail and the glide ring, M starts the ruler, a comma opens Settings and ? opens the shortcut list. Shortcuts pause while typing in a box or while a dialog is open, never use the arrow keys or + and -, and can be switched off in Settings. |
| 22k | **Clean view done in Phase 22 round 4:** press K, or Settings, Clean view for a display, hides the header, tools, legends, bottom bars and panels and keeps the map, the credit, zoom buttons and emergency alerts; Esc, K or a faint Exit button at the bottom leaves it (the button works even when shortcuts are switched off). Seen working in the browser. Fullscreen and kiosk mode | **Fullscreen done in 22 half 2:** a button using the browser's full-screen mode. A clean kiosk view that hides the HUD is not done. |
| 22l | **KML and aircraft list done in Phase 22 round 4:** the trail card has a KML button (one line, altitude in metres above sea level, for Google Earth), and the Filters panel has Download the N aircraft shown (CSV) with the data credit; text cells from the feed are quoted and made formula-safe for spreadsheets, and the list stops at 5,000 rows. The list was checked in the browser (420 aircraft); the KML file only in tests. Data export | **Done in Phase 22 part 3:** the aircraft panel has a Download trail card (CSV or GPX) built in the browser from the positions collected since the page opened, with a data credit in the file; Settings downloads saved views, recent searches and settings as JSON and deletes them. Not done: KML, and exporting a list of aircraft. |
| 22m | First-run guide | **Done in Phase 22 part 3:** a five-step skippable guide opens once on a first visit (not over a shared link) and can be reopened from Settings. Whether it was seen is one yes/no in this browser; nothing is tracked. |
| 22n | Phone behaviour | **Done in Phase 22 part 3:** the bottom-sheet handle is a 40 px touch target and opens or closes the details on a swipe; HUD buttons and the map zoom buttons are 40 px on touch screens; the units switch moves into Settings on phones (the HUD drops from 221 px to 169 px at 375 px wide); HUD, tools and legend respect display cut-outs (safe-area insets); in landscape the HUD wraps to two rows, the tools column wraps and the type legend hides; a battery saver refreshes aircraft every 15 s instead of 7 s. Not done: other touch gestures (the map keeps MapLibre's own) and orientation-specific layouts beyond the above. |

## Phase 23: Community, help and moderation

| Phase | Feature | Notes |
| --- | --- | --- |
| 23a | **Done in Phase 23:** a Help and FAQ page (how to read the map, where the data comes from, the limits, common questions) at `/help`. | How to read the map, what the data sources are, what the limits are. |
| 23b | **Done in Phase 23 as a link, not a form:** Feedback in the footer opens the project's GitHub issues page with a bug report and a feedback template. GitHub gives the spam protection and the owner's inbox; a visitor needs a free GitHub account. A form on our own server would need a table, a rate limit and a place to read it, and was not built. | A simple form or link, with spam protection, and an inbox the owner can read. |
| 23c | **Done in Phase 23:** `/whats-new` is built from `CHANGELOG.md` when the app is built, so the changelog stays the one place the history is written. | Built from the changelog (21h). |
| 23d | **Done in Phase 23:** `/status` asks the aircraft sources, weather, FAA status and airspace, and accounts, from the server at most once a minute, and says working, slow, refused, not answering, not set up or not used. It shows airplanes.live as refused (HTTP 403), which is true. It does not keep history and sends no alerts. | A page showing whether data providers, the feed and AI are working, based on 21d. |
| 23e | **Not built:** there is no user content to moderate yet (no wait reports, no feedback on our server). Moderation tools | A small private page for the owner to hide or delete crowd-sourced security wait reports and message feedback, and to see abuse counts. |
| 23f | **Done in Phase 23 (draft):** the Terms page says what visitors can send (feedback through GitHub), how it is used and how to ask for removal. To be read by Sri. | What users may submit (wait reports, feedback), how it is used, and how to ask for removal. |
| 23g | **Partly done in Phase 23 (draft):** the written complaints and takedown process is on the Terms page. The working private contact address is still missing; today it is the GitHub issues page. Needs Sri. Takedown and contact process | A working contact address and a written process for complaints (needed for ACARS and credits). |
| 23h | **Partly done in Phase 23:** `/press` has a one-sentence and a paragraph description, key facts, colours, the app icon files and the credit lines. No screenshots or wordmark file yet. Press and about kit | Short description, screenshots, logo files and attribution wording. |

## Phase 15: Independence, brand and landing page

Near the end, before final testing. Design work for the release: removing Lovable, identity, themes, header, footer and a landing page.

| Phase | Feature |
| --- | --- |
| 15a | **Done in code (2026-11-16):** `vite.config.ts` is now a plain config (Tailwind, tsconfig paths, TanStack Start with import protection, Nitro with the `cloudflare-module` preset, React, `VITE_` variables defined for server code, lightningcss, the `@` alias, React de-duplication, dev port 8080), the Lovable package is gone (`lightningcss` is now a direct dependency), `src/lib/lovable-error-reporting.ts`, `.lovable/`, the `bunfig.toml` exceptions, the `AGENTS.md` block and the README note are removed. The production build has the same 136 files, the same size and the same `wrangler.json` as before. **Not done (the owner):** disconnect the project in Lovable and remove the Lovable GitHub app from the repository. |
| 15b | **Not built (needs Sri):** the name and domain (Decision 7) are not settled, so the SkyDeck name stays; the header uses a plain plane mark. Brand identity: name and domain check (Decision 7), logo mark and wordmark, favicon and app icons, colour palette and type, a short brand note in the repo. Fonts must be the self-hosted ones from 16a. |
| 15c | **Done in Phase 15 (without the high-contrast mode):** a light theme beside the dark one, picked in Settings as Dark, Light or System (dark is the default; the choice is kept in `skydeck:theme`), applied before the first paint so there is no flash; every colour is a variable in `styles.css`; a test checks the text and background pairs of both themes against WCAG AA (it found the dark theme's red button text at 3.7:1, so that red was darkened a little). The map style stays a separate choice. A separate high-contrast mode and the toast and map-icon colours in the light theme were not reviewed. |
| 15d | **Round 5:** the header of the non-map pages has Search (opens the map with the search box focused) and Sign in (opens the map with the account dialog); both were seen working. Airports and My flights links wait for those pages. **Done in Phase 15 for the pages that are not the map:** a header (logo mark, name, Map and Inspector links) and a footer (disclaimer, Credits and data sources, GitHub link) on the inspector and the 404 page. The map keeps its own compact bar. Not done: a search entry and sign-in in the header, Airports and My flights links (no such pages), legal pages and contact (Phase 16e). Header and footer on every page: header with logo, navigation (Map, Airports, Inspector, My flights when they exist), search entry and sign-in; footer with Credits and data sources, legal pages, disclaimer, GitHub link and contact. The map page may use a compact header. |
| 15e | **Not built:** moving the map to `/map` changes every shared link; this needs a decision on redirects and the landing design first. Landing page: a page that explains SkyDeck in a few seconds (hero with a live map preview or video, feature highlights, data sources and honesty notes, a call to action to open the map, footer). Moving it to `/` means the map moves to `/map`; update links, the inspector's back link, the README and redirects. Must be server-rendered for fast first paint and search, work on phone, tablet and desktop, and respect reduced motion. |
| 15f | **Partly done (2026-11-16):** a share image (`public/og-image.png`, 1200 x 630) drawn from the app's own design by `scripts/make-share-image.mjs`, and Open Graph and Twitter tags on every page. How chat apps render it was not checked; a designed brand image and README banner remain. **Not built:** needs designed images and screenshots. Banners and share images: Open Graph and social preview images, README banner, GitHub social image, screenshots. |
| 15g | **Fixed (2026-11-16):** the canonical link named the home page on every page; it now names the page itself (none for a missing page). Open Graph tags added with 15f. **Done in Phase 15 in part:** `robots.txt` and `sitemap.xml` are served by the app (the crawler rules keep `/api/` out), pages get titles and descriptions as before, a canonical link is written once the optional `SITE_URL` variable is set (it is not set yet, so none is written today), and the map page has schema.org WebApplication data. Not done: Open Graph images (15f) and a check with a real domain. Page metadata and search: titles, descriptions, canonical URLs, `sitemap.xml`, `robots.txt`, structured data where it fits. |
| 15h | **Automated part done (queue item 8, PR 64):** the screenshot matrix and the keyboard and contrast checks run in CI; the screenshots showed the 375 px busy notice overlapping the map attribution and a dark disabled Replay button in the light theme (not fixed yet). The design judgement itself is still a person's job. Earlier notes: **Not built:** a full design pass comes last; Phase 15 only looked at the inspector, 404 and map at desktop and the 404 at phone width, in light and dark. Design QA: every page checked at 1280, ~746 and 375 px, in both themes, with keyboard only and with a screen reader pass. |

Landing page: where to build it (Decision 8)

| Option | Good | Watch out for |
| --- | --- | --- |
| **Build it in this repo** (recommended) | One codebase, one deploy, one header and footer, server-rendered by TanStack Start, same design tokens as the app, no extra hosting or cost | You do the layout work (with help from me) |
| Draft in an AI design tool (for example v0), then paste the code | Fast first draft in React, Tailwind and shadcn, the same stack as this app | Generated code needs review, cleanup and accessibility fixes; check the tool's output and terms |
| Design in Framer, then publish | Strong visual editor and animation | From memory, not verified: Framer sites are hosted by Framer and are not exported as a React project, so the landing page would live on a separate site with its own header and footer that must be kept in sync by hand, and a custom domain may need a paid plan |
| Prototype visually first (Claude design tools or similar), then build in the repo | The look is settled before coding | An extra step |

## Phase 16: Platform

| Phase | Feature |
| --- | --- |
| 16a | **Done in Phase 16:** Chakra Petch (four weights) and JetBrains Mono (one variable file for 400 to 600), latin and latin-ext only, copied from Google Fonts into `public/fonts` (about 200 kB) under the SIL Open Font License; `@font-face` in `styles.css`, the two main files preloaded, no request goes to Google any more; the credit entry says so. Other scripts (Cyrillic, Greek, Thai, Vietnamese) fall back to the system font. |
| 16b | **Done in part (2026-11-10):** Sri is logged in to Cloudflare; `DEPLOY.md`, `wrangler` and the `preview:worker` and `deploy` scripts added; the production build passes the smoke tests locally in workerd. **Not built:** custom domain, preview deployments, shared caching. |
| 16c | **Done in Phase 16 (small):** a web app manifest, generated icons (192, 512, maskable, Apple touch), and a service worker that keeps the built files and shows a plain offline page when a page cannot be fetched. It never stores or answers live data (aircraft, weather, sign-in, the API). The app itself still needs a connection. Only registered in the built app, not in development; never run on a real production host. |
| 16d | **Done in Phase 16, partly:** the map library now has its own file (`maplibre`, 1,065 kB, 289 kB gzipped), so the map page's own code is 27 kB and the library stays cached across releases. The library itself is still over 1 MB; that cannot be made smaller here. |
| 16e | **Done in Phase 16 as a draft for Sri to read:** About, Privacy (written from DATA.md), Terms and Disclaimer pages with the header and footer, linked from the footer and in the sitemap. The takedown and general contact is the project's GitHub issues page; a private contact (an email address) still has to be chosen and added. This is not legal advice. |
| 16f | **Flows done (queue item 9, PR 65, 2026-11-21):** `e2e/flows.spec.ts` drives search, shortcuts, filters and CSV, units, watchlist, saved views, share links, alert rules, collection, emergency banner, clean view, first-run guide, replay, provider failure and the phone sheet against a stub provider (`e2e/stub-upstream.mjs`, `ADSB_UPSTREAM_OVERRIDE`); sign-in is still not driven. Earlier notes: **Done in part (2026-11-10):** Playwright approved and added; smoke tests of every public page, health, robots, sitemap, the map page and the not-found page run in their own CI job against `vite dev`. **Not built:** flows through the map, sign-in and watchlist tests, the production build under test (needs wrangler), other browsers. End-to-end tests of the main flows |
| 16g | **Not built:** a language setting means translating every text in the app; no translations exist, and it should wait until the text has settled. Language setting (the theme setting moved to 15c) |

## Phase 17: Final testing and release

| Phase | Feature |
| --- | --- |
| 17a | **Partly done in Phase 17:** follow mode, 3D trail, the Light basemap, filters, the ACARS card and the phone bottom sheet were opened and worked in the browser; the whole feature list was not repeated on tablet and phone, and the pass ran on the development server only. Results are in `RELEASE.md`. Full feature test pass in a visible browser: every feature on desktop, tablet and phone, including the ones not yet tested (follow mode, 3D trail, Light basemap, filters, the ACARS card) |
| 17b | **Content-Security-Policy in report-only mode added (2026-11-16):** `src/lib/csp.ts`, sent on HTML pages; reports go to `POST /api/csp-report` (one `[csp-report]` log line each, nothing stored). A full browser session on the production build gave 0 reports, a deliberate violation gave 1. It cannot be enforced yet: inline scripts need nonces first. `SITE_INDEXING=off` adds `X-Robots-Tag: noindex, nofollow` and a disallow-all `robots.txt`. **Done in Phase 17 (see `RELEASE.md`):** no secrets in the repo or the browser files, every server function validates input, row-level security tested, the profiles policies fixed for performance, security headers added; no Content-Security-Policy yet, no penetration test. Security review: secrets (none in the repo or the bundle), rate limits, database row-level security, input validation, dependency check |
| 17c | **Partly done:** the busy-provider case was seen live; the others are reasoned or unit tested; the database quota and a real offline browser were not drilled. See `RELEASE.md`. Quota and failure drills: what the user sees when each free quota (Gemini, Workers AI, data providers, database) is used up |
| 17d | **Partly done:** a structural accessibility check and the contrast test; no screen reader or keyboard-only pass, and no performance numbers from a deployed build. Accessibility and performance audit on the live build |
| 17e | **Checklist written, not closed:** `RELEASE.md` lists every open blocker; most need Sri. Release checklist: Phase 0 blockers closed, credits and README match every source's terms, Lovable removed (15a), monitoring and quota alarms for free tiers |
| 17f | **Not started:** nothing is deployed; the plan and rollback steps are in `RELEASE.md`. Soft launch to a few people, a rollback plan and a known-issues list |

## Remaining work, in order (written 2026-11-10, trimmed 2026-11-21)

Everything not listed here is built and merged into `dev`. **Phase 17 (final checks and testing, then release) is the last stage:** nothing is added after it except fixes it finds.

**A. Waiting for Sri (decisions, accounts, approvals). Nothing below can be finished without these.**

| Item | What is needed |
| --- | --- |
| 15b brand | Logo and app icons done (2026-11-22, PR #74). Still open: the domain (Decision 7) and a palette note. |
| 15a Lovable | Code is done (2026-11-16). The owner disconnects the project in Lovable and removes the Lovable GitHub app from the repository. |
| 16b Cloudflare | **Done:** deployed by hand to https://skydeck.sky-deck.workers.dev (latest 2026-11-22). Open: `ADSBLOL_API_KEY` (key requested from adsb.lol), `SITE_INDEXING`, Supabase Auth Site URL. Unlocks 18f, 19h, 21b, 21d, 10f and the real checks in 17. |
| 0a, 0b, 0c, 0d, 0f | Esri imagery terms (keep, key or drop), airplanes.live access, the Airframes answer, the ACARS legal review, credits wording matched to the terms. |
| 23g contact | A private contact address for takedowns and complaints. |
| 15e landing page | Decide the landing design and how `/map` redirects shared links. |
| 12b, 3D models | OK for a 3D layer library, and model files with a checked licence. |
| 18i, 21f | Seed data approach and how Supabase backups are made. |

**B. Can be built now, no decision needed (small).**

- 22d: ruler measured from the selected aircraft.
- 22i: notification choices in Settings (language waits for 16g).
- 22n: touch gestures beyond the map's own (only if wanted).
- 15d: search box and sign-in link in the site header; Airports and My flights links once those pages exist.
- 5f: the rest of the accessibility list (a screen reader pass needs a person).
- 0h: reproduce and fix the cold-start errors in development.
- 6c: label meanings, once `airframesio/acars-message-documentation` has a confirmed licence.
- 13d: Planespotters photos, after reading its terms.

**C. Now possible (the site is deployed).** 18f shared cache and scheduled jobs, 19h shared store, 21b previews, 21d uptime checker and quota alarms, 21f backup rehearsal, 10f and 6g web push, 15g with `SITE_URL` set, 15f share images (needs designed images), 15h design QA at 1280, 746 and 375 px in both themes with keyboard and screen reader.

**D. No source or not feasible for now.** 7d lightning, 7f winds aloft, 8c daily TFRs, 8e filed routes, 9b 30-day replay, 9c incident history, 11b, 11c, 11d, 14c (AI now works through Workers AI, so this can move to B), 6e, 6g, 6h (Airframes and legal), 16g language, 23e moderation, and the post-release ideas in Phase 24.

**E. Final stage: Phase 17.** 17a full feature pass in a visible browser on desktop, tablet and phone, 17b security review again on the live build, 17c quota and failure drills, 17d accessibility and performance audit on the live build, 17e release checklist (`RELEASE.md`) closed, 17f soft launch with a rollback plan. The 17 work done so far (the development-build pass and the first security review) stays in `RELEASE.md` and is repeated on the deployed build.

## How work is delivered

One branch per phase item, cut from `origin/dev`, a pull request into `dev`, merged with a merge commit after CI is green; never rewrite pushed history. The full rules are in [`CONTRIBUTING.md`](CONTRIBUTING.md). The build order is the order of "Remaining work" above, not the phase number.

## Decisions needed

Settled on 2026-11-07: Backend (Supabase + Cloudflare; MongoDB Atlas free tier later for NOTAMs only), AI (changed 2026-11-22: Workers AI first, Gemini as fallback; the Gemini key is optional), NOTAMs through FAA SWIM (confirmed), TSA lanes (Regular, PreCheck, Touchless ID, CLEAR+).

1. Esri, airplanes.live and Airframes (Phase 0).
2. Whether Phase 2f (descent path) is still wanted and what it means.
3. ACARS legal review timing, and whether 6f and 6h wait for it (recommended).
4. ~~Approval to edit AGENTS.md for the new rules.~~ Done (ACARS AI rule, 2026-11-22).
5. Where the SWIM consumer runs for free (18f), and reading the SWIM Service Access Agreement for non-commercial use.
6. Gemini free limits and terms, read from Google's own pages, before a Gemini key is added (Gemini only receives ACARS text when Workers AI fails).
7. Project name: "SkyDeck" is still a placeholder. Check that the name, a domain and social handles are free and not confusingly close to an existing product before the logo is drawn (15b).
8. Landing page approach (see 15e): build in this repo (recommended), or design elsewhere first.
9. Monitoring and error-reporting tools, and whether to use analytics at all (21c to 21e).
10. How far the app should scale at launch (19a numbers) and whether to run an own ADS-B feeder (19d).
11. Disconnecting the repository from Lovable on both ends (15a): the code no longer depends on it; the owner still has to disconnect it. The no-history-rewrite rule stays in AGENTS.md as a plain rule.

**Answers from Sri (2026-11-10):**

- Playwright (16f, 21k): approved as a dev dependency. Each browser download is still named (file, source, size) and asked about first.
- Cloudflare (16b): Sri has an account and says it is connected. Deployed since 2026-11-10; each deploy still needs Sri's go-ahead.
- Name (15b, Decision 7): keep "SkyDeck". Not verified: no check of name clashes, domain or social handles was done. The domain will be bought after the final product is finished.
- Contact (23g): a private address will be created once there is a domain. Until then the legal pages keep the GitHub issues page.

## Post-release phases

Ideas for after the first public release. Not researched, not scheduled. Anything the research notes missed also goes here.

| Phase | Idea | Notes |
| --- | --- | --- |
| 24a | Landing gear animation | Decision on 2026-11-07: after release. Needs a data source for gear state (probably inferred from altitude, speed and phase), and 3D models from 12b. |
| 24b | **Built early in Phase 24:** Settings, Aircraft colour: Altitude (default) or Airline. Each three-letter airline code gets one steady colour from a hash (plain colours, not liveries); aircraft with no airline code are grey; emergencies stay red; the trail keeps its altitude colours; the legend says so. Not tested with every airline: some neighbouring colours look alike. Airline colour schemes (generic) | Airline liveries are trademarks, so use plain colour-by-airline rather than reproductions. |
| 24c | Flight schedules, inbound aircraft and gates (11b, 11c) | Needs a data source that fits a free quota. |
| 24d | **Built early in Phase 24 (night shading and sunrise/sunset):** a Day and night switch in the Layers popover shades the night side of the earth (a polygon from the solar formulas, refreshed every minute) with a thin line along the day and night line, and the hint under the switch gives sunrise and sunset at the map centre in UTC. The maths is tested against published times for London, New York and Sydney (within a few minutes) and the polar cases. No twilight bands. Day and night terminator and sunrise/sunset overlay |  |
| 24e | **Partly built:** a link to a view or a selected flight already existed (22a); an image of the map was not built. Share a view or a flight (link, image) |  |
| 24f | **Built early in Phase 24:** the map page with `embed=1` in its address shows only the map (clean view, no shortcuts, no alert messages) with an Open in SkyDeck link; Settings, Copy embed code for this view copies an iframe tag. Seen working in the browser as a normal page, not inside an iframe on another site; no height or width responsiveness beyond the iframe's own size. Embeddable map widget |  |
| 24g | Native wrapper, push on phones | PWA push first. |
| 24h | Languages other than English |  |
| 24i | Spotting photo uploads, profiles, leaderboards | Needs moderation and a larger backend. |
| 24j | Open-ended aviation chat assistant | Needs grounding and a bigger AI budget. |
| 24k | Non-US weather, charts and airspace | The release sources are mostly US. |
| 24l | Lightning layer from GOES GLM (if not done in 7d) |  |
| 24m | Quiet hours and digest emails for alerts |  |
| 24n | Airframe and airline pages | A page per registration (photos, incidents, recent flights) and per airline (fleet, routes) |  |
| 24o | Departures and arrivals boards | Airport boards with scheduled times | Needs a schedule source (see 24c). |
| 24p | Arrival and delay predictions | Estimated arrival time and delay trends from stored history | Needs the 30-day history (9b). |
| 24q | AR "planes overhead" | Point a phone at the sky to identify aircraft | Needs device sensors and careful accuracy notes. |
| 24r | Overhead alerts | "A heavy jet will pass over your home" notifications | Needs web push (10f) and a saved location. |
| 24s | Statistics pages | Busiest airports, most common types, records | Needs stored history. |
| 24t | Aircraft type encyclopedia | Type pages with specifications and photos | Needs an open source with a clear licence. |
| 24u | Chat bot and calendar integrations | Discord or Telegram alerts, calendar feeds for watched flights |  |
| 24v | Public API for others | Read-only API for hobby projects | Only with strong rate limits; check provider terms first. |
| 24w | Data contribution | Own ADS-B and ACARS receivers feeding community networks | Ties to 19d and 6e. |

## Not planned

- Live air traffic control voice audio (not covered by the sources reviewed).
- Ticket booking, rebooking or any purchase flow.
- Reproducing airline liveries.
- A SkyDeck-invented "passenger drama" or "crew banter" ranking of messages (the source's own categories may be shown, see 6i).
- Any claim that data is complete, certified or suitable for navigation or flight planning.
