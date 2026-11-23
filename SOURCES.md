# Research notes: backend, AI and data sources

Moved out of `dev-plan.md` on 2026-11-21. These are research results from 2026-11-07, not verified facts about today: terms were not fully read for most sources, and `DATA.md`, `src/lib/credits.ts` and the README hold what has been checked since.

## Backend and AI options (research)

### Backend

| Option | Free limits | Fits SkyDeck because | Watch out for |
| --- | --- | --- | --- |
| **Cloudflare Workers + D1 (+ KV)** | D1 free: 500 MB per database, 5 GB per account, 10 databases (official docs). Workers free plan limits apply. | Deploy target is already Cloudflare Workers; no extra vendor; Workers AI is built in (below). | No built-in auth: sign-in would need a library (a new dependency, so ask first). 21a free queries fail when daily row limits are exceeded (a changelog entry mentions a change from 2026-09-01; confirm on the official page). |
| **Supabase (Postgres + Auth)** | 500 MB database, 2 active projects, free projects pause after about a week of inactivity, 50,000 monthly active users (secondary sources, not the official page). | The original plan used it; ready-made email and Google sign-in; row-level security for crowd reports. | Pausing needs a keep-alive job or a manual restore. Second vendor and a client dependency. |

**Decided 2026-11-07 (backend): both.** Supabase for sign-in and the crowd-sourced data (it removes the hardest part), Cloudflare for hosting, caching and AI.

### Free AI (clears the old "AI gate")

| Option | Free allowance | Notes |
| --- | --- | --- |
| **Cloudflare Workers AI** | 10,000 Neurons per day on the Workers free plan, shared across models; resets 00:00 UTC (official Cloudflare docs, read 2026-11-07). Over that, requests fail until the reset. | No separate API key when called from a Worker (a binding); text models available; fits the Cloudflare deploy. Which models are free and the exact messages per day were not measured. |
| Google Gemini API free tier | Flash-class models with per-minute and per-day limits; sources disagree on the numbers and say Google's own pages are authoritative. | Needs an API key (server-side secret). Check whether free-tier prompts may be used to improve the provider's products before sending any message text. |
| Groq free tier | Limits vary by model and are set per organisation; sources list different numbers. | Needs a key. Fast, small daily pools. |
| OpenRouter free models | One secondary source says about 50 requests per day across free models. | Needs a key. Weakest guarantee. |

