# SkyDeck dev plan

The full phase plan for SkyDeck, as of 2026-11-06. SkyDeck is meant to become Sri's own take on a full-featured flight tracker app, built for the web. It is independent: it uses its own name, code and visuals and is not affiliated with any commercial app. `roadmap.md` is the short version of this file; the README describes what exists today.

## How to read this plan

**Status**

- **Done**: merged into `dev`.
- **Open**: planned, not started.
- **Gated**: cannot start until a decision or a licence is settled (the gate is named).
- **Not planned**: considered and deliberately left out (see the last section).

**Three questions for every feature** (so that a feature never depends on data we do not have):

1. What does the user see?
2. What data does it need, and where could it come from?
3. What does the user see when that data is missing?

**Candidate sources are not verified.** Every source named below as a candidate was suggested by research notes and has not been checked for terms, rate limits, keys or CORS. Check each one (as was done for OpenSky, airplanes.live and Airframes) before building on it.

**Where the feature ideas come from.** The feature list for later phases comes from public descriptions of an iOS flight tracker app (its App Store listing, release notes and one partner video), gathered through research notes. These are advertised features, not tested ones, and nothing here was verified by using that app.

## Ground rules (from AGENTS.md and Sri's constraints)

- Free and keyless only. No API keys, secrets or `.env` files. No paid services.
- No backend or database, unless a phase is explicitly gated on that decision (marked **Needs backend**). Work that can live in the browser (`localStorage`) should.
- Live ADS-B data goes through the `createServerFn` proxies only. The one exception is on-demand ACARS from Airframes.
- Nothing is stored or republished server-side without revisiting the legal notes.
- OpenSky is not a provider and stays out without a written licence.
- No new dependencies without asking. No edits to `src/components/ui/*`.
- Map overlays must be re-installed in the `style.load` handler.
- Phone, tablet and desktop must all work (check 1280, ~746 and 375 px).
- Educational and hobby use only: no navigation, flight planning or safety claims.

## Numbering note

The original plan had five phases: 1 live map, 2 glide and reach, 3 message inspector, 4 airports, 5 personal features. Later, the ACARS card was labelled "Phase 4a" in local plan files and PR history. That clashed with the original Phase 4 (airports). This plan keeps the original Phases 1 to 5 and moves the ACARS work to **Phase 6** (the built card is 6a; it was called "4a" before). New feature areas continue from Phase 7.

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
| 1.2   | Housekeeping: lint fix #11, docs refresh #12, OpenSky removed #13, credits dialog #14, final testing pass and layout fixes #15, roadmap tidy #16              |           |

## Phase 0: Before any public launch (blockers)

Not features, but nothing should be deployed until these are settled.

| Item                                                    | Status  | What is needed                                                                                                                                                      |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Esri satellite imagery terms                            | Open    | Read Esri's terms in a normal browser. Keep, use a free API key (breaks "keyless"), swap the style, or drop Satellite.                                              |
| airplanes.live returns 403 to our server                | Open    | Email the operator for approval, or accept adsb.lol as the only provider.                                                                                           |
| Airframes anonymous API                                 | Open    | Send the draft email (kept locally) and recheck anonymous access, CORS and limits before relying on it.                                                             |
| ACARS legal review                                      | Open    | Showing radio messages publicly touches 47 U.S.C. 605. Consult a lawyer before deploying. Not legal advice.                                                         |
| Self-host the two Google fonts                          | Open    | Sri must approve the font downloads (names, source, size) first. Removes a third-party request from every visitor.                                                  |
| Credits wording                                         | Open    | Match each source's current terms once Esri and airplanes.live are decided.                                                                                         |
| Route data freshness                                    | Checked | The hosted route file checked was about 7 weeks old and the upstream repo's last commit is a year old. Add a README note and treat "Route not available" as normal. |
| Cold-start console errors and Vite worker errors in dev | Open    | Cause unknown; one dev "Worker failed to load" seen after a CSS edit. Reproduce before fixing.                                                                      |
| Server feed stale-cache quirk                           | Open    | On failure the handler may return an older cached result with no age limit. Known, unfixed.                                                                         |
| Cloudflare deployment                                   | Open    | Nothing is deployed; `bun run preview` does not work with the Cloudflare build.                                                                                     |

## Phase 2f: Descent path

The original plan listed a descent path as the last slice of Phase 2. Its exact wording is not in the repo, so confirm the intent before scoping it.

