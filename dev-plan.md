# SkyDeck dev plan

The full phase plan for SkyDeck, as of 2026-11-07. SkyDeck is meant to become Sri's own take on a full-featured flight tracker app, built for the web. It is independent: it uses its own name, code and visuals and is not affiliated with any commercial app. `roadmap.md` lists only the phases still planned; the README describes what exists today.

## How to read this plan

**Status**

- **Done**: merged into `dev`.
- **Open**: planned for the first public release, not started.
- **Needs decision**: waiting on a choice from Sri (listed in "Decisions needed").
- **Post-release**: deliberately after the first public release (Phase 16 and later).
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
- Phone, tablet and desktop must all work (check 1280, ~746 and 375 px).
- Educational and hobby use only: no navigation, flight planning or safety claims.
- AGENTS.md still carries the old no-backend wording and must be updated (with Sri's approval) when Phase B starts.

## Numbering note

The original plan had five phases: 1 live map, 2 glide and reach, 3 message inspector, 4 airports, 5 personal features. The ACARS card was later labelled "Phase 4a" in local plan files and PR history, which clashed with the original Phase 4 (airports). This plan keeps Phases 1 to 5 and moves ACARS to **Phase 6** (the built card is 6a; it was called "4a" before). Weather and the other feature areas continue from Phase 7. Because a backend is now allowed, **Phase B** (backend foundation) is added and comes before the backend-dependent features.

## Done so far

| Phase | What                                                                                                                                                          | PR        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1     | Live map, aircraft panel, category icons, search, filters, trails, wide-area coverage, provider fallback and back-off, notices, emergency squawk confirmation | before #3 |
| 1.1   | Request sharing and per-provider pacing                                                                                                                       | #3        |
| 2a    | Glide-range ring with rule-of-thumb ratios and height above terrain                                                                                           | before #3 |
| 2b    | Airports inside the ring listed in the aircraft panel                                                                                                         | #4        |
| 2c    | Those airports as map dots and IATA labels                                                                                                                    | #5        |
| 2d    | About 4,500 large and medium airports from OurAirports, loaded on demand                                                                                      | #6        |
| 2e    | "Nearest in range" line in the panel header                                                                                                                   | #7        |
| 3a    | ADS-B message inspector at `/inspector` (paste Mode S frames)                                                                                                 | #8, #9    |
| 6a    | On-demand ACARS card in the aircraft panel (was called "4a")                                                                                                  | #10       |
| 1.2   | Housekeeping: lint fix #11, docs refresh #12, OpenSky removed #13, credits dialog #14, final testing pass and layout fixes #15, docs #16                      |           |

## Backend and AI options (research)

### Backend

| Option                             | Free limits                                                                                                                                                       | Fits SkyDeck because                                                                                  | Watch out for                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Workers + D1 (+ KV)** | D1 free: 500 MB per database, 5 GB per account, 10 databases (official docs). Workers free plan limits apply.                                                     | Deploy target is already Cloudflare Workers; no extra vendor; Workers AI is built in (below).         | No built-in auth: sign-in would need a library (a new dependency, so ask first). D1 free queries fail when daily row limits are exceeded (a changelog entry mentions a change from 2026-09-01; confirm on the official page). |
| **Supabase (Postgres + Auth)**     | 500 MB database, 2 active projects, free projects pause after about a week of inactivity, 50,000 monthly active users (secondary sources, not the official page). | The original plan used it; ready-made email and Google sign-in; row-level security for crowd reports. | Pausing needs a keep-alive job or a manual restore. Second vendor and a client dependency.                                                                                                                                    |

My lean: Supabase for sign-in and the crowd-sourced data (it removes the hardest part), Cloudflare for hosting, caching and AI. This is Decision D1.

### Free AI (clears the old "AI gate")

| Option                      | Free allowance                                                                                                                                                                 | Notes                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Workers AI**   | 10,000 Neurons per day on the Workers free plan, shared across models; resets 00:00 UTC (official Cloudflare docs, read 2026-11-07). Over that, requests fail until the reset. | No separate API key when called from a Worker (a binding); text models available; fits the Cloudflare deploy. Which models are free and the exact messages per day were not measured. |
| Google Gemini API free tier | Flash-class models with per-minute and per-day limits; sources disagree on the numbers and say Google's own pages are authoritative.                                           | Needs an API key (server-side secret). Check whether free-tier prompts may be used to improve the provider's products before sending any message text.                                |
| Groq free tier              | Limits vary by model and are set per organisation; sources list different numbers.                                                                                             | Needs a key. Fast, small daily pools.                                                                                                                                                 |
| OpenRouter free models      | One secondary source says about 50 requests per day across free models.                                                                                                        | Needs a key. Weakest guarantee.                                                                                                                                                       |

How AI would be used so free quotas are enough (this is Decision D2):

- **On demand only** (a button), never automatic for every message or flight.
- **Cache every result** in the database, keyed by the message or flight, so each item is summarised at most once.
- **Daily budget cap** in the server: when the free pool is used up, show the rule-based text instead and say so.
- **Always labelled "AI-generated"**, with the original text one click away.
- **Fallback**: Phase 6c (rule-based explanations) works with no AI at all.
- Message text sent to an AI provider counts as sharing it with a third party; review that in the ACARS legal review.

## Data sources (research results)

| Need                                       | Source                                                                               | Verification                                                                         | Findings and risks                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| METAR, TAF                                 | aviationweather.gov Data API                                                         | **Tested** (JSON, keyless)                                                           | Docs: 100 requests per minute, no more than 1 request per minute per thread, custom User-Agent requested. No CORS header seen, so call it from the server. Cache for minutes.                                                                                                                      |
| SIGMET / AIRMET                            | aviationweather.gov `airsigmet`                                                      | **Tested** (JSON, keyless)                                                           | Same limits and server-side rule.                                                                                                                                                                                                                                                                  |
| PIREPs                                     | aviationweather.gov `pirep`                                                          | **Tested** (needs a bounding box or station list, else HTTP 400)                     | Query per view or per airport.                                                                                                                                                                                                                                                                     |
| Winds aloft                                | aviationweather.gov wind/temperature product                                         | Docs/search (not tested)                                                             | Confirm the endpoint and format.                                                                                                                                                                                                                                                                   |
| Flight category (VFR / MVFR / IFR / LIFR)  | Derived from METAR visibility and ceiling                                            | Not a source; computed                                                               | Compute it ourselves, or use a field in the METAR JSON if present (not checked).                                                                                                                                                                                                                   |
| FAA airport delays, ground stops, closures | FAA NAS Status XML feed                                                              | **Tested** (200, XML, keyless)                                                       | No CORS header, so server side. Vendor pages call it public domain, but I did not find an FAA terms page. Cache for minutes.                                                                                                                                                                       |
| D-ATIS                                     | `datis.clowd.io` redirects to `atis.info/api/{ICAO}`                                 | **Tested** (JSON, CORS open)                                                         | Covers only airports with D-ATIS (about 75 per sources). No terms page read. Treat the operator as a small community service.                                                                                                                                                                      |
| Weather radar                              | RainViewer public API                                                                | **Tested** (JSON, CORS open)                                                         | Free tier is personal and educational use only, attribution required, max zoom 7, 100 requests per IP per minute, no future (nowcast) frames since 2026-01-01, tile path IDs are hashes. No availability guarantee. Fine for this non-commercial project; ask them before any commercial use.      |
| Radar (US alternative)                     | NOAA / NWS `mapservices.weather.noaa.gov` MRMS base reflectivity (WMS)               | Docs/search                                                                          | US only; terms not found; contact `nws.mapservices@noaa.gov`. Possible fallback and the source for the radar timeline if RainViewer's limits do not fit.                                                                                                                                           |
| Echo tops                                  | Iowa State Mesonet OGC (NEXRAD echo tops over WMS), or NOAA MRMS GRIB2 files         | Docs/search; MRMS file directory **tested** (200)                                    | WMS is the easy route; raw GRIB2 would need server-side processing. US only.                                                                                                                                                                                                                       |
| Lightning                                  | Blitzortung                                                                          | Docs/search                                                                          | Its own contact page limits use of its data to private and entertainment purposes, and it has no public API. **Do not use without explicit permission.**                                                                                                                                           |
| Lightning (alternative)                    | NOAA GOES GLM data (netCDF)                                                          | Docs/search                                                                          | Free, but needs a server-side job to grid and tile it. Heavy; treat as a stretch goal.                                                                                                                                                                                                             |
| TFR polygons                               | Official FAA feed                                                                    | **None found**                                                                       | `tfr.faa.gov/tfr_map_ims/jsonTFRData.jsp` returned 404; `tfr3/export/json` returned a web page; a public ArcGIS "TFR public view" layer returned 0 features and was last edited in 2025. Options: scrape tfr.faa.gov pages (terms unknown), or filter FDC NOTAMs once FAA NOTAM access is granted. |
| NOTAMs                                     | FAA NOTAM API / NOTAM Management Service                                             | Docs/search                                                                          | Free but not keyless: needs a client ID and secret from the FAA (approval step; email `NOTAMS@faa.gov` for the newer service). Allowed now that secrets are fine. The legacy API is being retired.                                                                                                 |
| Airspace boundaries (Class B/C/D etc.)     | FAA ArcGIS `Boundary_Airspace` FeatureServer                                         | **Tested** (layer metadata, CORS open)                                               | Updated about every 8 weeks (university metadata). Fetch once and cache; do not query per user.                                                                                                                                                                                                    |
| Airport charts                             | FAA digital Terminal Procedures Publication (d-TPP)                                  | Docs/search                                                                          | Free; 28-day cycle; bulk download. No stable per-chart URL was confirmed, so link out to the FAA search first and host nothing.                                                                                                                                                                    |
| Runways, frequencies                       | OurAirports (`runways.csv`, Unlicense)                                               | Known from Phase 2d; not re-tested                                                   | Same dataset already used.                                                                                                                                                                                                                                                                         |
| Gates, taxiways, terminals                 | OpenStreetMap aeroway features via OpenFreeMap tiles                                 | Not tested                                                                           | Check what the OpenFreeMap schema carries before promising gates.                                                                                                                                                                                                                                  |
| Airport cameras                            | YouTube live embeds from a hand-curated list                                         | Not tested                                                                           | Each stream must allow embedding; the list needs upkeep.                                                                                                                                                                                                                                           |
| TSA checkpoint waits                       | Official feed                                                                        | **None found**                                                                       | The old MyTSA wait-time endpoint did not respond, and a 2026 report says TSA's public tool was retired in 2023. Only crowd-sourced reports are possible (Phase 4k, uses the backend).                                                                                                              |
| Military and government aircraft           | ADS-B provider database flags                                                        | **Tested** (`/v2/mil` on adsb.lol returns aircraft with `dbFlags: 1`)                | Our server code does not keep `dbFlags` yet; it must be added to the feed schema. Government flags not checked.                                                                                                                                                                                    |
| Aircraft incident history                  | NTSB accident data (US civil, 1962 onward, downloadable, searchable by registration) | Docs/search                                                                          | Current download terms not confirmed. Aviation Safety Network: no terms found, assume no bulk use. Non-US coverage is missing.                                                                                                                                                                     |
| Flight schedules, inbound aircraft         | Free tiers of schedule APIs                                                          | Docs/search                                                                          | Aviationstack free is 100 requests per month (too small); AeroDataBox and AirLabs limits not found. Not enough for a live feature; keep post-release.                                                                                                                                              |
| Gates assignment, baggage claim            | Airline and airport systems                                                          | **None found**                                                                       | Not available for free.                                                                                                                                                                                                                                                                            |
| Filed-route waypoints                      | Filed flight plans                                                                   | Not researched; likely **None found**                                                | Free ADS-B sources do not carry flight plans.                                                                                                                                                                                                                                                      |
| Aircraft photos                            | Planespotters photo API                                                              | **Tested** (returns 403 without a User-Agent that includes a contact URL; CORS open) | Needs a contact in the User-Agent; read their terms and attribution rules before use.                                                                                                                                                                                                              |
| Historical positions                       | adsb.lol historical dumps (ODbL)                                                     | From the earlier terms review; not re-tested                                         | Share-alike and attribution apply; large.                                                                                                                                                                                                                                                          |
| ACARS                                      | Airframes API                                                                        | Earlier review                                                                       | Pre-release; terms still being finalised; send the email before launch.                                                                                                                                                                                                                            |

## Phase 0: Before any public launch (blockers)

Not features, but nothing is deployed until these are settled.

| Item                                                    | Status  | What is needed                                                                                                                                                   |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Esri satellite imagery terms                            | Open    | Read Esri's terms in a normal browser. Keep, use a free API key (now possible with a backend), swap the style, or drop Satellite.                                |
| airplanes.live returns 403 to our server                | Open    | Email the operator for approval, or accept adsb.lol as the only provider.                                                                                        |
| Airframes anonymous API                                 | Open    | Send the draft email (kept locally) and recheck anonymous access, CORS and limits.                                                                               |
| ACARS legal review                                      | Open    | Showing radio messages publicly touches 47 U.S.C. 605. Consult a lawyer before deploying. Not legal advice.                                                      |
| Self-host the two Google fonts                          | Open    | Sri must approve the font downloads (names, source, size) first.                                                                                                 |
| Credits wording                                         | Open    | Match each source's current terms once Esri and airplanes.live are decided.                                                                                      |
| Route data freshness                                    | Checked | The hosted route file checked was about 7 weeks old and the upstream repo's last commit is a year old. Add a README note; treat "Route not available" as normal. |
| Cold-start console errors and Vite worker errors in dev | Open    | Cause unknown; reproduce before fixing.                                                                                                                          |
| Server feed stale-cache quirk                           | Open    | On failure the handler may return an older cached result with no age limit.                                                                                      |
| Cloudflare deployment                                   | Open    | Nothing is deployed; `bun run preview` does not work with the Cloudflare build.                                                                                  |
| AGENTS.md and README wording                            | Open    | Replace the old no-backend and keyless rules once Phase B is approved (needs Sri's OK to edit AGENTS.md).                                                        |

## Phase B: Backend foundation

New. Needed before 4k, 5g, 6f, 6h, 9b, 10f and any stored data.

| Phase | Work                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1    | Choose the platform (Decision D1) and record it in AGENTS.md and the README.                                                                                                                                        |
| B2    | Secrets and configuration: server-side environment variables only, a documented list of names (no values), a startup check that fails clearly when one is missing.                                                  |
| B3    | Database schema and migrations in the repo; local development database or emulator.                                                                                                                                 |
| B4    | Sign-in (email and Google) with sessions; sign-out; account deletion. Used by Phase 5g.                                                                                                                             |
| B5    | Abuse protection: per-visitor rate limits on every write endpoint, input validation, size limits, a way to hide or delete bad reports.                                                                              |
| B6    | Shared cache and scheduled jobs (provider cache that survives across isolates, keep-alive for a free database that pauses, nightly data refresh). Fixes the "per server instance only" limit of pacing and caching. |
| B7    | AI service wrapper: budget counter, cache table, kill switch, labelled output (Decision D2).                                                                                                                        |
| B8    | Privacy basics: what is stored, how long, how to delete it, written in the privacy page (Phase 15e).                                                                                                                |

## Phase 2f: Descent path

The original plan listed a descent path as the last slice of Phase 2. Its exact wording is not in the repo, so confirm the intent before scoping it.

- **Sees**: a projected descent line for the selected aircraft along its track.
- **Needs**: speed, track, vertical rate, terrain (all available).
- **Missing data**: show nothing, no guessing.
- Status: Open, scope to be confirmed. Still-air estimate only, same disclaimers as the glide ring.

## Phase 3: ADS-B message inspector

- **3a** Done. Not decoded yet and labelled as such: Gillham altitude, GNSS height, surface position, status messages, Comm-B, ACAS.
- **3b** Open, needs decision: feed the inspector from a receiver Sri owns (for example `dump1090` or `readsb` output). Plan only until receiver and format are chosen.
- **3c** Open: decode the labelled gaps (Gillham altitude, surface position, status messages), each with tests against published frames.

## Phase 4: Airports

Reuses the OurAirports data from Phase 2. Sources are in the table above.

| Phase | Feature                     | Sees                                                                                                                                                                        | Data                                                            | Backend?                                                                       |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 4a    | Airport pages               | Page per airport, found by IATA or ICAO code: name, local time, elevation, runways on the map, nearby traffic count, arrivals and departures inferred from tracked aircraft | OurAirports, ADS-B feed                                         | No                                                                             |
| 4b    | Airport weather             | Current METAR, TAF, flight-category badge                                                                                                                                   | aviationweather.gov through a server proxy with a short cache   | No                                                                             |
| 4c    | Nearby airports             | List near the user's location, only if they allow it                                                                                                                        | OurAirports + browser geolocation                               | No                                                                             |
| 4d    | Active runway               | Which runways are in use, inferred from recent arrivals and departures and METAR wind                                                                                       | ADS-B tracks + METAR                                            | No                                                                             |
| 4e    | Airport map detail          | Gates, taxiways, terminal buildings and signs for major airports                                                                                                            | OpenStreetMap aeroway data (check the OpenFreeMap schema first) | No                                                                             |
| 4f    | FAA delays and ground stops | Status banner on the airport page                                                                                                                                           | FAA NAS Status XML, server proxy                                | No                                                                             |
| 4g    | D-ATIS and NOTAMs           | Current ATIS text; NOTAMs with severity colours and plain-English wording                                                                                                   | atis.info; FAA NOTAM access (credentials needed)                | Server proxy and secrets (Phase B2)                                            |
| 4h    | Airport charts              | Link to US airport and approach charts                                                                                                                                      | FAA d-TPP                                                       | No                                                                             |
| 4i    | Airport cameras             | Embedded live camera streams                                                                                                                                                | Curated YouTube list                                            | No                                                                             |
| 4j    | Airport brief               | Short text combining weather, delays, ATIS and traffic                                                                                                                      | Rule-based from 4a to 4g (AI version in 14c)                    | No                                                                             |
| 4k    | Security wait times         | Estimated wait per checkpoint, "Report your wait" button, average of the last 60 minutes, busy-hours chart, "not enough data" state                                         | Crowd-sourced reports (no official feed found)                  | Yes (Phase B). Never show invented numbers; mark fallback figures "Estimated". |

## Phase 5: Personal features and polish

| Phase | Feature                                                                                                         | Backend?       |
| ----- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| 5a    | Watchlist for flights, airports and aircraft (browser first)                                                    | No             |
| 5b    | In-app alerts for takeoff, landing and emergency squawk on watched items (tab open)                             | No             |
| 5c    | Recently viewed flights                                                                                         | No             |
| 5d    | Follow chase-cam: a 3D follow view behind the selected aircraft (basic follow mode and 3D trails already exist) | No             |
| 5e    | Loading skeletons, error and rate-limit states                                                                  | No             |
| 5f    | Accessibility pass (keyboard, focus, contrast, screen reader labels, reduced motion)                            | No             |
| 5g    | Sign-in and cloud sync of the watchlist and recently viewed                                                     | Yes (Phase B4) |

## Phase 6: Pilot messages (ACARS)

Today: an on-demand card in the aircraft panel (6a, done). Until the legal review and the Airframes answer are in, the guardrails stay: on demand, plain text, attributed, nothing stored, no real message text in the repo, tests or docs.

| Phase | Feature                               | Notes                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6a    | ACARS card in the panel               | Done.                                                                                                                                                                                                                                                                                      |
| 6b    | Browse page                           | Recent Airframes messages, filter by label and text, same on-demand guardrails.                                                                                                                                                                                                            |
| 6c    | Plain-English decoding by rules       | A dictionary of message labels and common abbreviations, tagged "explained by SkyDeck rules". No AI.                                                                                                                                                                                       |
| 6d    | Original vs summary view              | Expandable "Original received message" (monospaced, exactly as received, copyable) next to the explanation. Metadata fields shown separately and marked "unavailable" when missing. Partial or undecodable messages marked as such. A "report a wrong summary" button once Phase B exists. |
| 6e    | Own receiver                          | Viewer for the output of a decoder Sri runs (`acarsdec` or `dumpvdl2`). Needs a VHF receiver.                                                                                                                                                                                              |
| 6f    | AI summaries                          | Uses the free AI plan in "Backend and AI options" (on demand, cached, daily cap, labelled "AI-generated", original always available). Needs Phase B7 and the ACARS legal review.                                                                                                           |
| 6g    | Message notifications                 | Notification levels (All, Interesting, Breaking) for watched aircraft. Depends on 5b.                                                                                                                                                                                                      |
| 6h    | Message history and flight-day search | Needs stored messages. A backend now exists, but storing and republishing messages still needs the Airframes answer and the legal review.                                                                                                                                                  |
| 6i    | Source-provided message categories    | Decision on 2026-11-07: SkyDeck does not invent its own "drama" or "interesting" feed. If the API supplies a category or flag (for example diversion, medical, maintenance), SkyDeck shows it as supplied, with the original message and the legal notes.                                  |

## Phase 7: Aviation weather layers

All are map overlays that must survive a basemap switch.

| Phase | Feature                                                                                             | Source (see table)                                                                           |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 7a    | Precipitation radar                                                                                 | RainViewer (tested); NOAA MRMS WMS as US fallback                                            |
| 7b    | Radar timeline (past frames; forecast frames only if a source provides them, labelled as forecasts) | RainViewer past frames only                                                                  |
| 7c    | Echo tops                                                                                           | Iowa State Mesonet WMS (US)                                                                  |
| 7d    | Lightning, coloured by age                                                                          | Blitzortung is not allowed without permission; GOES GLM needs a processing job. Stretch goal |
| 7e    | PIREPs, SIGMETs and AIRMETs                                                                         | aviationweather.gov (tested)                                                                 |
| 7f    | Winds aloft                                                                                         | aviationweather.gov wind and temperature product (endpoint to confirm)                       |

## Phase 8: Routes, terrain and airspace

| Phase | Feature                               | Notes                                                                                                                                         |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 8a    | Route line for the selected flight    | Origin and destination from the existing route lookup; great-circle line labelled as an approximation.                                        |
| 8b    | Terrain profile                       | Elevation along the track and the route using the AWS terrain tiles we already load. PIREP overlay after 7e.                                  |
| 8c    | Temporary flight restriction polygons | No keyless feed found (see table). Options: NOTAM access (4g) or scraping tfr.faa.gov after reading its terms. Educational, not for planning. |
| 8d    | Airspace boundaries                   | FAA ArcGIS `Boundary_Airspace` (tested), cached.                                                                                              |
| 8e    | Filed-route waypoints                 | No free source found; likely stays unbuilt.                                                                                                   |

## Phase 9: History and replay

| Phase | Feature                   | Notes                                                                                                                                                           |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9a    | Session replay            | Replay what the browser has recorded since the page opened. No backend.                                                                                         |
| 9b    | 30-day flight replay      | Needs stored positions: either our own recorder (backend, storage limits) or adsb.lol historical dumps (ODbL, large). Needs Phase B and a storage plan.         |
| 9c    | Aircraft incident history | Per-airframe past incidents with date, description and source, from NTSB data (US only) once its terms are confirmed. Documented events, never a safety rating. |

## Phase 10: Alerts

| Phase | Feature                                                               | Backend?                                                                  |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 10a   | Emergency squawk banner                                               | Done in Phase 1.                                                          |
| 10b   | Alert rules (altitude, type, region, callsign) checked in the browser | No (tab open)                                                             |
| 10c   | Map-drawn alert areas                                                 | No                                                                        |
| 10d   | Military and government aircraft alerts                               | No (add `dbFlags` to the feed schema first)                               |
| 10e   | Natural-language alert creation                                       | A small rule parser first; an AI version uses the free AI plan (Phase B7) |
| 10f   | Notifications when the tab is closed (web push)                       | Yes (Phase B, scheduled checks)                                           |

## Phase 11: My flights

| Phase | Feature                         | Notes                                                                                                |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 11a   | Track a flight in progress      | Add a callsign and show its stage (pushback, takeoff, cruise, descent, landing) inferred from ADS-B. |
| 11b   | Inbound aircraft                | Needs schedule data; free tiers are too small. Post-release unless a source appears.                 |
| 11c   | Clearance, gates, baggage claim | No free source found. Not available.                                                                 |
| 11d   | Lock-screen style updates       | iOS Live Activities have no web equivalent. A web push version needs 10f.                            |

## Phase 12: 3D and visuals

| Phase | Feature                       | Notes                                                             |
| ----- | ----------------------------- | ----------------------------------------------------------------- |
| 12a   | Expanded aircraft silhouettes | More shapes per type, in the 2D icons.                            |
| 12b   | 3D aircraft models            | Generic models by category; check the licence of any model asset. |
| 12c   | 3D airports                   | Builds on 4e and the existing 3D buildings.                       |

## Phase 13: Collection and gamification

Browser-local until sign-in (5g) exists, then synced.

| Phase | Feature                                                                            |
| ----- | ---------------------------------------------------------------------------------- |
| 13a   | Collect aircraft types and registrations you have selected                         |
| 13b   | Achievements                                                                       |
| 13c   | Challenges (for example, "find a helicopter, a glider and a heavy jet")            |
| 13d   | Aircraft photos on collected aircraft (Planespotters API, after reading its terms) |

## Phase 14: Insights

Rule-based first; the AI versions use the free AI plan.

| Phase | Feature                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| 14a   | Per-flight facts card (route, distance, phase of flight, time to destination) |
| 14b   | Airport brief (see 4j)                                                        |
| 14c   | AI insights: per-flight and airport briefs, on demand, cached, labelled       |

## Phase 15: Platform and release

| Phase | Feature                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 15a   | Self-hosted fonts (see Phase 0)                                                                                                       |
| 15b   | Cloudflare Workers deployment, including a working preview and shared caching                                                         |
| 15c   | Installable PWA and offline shell                                                                                                     |
| 15d   | Performance: split the large map chunk (about 1 MB)                                                                                   |
| 15e   | Legal pages: about, privacy, terms, disclaimer, takedown contact                                                                      |
| 15f   | End-to-end tests of the main flows                                                                                                    |
| 15g   | Settings beyond units (theme, language)                                                                                               |
| 15h   | Release checklist: Phase 0 blockers closed, credits and README match every source's terms, monitoring and quota alarms for free tiers |

## Suggested order

1. **Phase 0 blockers** that need only Sri's decisions (Esri, fonts, credits), and **Decisions D1 and D2**.
2. **Phase B** (B1 to B3 first), then the rest as needed.
3. **Phase 4a to 4c, 4f, 4j**: airport pages, weather, nearby airports, FAA status.
4. **Phase 5a, 5b, 5e, 5f**: watchlist, alerts, states and accessibility.
5. **Phase 8a, 8b, 8d**: route line, terrain profile, airspace.
6. **Phase 7a, 7b, 7e**: radar and PIREPs.
7. **Phase 4g, 4k, 5g**: ATIS and NOTAMs, crowd waits, sign-in.
8. **Phase 6b to 6d**, then **6f**, after the legal review.
9. **Phase 9a, 10b to 10d, 11a, 13, 14**.
10. **Phase 12, 15**, then release.

## Decisions needed

1. **D1 backend platform:** Supabase for sign-in and data plus Cloudflare for hosting and AI (my lean), or Cloudflare only.
2. **D2 free AI:** go with Cloudflare Workers AI under the on-demand, cached, capped rules above, or another provider.
3. Esri, airplanes.live and Airframes (Phase 0).
4. Whether Phase 2f (descent path) is still wanted and what it means.
5. ACARS legal review timing, and whether 6f and 6h wait for it (recommended).
6. Approval to edit AGENTS.md for the new rules.

## Post-release phases

Ideas for after the first public release. Not researched, not scheduled. Anything the research notes missed also goes here.

| Phase | Idea                                                    | Notes                                                                                                                                                 |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16a   | Landing gear animation                                  | Decision on 2026-11-07: after release. Needs a data source for gear state (probably inferred from altitude, speed and phase), and 3D models from 12b. |
| 16b   | Airline colour schemes (generic)                        | Airline liveries are trademarks, so use plain colour-by-airline rather than reproductions.                                                            |
| 16c   | Flight schedules, inbound aircraft and gates (11b, 11c) | Needs a data source that fits a free quota.                                                                                                           |
| 16d   | Day and night terminator and sunrise/sunset overlay     |                                                                                                                                                       |
| 16e   | Share a view or a flight (link, image)                  |                                                                                                                                                       |
| 16f   | Embeddable map widget                                   |                                                                                                                                                       |
| 16g   | Native wrapper, push on phones                          | PWA push first.                                                                                                                                       |
| 16h   | Languages other than English                            |                                                                                                                                                       |
| 16i   | Spotting photo uploads, profiles, leaderboards          | Needs moderation and a larger backend.                                                                                                                |
| 16j   | Open-ended aviation chat assistant                      | Needs grounding and a bigger AI budget.                                                                                                               |
| 16k   | Non-US weather, charts and airspace                     | The release sources are mostly US.                                                                                                                    |
| 16l   | Lightning layer from GOES GLM (if not done in 7d)       |                                                                                                                                                       |
| 16m   | Quiet hours and digest emails for alerts                |                                                                                                                                                       |

## Not planned

- Live air traffic control voice audio (not covered by the sources reviewed).
- Ticket booking, rebooking or any purchase flow.
- Reproducing airline liveries.
- A SkyDeck-invented "passenger drama" or "crew banter" ranking of messages (the source's own categories may be shown, see 6i).
- Any claim that data is complete, certified or suitable for navigation or flight planning.