**Decided 2026-11-07 (AI): two providers, Gemini first and Cloudflare Workers AI as the fallback.** The server hides both behind one small "AI provider" interface: try Gemini first, and when Gemini returns its rate-limit or daily-cap error (or the server's own counter says the cap is reached), switch to Workers AI for the rest of that period. Each provider has its own budget counter, so the free pools add up. Sri will supply a Gemini API key. It is kept only as a server-side secret (a Cloudflare secret in production, an uncommitted local file in development): never pasted into chat, issues or pull requests, and never committed. Gemini's free limits must be read from Google's own pages before building (sources disagree). Free-tier prompts may be used by the provider, so no message text goes to Gemini until that is checked. If it is not acceptable, Workers AI becomes the only provider for message text. The cache is shared, so the provider that produced a summary is stored with it.

**Superseded 2026-11-22:** Workers AI is now first and Gemini the fallback, and the ACARS panel describes messages automatically (short headlines in batches, prioritised by alert level), not only on a button press. Results are cached per server instance, not in the database. The current rules are in `AGENTS.md` and `ARCHITECTURE.md`; the list below is the original plan.

How AI would be used so free quotas are enough:

- **On demand only** (a button), never automatic for every message or flight.
- **Cache every result** in the database, keyed by the message or flight, so each item is summarised at most once.
- **Daily budget cap** in the server: when the free pool is used up, show the rule-based text instead and say so.
- **Always labelled "AI-generated"**, with the original text one click away.
- **Fallback**: Phase 6c (rule-based explanations) works with no AI at all.
- Message text sent to an AI provider counts as sharing it with a third party; review that in the ACARS legal review.

## Data sources (research results)

| Need | Source | Verification | Findings and risks |
| --- | --- | --- | --- |
| METAR, TAF | aviationweather.gov Data API | **Tested** (JSON, keyless) | Docs: 100 requests per minute, no more than 1 request per minute per thread, custom User-Agent requested. No CORS header seen, so call it from the server. Cache for minutes. |
| SIGMET / AIRMET | aviationweather.gov `airsigmet` | **Tested** (JSON, keyless) | Same limits and server-side rule. |
| PIREPs | aviationweather.gov `pirep` | **Tested** (needs a bounding box or station list, else HTTP 400) | Query per view or per airport. |
| Winds aloft | aviationweather.gov wind/temperature product | Docs/search (not tested) | Confirm the endpoint and format. |
| Flight category (VFR / MVFR / IFR / LIFR) | Derived from METAR visibility and ceiling | Not a source; computed | Compute it ourselves, or use a field in the METAR JSON if present (not checked). |
| FAA airport delays, ground stops, closures | FAA NAS Status XML feed | **Tested** (200, XML, keyless) | No CORS header, so server side. Vendor pages call it public domain, but I did not find an FAA terms page. Cache for minutes. |
| D-ATIS | `datis.clowd.io` redirects to `atis.info/api/{ICAO}` | **Tested** (JSON, CORS open) | Covers only airports with D-ATIS (about 75 per sources). No terms page read. Treat the operator as a small community service. |
| Weather radar | RainViewer public API | **Tested** (JSON, CORS open) | Free tier is personal and educational use only, attribution required, max zoom 7, 100 requests per IP per minute, no future (nowcast) frames since 2026-01-01, tile path IDs are hashes. No availability guarantee. Fine for this non-commercial project; ask them before any commercial use. |
| Radar (US alternative) | NOAA / NWS `mapservices.weather.noaa.gov` MRMS base reflectivity (WMS) | Docs/search | US only; terms not found; contact `nws.mapservices@noaa.gov`. Possible fallback and the source for the radar timeline if RainViewer's limits do not fit. |
| Echo tops | Iowa State Mesonet OGC (NEXRAD echo tops over WMS), or NOAA MRMS GRIB2 files | Docs/search; MRMS file directory **tested** (200) | WMS is the easy route; raw GRIB2 would need server-side processing. US only. |
| Lightning | Blitzortung | Docs/search | Its own contact page limits use of its data to private and entertainment purposes, and it has no public API. **Do not use without explicit permission.** |
| Lightning (alternative) | NOAA GOES GLM data (netCDF) | Docs/search | Free, but needs a server-side job to grid and tile it. Heavy; treat as a stretch goal. |
| TFR polygons | Official FAA feed | **None found** | `tfr.faa.gov/tfr_map_ims/jsonTFRData.jsp` returned 404; `tfr3/export/json` returned a web page; a public ArcGIS "TFR public view" layer returned 0 features and was last edited in 2025. Options: filter FDC NOTAMs from the SWIM feed (above), or scrape tfr.faa.gov pages (terms unknown). |
| NOTAMs | FAA SWIM Cloud Distribution Service (SCDS), chosen 2026-11-07 | Docs/search (FAA support pages) | Free to consume. Needs two accounts (access agreement portal and the SCDS portal) and a signed Service Access Agreement per service; the FAA says account and subscription approval is automatic after that. Data arrives only through JMS queues (a persistent connection), not as web requests, so it needs a small always-on consumer service that writes into our database (Phase 18f). The agreement text, its terms for non-commercial use and which queue carries NOTAMs were not read. The FAA can end access if the rules are broken. The older FAA NOTAM API needs credentials and is being retired. |
| Airspace boundaries (Class B/C/D etc.) | FAA ArcGIS `Boundary_Airspace` FeatureServer | **Tested** (layer metadata, CORS open) | Updated about every 8 weeks (university metadata). Fetch once and cache; do not query per user. |
| Airport charts | FAA digital Terminal Procedures Publication (d-TPP) | Docs/search | Free; 28-day cycle; bulk download. No stable per-chart URL was confirmed, so link out to the FAA search first and host nothing. |
| Runways, frequencies | OurAirports (`runways.csv`, Unlicense) | Known from Phase 2d; not re-tested | Same dataset already used. |
| Gates, taxiways, terminals | OpenStreetMap aeroway features via OpenFreeMap tiles | Not tested | Check what the OpenFreeMap schema carries before promising gates. |
| Airport cameras | YouTube live embeds from a hand-curated list | Not tested | Each stream must allow embedding; the list needs upkeep. |
| TSA checkpoint waits | Official feed | **None found** | The old MyTSA wait-time endpoint did not respond, and a 2026 report says TSA's public tool was retired in 2023. Only crowd-sourced reports are possible (Phase 4k, uses the backend). |
| Military and government aircraft | ADS-B provider database flags | **Tested** (`/v2/mil` on adsb.lol returns aircraft with `dbFlags: 1`) | Our server code does not keep `dbFlags` yet; it must be added to the feed schema. Government flags not checked. |
| Aircraft incident history | NTSB accident data (US civil, 1962 onward, downloadable, searchable by registration) | Docs/search | Current download terms not confirmed. Aviation Safety Network: no terms found, assume no bulk use. Non-US coverage is missing. |
| Flight schedules, inbound aircraft | Free tiers of schedule APIs | Docs/search | Aviationstack free is 100 requests per month (too small); AeroDataBox and AirLabs limits not found. Not enough for a live feature; keep post-release. |
| Gates assignment, baggage claim | Airline and airport systems | **None found** | Not available for free. |
| Filed-route waypoints | Filed flight plans | Not researched; likely **None found** | Free ADS-B sources do not carry flight plans. |
| Aircraft photos | Planespotters photo API | **Tested** (returns 403 without a User-Agent that includes a contact URL; CORS open) | Needs a contact in the User-Agent; read their terms and attribution rules before use. |
| Historical positions | adsb.lol historical dumps (ODbL) | From the earlier terms review; not re-tested | Share-alike and attribution apply; large. |
| ACARS | Airframes API | Earlier review | Pre-release; terms still being finalised; send the email before launch. |