- **Sees**: a projected descent line for the selected aircraft along its track.
- **Needs**: speed, track, vertical rate, terrain (already available).
- **Missing data**: show nothing, no guessing.
- Status: Open, scope to be confirmed. Still-air estimate only, same disclaimers as the glide ring.

## Phase 3: ADS-B message inspector

- **3a** Done (see above). Not decoded yet and labelled as such: Gillham altitude, GNSS height, surface position, status messages, Comm-B, ACAS.
- **3b** Open, **Gated** on Sri's receiver and format decisions: feed the inspector from a receiver Sri owns (for example a local `dump1090` or `readsb` output). Plan only until those are decided.
- **3c** Open: decode the labelled gaps (Gillham altitude, surface position, status messages), each with tests against published frames.

## Phase 4: Airports

Reuses the OurAirports data from Phase 2.

| Phase | Feature                     | Sees                                                                                                                                                                        | Candidate data                                                                                          | Backend?                                                                                                                 |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 4a    | Airport pages               | Page per airport, found by IATA or ICAO code: name, local time, elevation, runways on the map, nearby traffic count, arrivals and departures inferred from tracked aircraft | OurAirports (runways, frequencies), current ADS-B feed                                                  | No                                                                                                                       |
| 4b    | Airport weather             | Current METAR, TAF and a VFR / MVFR / IFR / LIFR flight-category badge                                                                                                      | aviationweather.gov (to verify: terms, keyless, CORS), via a server proxy                               | No                                                                                                                       |
| 4c    | Nearby airports             | List near the user's location, only if they allow it                                                                                                                        | OurAirports + browser geolocation                                                                       | No                                                                                                                       |
| 4d    | Active runway               | Which runways are in use, inferred from recent arrivals and departures and from wind                                                                                        | ADS-B tracks + METAR wind                                                                               | No                                                                                                                       |
| 4e    | Airport map detail          | Gates, taxiways, terminal buildings and signs for major airports                                                                                                            | OpenStreetMap aeroway data (check what OpenFreeMap tiles carry)                                         | No                                                                                                                       |
| 4f    | FAA delays and ground stops | Status banner on the airport page                                                                                                                                           | FAA airport status service (to verify)                                                                  | No                                                                                                                       |
| 4g    | D-ATIS and NOTAMs           | Current ATIS text and notices, with plain-English wording and severity colours                                                                                              | Candidate services unverified; the official NOTAM feed may require registration (would break "keyless") | No, but may be Gated on a key                                                                                            |
| 4h    | Airport charts              | Link to US airport and approach charts                                                                                                                                      | FAA digital Terminal Procedures Publication (to verify)                                                 | No                                                                                                                       |
| 4i    | Airport cameras             | Embedded live camera streams                                                                                                                                                | YouTube embeds from a curated list (check embed terms and that each stream allows embedding)            | No                                                                                                                       |
| 4j    | Airport brief               | Short text combining weather, delays and traffic                                                                                                                            | Rule-based text built from 4b, 4f and 4a, no AI                                                         | No                                                                                                                       |
| 4k    | Security wait times         | Estimated wait per checkpoint, "Report your wait" button, average of the last 60 minutes, busy-hours chart                                                                  | Crowd-sourced reports                                                                                   | **Needs backend** (database). Gated on the backend decision. Never show invented numbers: use a "not enough data" state. |

## Phase 5: Personal features and polish

Split by whether a backend is needed.

| Phase | Feature                                                                                                         | Backend?                                          |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 5a    | Watchlist for flights, airports and aircraft, saved in the browser (`localStorage`)                             | No                                                |
| 5b    | In-app alerts for takeoff, landing and emergency squawk on watched items (work only while the tab is open)      | No                                                |
| 5c    | Recently viewed flights                                                                                         | No                                                |
| 5d    | Follow chase-cam: a 3D follow view behind the selected aircraft (basic follow mode and 3D trails already exist) | No                                                |
| 5e    | Loading skeletons, error and rate-limit states                                                                  | No                                                |
| 5f    | Accessibility pass (keyboard, focus, contrast, screen reader labels, reduced motion)                            | No                                                |
| 5g    | Sign-in (email, Google) and cloud sync of the watchlist                                                         | **Needs backend**. Gated on the backend decision. |

## Phase 6: Pilot messages (ACARS)

Today: an on-demand card in the aircraft panel (6a, done). Guardrails stay in force until the legal review: on demand, plain text only, attributed, nothing stored, no real message text in the repo.

