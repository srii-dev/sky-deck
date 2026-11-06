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
- Lint: 81 problems (72 Prettier errors, 9 warnings: 6 `react-refresh/only-export-components`, 3 unused `react-hooks/exhaustive-deps` disables). Not fixed.
- The MapLibre chunk is over 500 kB (`FlightMap` about 1077 kB in the latest production build).

Planned, not built:

- Glide range and reachable airports
- ADS-B decoder
- ACARS
- Airport pages
- Replay
- Alerts
