# Architecture

A short map of SkyDeck. The binding rules are in `AGENTS.md`; the plan is in `dev-plan.md`; user-facing behaviour is in the README.

## Stack

TanStack Start (React 19, TanStack Router and Query), Vite, Tailwind CSS 4, shadcn/ui, MapLibre GL JS, Vitest with Testing Library. It runs on Cloudflare Workers (through Nitro); the preview is https://skydeck.sky-deck.workers.dev, deployed by hand (`DEPLOY.md`).

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
- On Cloudflare the feed loader runs inside one global Durable Object, `FeedHub` (`src/server/feed-hub.ts`, binding `FEED_HUB`, SQLite class as the free plan requires). Every Worker instance hands feed requests to it (`src/lib/feed-hub.server.ts`), so the tile cache, provider pacing, shared in-flight requests and the refresh budget are global. If the object fails, or in dev and tests where the binding is missing, the feed loads in the calling instance. Other caches (routes, airports, weather, AI) are still per instance.
- The map draws aircraft a few seconds in the past (Phase 20, src/lib/smooth-motion.ts): each aircraft keeps its recent position reports with their true times, and the drawn position is interpolated between two real reports. Dead reckoning from speed and track only runs past the newest report, capped at 30 s, and then the aircraft is held and dimmed. The delay adapts to how late updates really arrive (default about 10 s, slow changes only), and Settings has a Live option with a shorter delay. Aircraft missing from the data stay as fading ghosts for 60 s.

## Other data

- Routes: server function, static route data from adsb.lol, one-hour caches.
- ACARS: fetched directly from the browser from the public Airframes API (the one exception to the proxy rule), plain text only: per aircraft on a button press, and the latest messages from all aircraft while the ACARS panel is open. The panel's AI headlines and stories send message text through `src/lib/acars-ai.functions.ts` to Workers AI, then Gemini; nothing is stored. Alert colours come from fixed rules (`src/lib/acars-alert.ts`).
- Airports: a short hand-picked list (code search) and about 4,500 airports from OurAirports, loaded on demand.
- Map tiles, terrain and imagery: free keyless third-party tile services. The credit list is in `src/lib/credits.ts`.

## Map

MapLibre loads only through `React.lazy` behind `<ClientOnly>` (`FlightMap.tsx`), and shared map types live in `map-config.ts`, so server rendering never imports `maplibre-gl`. Overlays are re-installed in the `style.load` handler because switching basemaps replaces the whole style. Terrain, hillshade and 3D buildings are added after the first idle (or 3 s) so the base map appears first. Below zoom 8, aircraft are thinned on a screen grid (`src/lib/declutter.ts`): one per cell, selected and emergency aircraft first.

## Responsive design

Desktop side panel and mobile bottom sheet are both in the DOM; CSS breakpoints choose one, so server render and first paint match.

## Backend (Phase 18)

Status 2026-11-09: a Supabase project exists; email sign-in works end to end in the browser (`src/hooks/use-auth.ts`, `AccountDialog`). The browser gets the project URL and anon key from the server function `getAuthConfig`, so no `VITE_` variable is needed. Account deletion is the database function `delete_my_account()` (signed-in users only). `src/lib/ai-service.ts` is the AI wrapper (budgets, cache, fallback), set up in `src/lib/ai.server.ts` and used by the ACARS panel, and `src/lib/rate-limit.ts` the per-visitor limiter. Still planned: the shared cache and scheduled jobs (18f), seed data (18i) and Google sign-in.

- Sign-in and user data: Supabase (Postgres with row-level security, email sign-in; Google sign-in planned). Migrations are in `supabase/migrations/`.
- Hosting, caching and AI: Cloudflare (Workers deployment, shared cache planned). AI: Workers AI first (binding `AI`, Llama 4 Scout), Gemini as the fallback when `GEMINI_API_KEY` is set (decision 2026-11-22).
- FAA NOTAMs: a small always-on service reads the FAA SWIM feed and stores NOTAMs in MongoDB Atlas (free tier). The app reads them through that service or a cache.
- Secrets: server-side environment variables only, read through `src/lib/server-config.server.ts`. `.env.example` lists names, never values. A variable that starts with `VITE_` is sent to every browser and must never hold a secret.

## AI (decision 2026-11-23)

- `src/server/ai-hub.ts` (class `AiHub`, binding `AI_HUB`, one object named `global`) runs the AI service. `getAiService()` in `src/lib/ai.server.ts` routes `generate` and the ACARS headline batches through it and falls back to local work when the binding is missing, the call fails or no provider is set up. Results cross the object as a result union and are rethrown as `AiUnavailableError`. Only pacing counters (calls per provider and day, pauses) are saved to its storage; ACARS text, headlines and AI answers stay in memory.
- Callers: `explainAcars` and `describeAcarsBatch` (`src/lib/acars-ai.functions.ts`), `explainAirport` (`src/lib/airport-ai.functions.ts`), `explainFlight` (`src/lib/flight-ai.functions.ts`; prompt and fact summary in `src/lib/flight-ai.ts`, UI `FlightAiBrief.tsx` after Flight facts). All are rate limited per visitor and send `no-store`.

## Operations

`.github/workflows/ci.yml` runs the four checks on every pull request. `GET /api/health` is the uptime-check target. Errors that reach the root error boundary are written to the server log as `[client-error]` lines. Feature flags are in `src/lib/flags.ts`.

## Decisions worth knowing

- OpenSky Network is not a provider: its terms require a written licence for operational use.
- ACARS stays browser-direct, plain text only and nothing stored, until the legal review and the Airframes answer are in. Since 2026-11-22 message text may pass through the server to the AI providers for descriptions (not stored or logged).
- A backend (Supabase for sign-in and data, Cloudflare for hosting, caching and AI) is allowed and planned in Phase 18; secrets are server-side only.
- Educational and hobby use only: no navigation, flight planning or safety claims.