| Phase | Feature                                                               | Notes                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6a    | ACARS card in the panel                                               | Done.                                                                                                                                                                                                                                 |
| 6b    | Browse page                                                           | Recent Airframes messages, filter by label and text, same on-demand guardrails.                                                                                                                                                       |
| 6c    | Plain-English decoding by rules                                       | A dictionary of message labels and common abbreviations with an "explained by SkyDeck rules" tag. No AI, nothing leaves the browser. Recommended before any AI.                                                                       |
| 6d    | Original vs summary view                                              | Expandable "Original received message" (monospaced, exactly as received, copyable) next to the explanation, with metadata fields shown separately and "unavailable" where a field is missing. Messages marked partial or undecodable. |
| 6e    | Own receiver                                                          | Viewer for the output of a decoder Sri runs (`acarsdec` or `dumpvdl2`). Needs a VHF receiver, a different band from ADS-B.                                                                                                            |
| 6f    | AI summaries                                                          | **Gated.** Needs a language-model provider, which means a key or a cost, and sends message text to a third party (a form of republishing). Revisit only after the legal review; label clearly as AI-generated.                        |
| 6g    | Message notifications                                                 | Notification levels for watched aircraft. Depends on 5b.                                                                                                                                                                              |
| 6h    | Message history and flight-day search                                 | **Gated.** Needs stored messages, which today's "nothing stored" rule forbids. Needs the legal review and a backend.                                                                                                                  |
| 6i    | Curated "interesting message" feed (diversions, medical, maintenance) | Not recommended: it highlights the most sensitive messages. See the last section.                                                                                                                                                     |

## Phase 7: Aviation weather layers

All are map overlays that must survive a basemap switch.

| Phase | Feature                     | Candidate data (unverified)                                                     |
| ----- | --------------------------- | ------------------------------------------------------------------------------- |
| 7a    | Precipitation radar         | A free radar tile source (check terms, keyless, attribution)                    |
| 7b    | Radar timeline              | Same source, past frames; forecast frames labelled as forecasts                 |
| 7c    | Echo tops                   | NOAA data products (check format and cost of tiling)                            |
| 7d    | Lightning                   | A community lightning network (check terms; some forbid reuse), coloured by age |
| 7e    | PIREPs, SIGMETs, turbulence | aviationweather.gov data (to verify)                                            |
| 7f    | Winds aloft                 | NOAA model data (heavy; may need pre-processing, so possibly out of scope)      |

## Phase 8: Routes, terrain and airspace

| Phase | Feature                               | Notes                                                                                                               |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 8a    | Route line for the selected flight    | Origin and destination from the existing route lookup, great-circle line, labelled as an approximation.             |
| 8b    | Terrain profile                       | Elevation along the track and the route, using the AWS terrain tiles we already load. Optional PIREP overlay later. |
| 8c    | Temporary flight restriction polygons | FAA TFR data (to verify format and terms). Educational, not for planning.                                           |
| 8d    | Airspace boundaries                   | Class B/C/D outlines from open data (to verify).                                                                    |
| 8e    | Filed-route waypoints                 | Needs filed flight plans, which free sources rarely provide. Likely Not available; keep as a stretch goal.          |

## Phase 9: History and replay

| Phase | Feature                   | Notes                                                                                                                                                                                                           |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9a    | Session replay            | Replay what the browser has recorded since the page opened (trails already build live). No backend.                                                                                                             |
| 9b    | 30-day flight replay      | Needs stored position history. Candidate: adsb.lol historical dumps (ODbL, share-alike and attribution apply). Heavy; **Needs backend or pre-processing**. Gated.                                               |
| 9c    | Aircraft incident history | Per-airframe record of past incidents with date, description and source. Needs a licensed data source (not identified); show records as documented events, never as a safety rating. Gated on finding a source. |

## Phase 10: Alerts

| Phase | Feature                                                               | Backend?                                                                                           |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 10a   | Emergency squawk banner                                               | Done in Phase 1.                                                                                   |
| 10b   | Alert rules (altitude, type, region, callsign) checked in the browser | No (tab open only)                                                                                 |
| 10c   | Map-drawn alert areas                                                 | No                                                                                                 |
| 10d   | Military and government aircraft alerts                               | No. Candidate: database flags in the ADS-B provider output (verify they are present and reliable). |
| 10e   | Natural-language alert creation                                       | A small rule parser first (no AI); an AI version is **Gated** like 6f.                             |
| 10f   | Notifications when the tab is closed (web push)                       | **Needs backend**. Gated.                                                                          |

