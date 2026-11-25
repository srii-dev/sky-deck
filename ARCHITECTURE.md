# Architecture

A short map of SkyDeck. The binding rules are in `AGENTS.md`; the plan is in `dev-plan.md`; user-facing behaviour is in the README.

## Stack

TanStack Start (React 19, TanStack Router and Query), Vite, Tailwind CSS 4, shadcn/ui, MapLibre GL JS, Vitest with Testing Library. It runs on Cloudflare Workers (through Nitro); the preview is https://skydeck.sky-deck.workers.dev, deployed by hand from `main` (`DEPLOY.md`); `dev` is the working branch and is never deployed.

## Data flow for live aircraft

```
Browser (map, panel)                       src/hooks/use-aircraft-feed.ts, src/components/skydeck/
   |  plans fixed tiles for the view       src/lib/coverage.ts
   v
Server function getAircraftFeed            src/lib/adsb.functions.ts
   |  snaps the request, checks the cache  src/lib/adsb-sources.ts (loadFeedCached)
   v
Providers: adsb.lol, then airplanes.live   paced, backed off, shared in flight (src/lib/request-control.ts)
```

- adsb.lol refuses keyless requests from Cloudflare's shared addresses (HTTP 429); the optional server secret `ADSBLOL_API_KEY` is sent as `x-api-key`. With a key, every request to adsb.lol is counted against the free key's published limits (`src/lib/quota-guard.ts`: about 85% of 20 per 30 s, 120 per minute, 300 per hour, 1,000 per day, 5,000 per week, 30,000 per month) and a request that would go over is not sent. Refreshes of tiles that already have a copy are paced by `QuotaGuard.takeRefresh`: what is left in each window, less a reserve of 6 for tiles with no copy, is spread evenly until the window ends, and copies up to an hour old are served with their real age in between. The counter lives in the `FeedHub` object and is saved to its storage; requests made outside it (routes, search) are counted per instance only.

- The browser never calls ADS-B providers directly. Server functions do, so provider changes stay in one place and CORS is not an issue.
- Views are covered by fixed tiles (fine, medium, a snapped single circle, or the wide 350 nm lattice) so visitors looking at the same area ask for the same tiles and share the server cache.
- The server cache is 5 s; a cached tile is aged before it is sent; a busy provider is answered from a tile up to 30 s old; a failed fetch never returns a cache entry older than 30 s.
- On Cloudflare the feed loader runs inside one global Durable Object, `FeedHub` (`src/server/feed-hub.ts`, binding `FEED_HUB`, SQLite class as the free plan requires). Every Worker instance hands feed requests to it (`src/lib/feed-hub.server.ts`), so the tile cache, provider pacing, shared in-flight requests and the refresh budget are global. If the object fails, or in dev and tests where the binding is missing, the feed loads in the calling instance. Other caches (routes, airports, weather) are still per instance; AI answers are shared through `AiHub` (see AI below).
- The map draws aircraft a few seconds in the past (Phase 20, src/lib/smooth-motion.ts): each aircraft keeps its recent position reports with their true times, and the drawn position is interpolated between two real reports. Dead reckoning from speed and track only runs past the newest report, capped at 30 s, and then the aircraft is held and dimmed. The delay adapts to how late updates really arrive (default about 10 s, slow changes only), and Settings has a Live option with a shorter delay. Aircraft missing from the data stay as fading ghosts for 60 s.

## Other data

- Routes: server function, static route data from adsb.lol, one-hour caches.
- ACARS: fetched directly from the browser from the public Airframes API (the one exception to the proxy rule), plain text only: per aircraft on a button press, and the latest messages from all aircraft while the ACARS panel is open. The panel's AI headlines and stories send message text through `src/lib/acars-ai.functions.ts` to Workers AI, then Gemini; nothing is stored. Alert colours come from fixed rules (`src/lib/acars-alert.ts`).
- Airports: a short hand-picked list (code search) and about 4,500 airports from OurAirports, loaded on demand.
- Map tiles, terrain and imagery: free keyless third-party tile services. The credit list is in `src/lib/credits.ts`.

## Map

MapLibre loads only through `React.lazy` behind `<ClientOnly>` (`FlightMap.tsx`), and shared map types live in `map-config.ts`, so server rendering never imports `maplibre-gl`. Overlays are re-installed in the `style.load` handler because switching basemaps replaces the whole style. Terrain, hillshade and 3D buildings are added after the first idle (or 3 s) so the base map appears first. Below zoom 8, aircraft are thinned on a screen grid (`src/lib/declutter.ts`): one per cell, selected and emergency aircraft first.

