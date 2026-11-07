# Roadmap

Phase 1 is done on `ide/phase1-fixes` and checked against the reports in `docs/plan-task3.md`, `docs/plan-phase1-finish.md`, `docs/plan-icon-fix.md`, and `docs/plan-throttling.md`.

Done and verified:

- Live map and aircraft panel (search, filters, trails, source and position age).
- Category icons, including fresh-load registration of the nine `sd-kind-*` images before the map goes idle (`d3eb1ee`). Glider, balloon, drone, and ground silhouettes were registered and were not in the live samples.
- Wide-area coverage of up to 6 circles of about 247 nm, with partial-view notice when more cells are needed.
- Polling aimed at 7 seconds after the previous refresh started.
- Provider fallback (adsb.lol, then airplanes.live) with per-provider back-off and a 9 second deadline. OpenSky was a third provider when Phase 1 was verified. It was removed later because its terms require a written license for operational API use (see the README).
- Emergency squawk confirmation on two independent fresh samples at least 5 seconds apart, ignoring `seenPos` over 30 seconds. Unit-tested. No live 7500/7600/7700 was on screen.
- Soft notices ("Using backup data source", "Some areas may be missing") and the hard "Data provider busy" notice when every planned circle fails.
- Terrain and buildings deferred until map idle, with a 3 second fallback. In the measured runs idle won and the 3 second timer did not install the scene. Layers sit below trails and aircraft.

Known issues:

- Wide-view throttling is reduced, not gone. Nearest three circles are fetched every poll; farther circles every other poll, and their last positions stay on the map. On one eastern North America view, mean failed circles on the five steady refreshes fell from 3.4 to 1.0, and aircraft stayed about 1400. A cold reload while providers were cooling logged 0 aircraft once. Logged statuses were 429 and 403, not timeouts or 5xx, so back-off is still immediate. Far-circle emergency confirmation is slower (about 14 to 21 seconds) because a cached sample does not count.
- `bun run preview` fails because the production build targets Cloudflare and does not emit `dist/server/server.js`.
- Lint: 0 errors and 8 warnings (the Phase 1 Prettier errors were fixed later). The warnings are `react-refresh` notes in shadcn files, an unused `eslint-disable` directive in `FlightMap.tsx` and a missing-dependency note. Not fixed.
- The MapLibre chunk is over 500 kB (`FlightMap` about 1056 kB in the latest production build).

## Phase map

The full plan, with what each feature needs and what happens when its data is missing, is in [`dev-plan.md`](dev-plan.md). Short version:

| Phase    | Area                                                                                | Status                                  |
| -------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| 1        | Live map, panel, icons, search, filters, fallback                                   | Done                                    |
| 2a to 2e | Glide ring, reachable airports, large airport list, nearest line                    | Done                                    |
| 2f       | Descent path                                                                        | Open, scope to confirm                  |
| 3a       | ADS-B message inspector (pasted frames)                                             | Done                                    |
| 3b, 3c   | Live receiver feed, more decoded fields                                             | Open (3b gated on receiver decisions)   |
| 4        | Airports: pages, weather, nearby, charts, cameras, FAA status, security waits       | Open (security waits need a backend)    |
| 5        | Watchlist, alerts, chase-cam, polish, sign-in                                       | Open (sign-in needs a backend)          |
| 6        | ACARS: card done (6a, earlier called "4a"); browse page, explanations, own receiver | 6a done, rest open (legal review first) |
| 7        | Weather layers (radar, lightning, PIREPs)                                           | Open, sources unverified                |
| 8        | Routes, terrain profile, TFRs, airspace                                             | Open                                    |
| 9        | Replay and aircraft incident history                                                | Open (30-day replay needs a backend)    |
| 10       | Alert rules, map-drawn areas, military and government aircraft                      | Open                                    |
| 11       | My flights                                                                          | Open, needs schedule data               |
| 12       | 3D visuals and silhouettes                                                          | Open                                    |
| 13       | Collection and achievements                                                         | Open                                    |
| 14       | Insights (rule-based first)                                                         | Open                                    |
| 15       | Platform: fonts, deployment, PWA, legal pages, tests                                | Open                                    |

Before any public launch: settle the Esri imagery terms, airplanes.live access, Airframes terms and the ACARS legal review (Phase 0 in `dev-plan.md`).