## Phase 11: My flights (personal flight companion)

| Phase | Feature                         | Notes                                                                                                                     |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 11a   | Track a flight in progress      | Add a callsign and show its stage (pushback, takeoff, cruise, descent, landing) inferred from ADS-B. No backend.          |
| 11b   | Inbound aircraft                | The aircraft expected to operate a flight needs schedule data, which free sources rarely have. Gated on finding a source. |
| 11c   | Clearance, gates, baggage claim | Needs airline and airport systems data; likely Not available for free.                                                    |
| 11d   | Lock-screen style updates       | iOS Live Activities have no web equivalent. A web push version needs a backend (see 10f).                                 |

## Phase 12: 3D and visuals

| Phase | Feature                           | Notes                                                                                         |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| 12a   | Expanded aircraft silhouettes     | More shapes per type, in the 2D icons.                                                        |
| 12b   | 3D aircraft models                | Generic models by category, with licences checked for any model assets.                       |
| 12c   | 3D airports                       | Builds on 4e and the existing 3D buildings.                                                   |
| 12d   | Landing gear and airline liveries | Not planned: liveries are airline trademarks, and gear animation has no reliable data source. |

## Phase 13: Collection and gamification

Local to the browser unless Phase 5g exists.

| Phase | Feature                                                                 |
| ----- | ----------------------------------------------------------------------- |
| 13a   | Collect aircraft types and registrations you have selected              |
| 13b   | Achievements                                                            |
| 13c   | Challenges (for example, "find a helicopter, a glider and a heavy jet") |

## Phase 14: Insights

Rule-based first. AI is Gated (cost, key, third-party text).

| Phase | Feature                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| 14a   | Per-flight facts card (route, distance, phase of flight, time to destination) |
| 14b   | Airport brief (see 4j)                                                        |
| 14c   | AI insights (Gated like 6f)                                                   |

## Phase 15: Platform and release

| Phase | Feature                                                                                      |
| ----- | -------------------------------------------------------------------------------------------- |
| 15a   | Self-hosted fonts (see Phase 0)                                                              |
| 15b   | Cloudflare Workers deployment, including a working preview and caching behaviour per isolate |
| 15c   | Installable PWA and offline shell                                                            |
| 15d   | Performance: split the large map chunk (about 1 MB)                                          |
| 15e   | Legal pages: about, privacy, terms, disclaimer, takedown contact                             |
| 15f   | End-to-end tests of the main flows                                                           |
| 15g   | Optional: units and language settings beyond aviation, metric and imperial                   |

## Suggested order

1. **Phase 0 blockers** that need only Sri's decisions (Esri, fonts, credits).
2. **Phase 4a to 4c, 4j**: airport pages, weather, nearby airports. No backend, big visible value.
3. **Phase 5a, 5b, 5e, 5f**: local watchlist, alerts, states and accessibility.
4. **Phase 8a, 8b**: route line and terrain profile (uses data already loaded).
5. **Phase 7a, 7b**: radar, after verifying a source.
6. **Phase 6b to 6d**: ACARS browse and explanations, after the legal review.
7. **Phase 9a, 10b to 10d, 11a**: replay, alerts, own flights.
8. Everything **Gated** waits for its decision: backend, AI provider, legal review, data sources.

## Decisions Sri needs to make

1. **Backend or not.** Unlocks 4k, 5g, 6h, 9b, 10f, 11d. The current rule is "no backend". Local-only versions exist for most features.
2. **AI or not.** Unlocks 6f, 10e (AI version), 14c. Needs a provider, a key or cost, and sending text to a third party.
3. **Esri, airplanes.live and Airframes** decisions (Phase 0).
4. **Whether Phase 2f (descent path)** is still wanted and what it means.
5. **ACARS legal review** before anything beyond today's on-demand card goes public.

## Not planned

- Live air traffic control voice audio (not covered by the sources reviewed).
- Ticket booking, rebooking or any purchase flow.
- Airline liveries and landing gear animation.
- A "passenger drama" or "crew banter" message feed: it surfaces the most sensitive messages and adds legal and privacy risk.
- A general-purpose aviation chatbot.
- Any claim that data is complete, certified or suitable for navigation or flight planning.
- Social profiles, leaderboards and photo uploads.