Map page speed (2026-11-25, #107):

- The map library is requested only after the first paint (`src/hooks/use-after-paint.ts`; on a first visit also after the first-run guide's fade-in), so the page chrome shows first on a slow phone.
- The aircraft loop runs on a timer (`FRAME_MS`, about 90 ms) aligned to the next frame, not on a bare `requestAnimationFrame` loop, and `src/lib/redraw-gate.ts` skips the `setData` call unless an aircraft moved by at least 1 px at the current zoom, turned by 2 degrees or changed its look. Positions are compared with the last drawn frame, so slow movement still adds up. Label cross-fading is off (`fadeDuration: 0`), because it kept MapLibre repainting after every update.
- `@supabase/supabase-js` is imported on first use (`src/lib/supabase-client.ts`), so visitors who never sign in do not download it.

If the basemap style cannot be fetched (OpenFreeMap down or blocked), `FlightMap.tsx` switches to a plain background style in the basemap's colours (`fallbackStyle`). Without any loaded style MapLibre draws no aircraft and runs no camera moves, so saved views, search results and airports would do nothing (#110).

## Responsive design

Desktop side panel and mobile bottom sheet are both in the DOM; CSS breakpoints choose one, so server render and first paint match.

On phones an open sheet publishes its height as `--sheet-h` on the root element (`src/hooks/use-sheet-inset.ts`), and `styles.css` lifts MapLibre's zoom buttons, scale and credit above it, or hides them (`data-sheet-tall`) when the sheet leaves no room. The feed notices are rendered once and placed with CSS (under the top bar on phones). With the ruler on, the emergency banner sits below the ruler bar's measured height. Focus is given back to the element that opened a panel or dialog when it closes, including dialogs opened from other dialogs and the ACARS panel (`src/lib/return-focus.ts`).

## Backend (Phase 18)

Status 2026-11-25: a Supabase project exists; email sign-in works end to end in the browser (`src/hooks/use-auth.ts`, `AccountDialog`). The browser gets the project URL and anon key from the server function `getAuthConfig`, so no `VITE_` variable is needed. Account deletion is the database function `delete_my_account()` (signed-in users only). Tables: `profiles`, `watchlist_items` (at most 50 per user, a trigger), `recent_flights` (15, trimmed by a trigger), and for web push `push_subscriptions` (5 browsers) and `push_rules` (20 rules); the push migrations are not applied to the live project yet (`DEPLOY.md`). Signing in merges this browser's watchlist into the account (`src/lib/cloud-merge.ts`) and uploads only the items that fit under the 50 limit, with a notice naming the rest (#109). `src/lib/ai-service.ts` is the AI wrapper (budgets, cache, fallback), set up in `src/lib/ai.server.ts`, and `src/lib/rate-limit.ts` the per-visitor limiter. The shared cache (`FeedHub`, `AiHub`) and the first scheduled jobs (below) are built. Still planned: the nightly data refresh and SWIM consumer (18f), seed data (18i) and Google sign-in.

- Sign-in and user data: Supabase (Postgres with row-level security, email sign-in; Google sign-in planned). Migrations are in `supabase/migrations/`.
- Hosting, caching and AI: Cloudflare (Workers deployment, shared cache in Durable Objects, AI). AI: Workers AI first (binding `AI`, Llama 4 Scout), Gemini as the fallback when `GEMINI_API_KEY` is set (decision 2026-11-22).
- FAA NOTAMs (planned, not built): a small always-on service would read the FAA SWIM feed and store NOTAMs in MongoDB Atlas (free tier); the app would read them through that service or a cache. Where it runs is not decided.
- Secrets: server-side environment variables only, read through `src/lib/server-config.server.ts`. `.env.example` lists names, never values. A variable that starts with `VITE_` is sent to every browser and must never hold a secret.

## AI (decision 2026-11-23)

- `src/server/ai-hub.ts` (class `AiHub`, binding `AI_HUB`, one object named `global`) runs the AI service. `getAiService()` in `src/lib/ai.server.ts` routes `generate` and the ACARS headline batches through it and falls back to local work when the binding is missing, the call fails or no provider is set up. Results cross the object as a result union and are rethrown as `AiUnavailableError`. Only pacing counters (calls per provider and day, pauses) are saved to its storage; ACARS text, headlines and AI answers stay in memory.
- Callers: `explainAcars` and `describeAcarsBatch` (`src/lib/acars-ai.functions.ts`), `explainAirport` (`src/lib/airport-ai.functions.ts`), `explainFlight` (`src/lib/flight-ai.functions.ts`; prompt and fact summary in `src/lib/flight-ai.ts`, UI `FlightAiBrief.tsx` after Flight facts). All are rate limited per visitor and send `no-store`.

## Scheduled jobs and closed-page alerts (2026-11-25)

Cron triggers are declared in `vite.config.ts` (`triggers.crons`) and handled by two Nitro runtime plugins on the `cloudflare:scheduled` hook; each ignores the other's cron. The Free plan allows 5 cron triggers per account.

- `17 4 * * *`, `src/server/keepalive.plugin.ts` and `src/lib/supabase-keepalive.server.ts` (18f): one anonymous read of `profiles` (row-level security returns no row) so the free Supabase project is not paused after a week without activity. Logs `[keepalive]` with the status only.
- `*/2 * * * *`, `src/server/push-cron.ts` (10f): calls `check()` on the global `PushHub` object, but only when `VAPID_PRIVATE_KEY` is set. Logs `[push-check]` with counts only.

Closed-page alerts (web push), end to end:

```
Alert rules dialog (switch)        src/hooks/use-push-alerts.ts, src/lib/push-client.ts
   |  permission, PushManager.subscribe with the VAPID public key (getPushConfig, src/lib/push.functions.ts)
   v
Supabase push_subscriptions, push_rules (own rows, row-level security, limits in triggers)
   ^
   |  service role key, REST, 10 s timeouts      src/lib/push-store.server.ts
PushHub.check() every 2 min                     src/server/push-hub.ts, src/lib/push-alerts.ts
   |  rule areas -> feed circles through FeedHub (at most 20), rule matching, cooldowns
   v
Browser push services (Google, Mozilla, Apple)  src/lib/web-push.ts (VAPID JWT, aes128gcm, Web Crypto only)
   v
public/sw.js: shows the notification; a click opens /?... on the aircraft (same-site paths only)
```

- Only rules with an area up to 250 nm (`PUSH_MAX_AREA_NM`) are checked while the page is closed; the browser keeps the account's copy equal to its own eligible rules while the switch is on.
- Limits per check: 300 rules, 20 feed circles, 20 pushes (6 per user, 3 notifications per user with the rest folded into "and N more"). Every user's first rule is taken before anyone's second, so one account cannot use up the circles. Push requests never follow redirects, and endpoints are accepted only on the known browser push services.
- `PushHub` keeps which aircraft match each rule in memory and saves only the cooldowns (rule, aircraft code, time, dropped after an hour). One global object means two overlapping cron runs never send the same alert twice. An alert that reached none of a user's browsers is retried on the next check; a subscription the push service reports gone is deleted.
- Signed VAPID tokens are cached per push service. The key pair must never change: every saved subscription belongs to it.
- Without the four settings (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY`) `getPushConfig` answers `configured: false`, the dialog says the switch is not available, and the cron does nothing.

Durable Objects on the Worker (all SQLite classes, the only kind on the Free plan; tags in `vite.config.ts`, never edited): `FeedHub` (`v1`), `AiHub` (`v2`), `PushHub` (`v3`). Cloudflare refuses a rollback across a class change, so the first deploy of each new tag is one-way (`DEPLOY.md`, "Roll back").

## Operations

`.github/workflows/ci.yml` runs the four checks on every pull request, then the browser tests against the dev server and against the production build in Cloudflare's local runtime; `.github/workflows/claude-review.yml` adds an advisory review; `.github/workflows/uptime.yml` checks the live site on a schedule from `main`. `GET /api/health` is the uptime-check target. Errors that reach the root error boundary are written to the server log as `[client-error]` lines. Server log lines carry a tag: `[client-error]`, `[csp-report]`, `[keepalive]`, `[push-check]` and, in development, `[request aborted]` for a request the browser dropped (`src/lib/error-capture.ts`). In the browser console, `[map]` warns when the basemap style could not be loaded. Feature flags are in `src/lib/flags.ts`.

Development server (`vite.config.ts`, dev-plan 0h): four dependencies that Vite would only find after the first load are pre-bundled (`optimizeDeps.include`), every `src/lib/*.functions.ts` is compiled at start-up (`server.warmup.ssrFiles`) so an early server function call does not fail with "Invalid server function ID", and the MapLibre worker is served unchanged (without Vite's live-reload client, which touched `document` inside the worker).

## Decisions worth knowing

- OpenSky Network is not a provider: its terms require a written licence for operational use.
- ACARS stays browser-direct, plain text only and nothing stored, until the legal review and the Airframes answer are in. Since 2026-11-22 message text may pass through the server to the AI providers for descriptions (not stored or logged).
- A backend (Supabase for sign-in and data, Cloudflare for hosting, caching and AI) is allowed and in use (Phase 18); secrets are server-side only.
- Web push is implemented in the app with Web Crypto (no `web-push` package at run time), so the same code runs on Cloudflare Workers, in Node and in tests without a dependency; `npx web-push` is used only once, on the owner's computer, to make the key pair.
- Educational and hobby use only: no navigation, flight planning or safety claims.
