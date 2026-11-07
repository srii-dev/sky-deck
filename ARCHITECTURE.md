# Architecture

A short map of SkyDeck. The binding rules are in `AGENTS.md`; the plan is in `dev-plan.md`; user-facing behaviour is in the README.

## Stack

TanStack Start (React 19, TanStack Router and Query), Vite, Tailwind CSS 4, shadcn/ui, MapLibre GL JS, Vitest with Testing Library. The target host is Cloudflare Workers (through Nitro); nothing is deployed yet.

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

- The browser never calls ADS-B providers directly. Server functions do, so provider changes stay in one place and CORS is not an issue.
- Views are covered by fixed tiles (fine, medium, a snapped single circle, or the wide 350 nm lattice) so visitors looking at the same area ask for the same tiles and share the server cache.
- The server cache is 5 s; a cached tile is aged before it is sent; a busy provider is answered from a tile up to 30 s old; a failed fetch never returns a cache entry older than 30 s.
- All caches, pacing and request sharing live in one server instance (an isolate on Workers). A cross-instance store is planned (plan item 19h).
- The map moves aircraft between polls by dead reckoning from speed and track, capped at 40 s. A smoother delayed-playback display is planned (Phase 20).

## Other data

- Routes: server function, static route data from adsb.lol, one-hour caches.
- ACARS: fetched on demand directly from the browser from the public Airframes API (the one exception to the proxy rule), plain text only.
- Airports: a short hand-picked list (code search) and about 4,500 airports from OurAirports, loaded on demand.
- Map tiles, terrain and imagery: free keyless third-party tile services. The credit list is in `src/lib/credits.ts`.

## Map

MapLibre loads only through `React.lazy` behind `<ClientOnly>` (`FlightMap.tsx`), and shared map types live in `map-config.ts`, so server rendering never imports `maplibre-gl`. Overlays are re-installed in the `style.load` handler because switching basemaps replaces the whole style.

## Responsive design

Desktop side panel and mobile bottom sheet are both in the DOM; CSS breakpoints choose one, so server render and first paint match.

## Backend (planned, Phase 18)

- Sign-in and user data: Supabase (Postgres with row-level security, email and Google sign-in). Migrations are in `supabase/migrations/`; no project exists yet.
- Hosting, caching and AI: Cloudflare (Workers deployment, shared cache, Workers AI as the AI fallback). Gemini is the first AI provider.
- FAA NOTAMs: a small always-on service reads the FAA SWIM feed and stores NOTAMs in MongoDB Atlas (free tier). The app reads them through that service or a cache.
- Secrets: server-side environment variables only, read through `src/lib/server-config.server.ts`. `.env.example` lists names, never values. A variable that starts with `VITE_` is sent to every browser and must never hold a secret.

## Operations

`.github/workflows/ci.yml` runs the four checks on every pull request. `GET /api/health` is the uptime-check target. Errors that reach the root error boundary are written to the server log as `[client-error]` lines. Feature flags are in `src/lib/flags.ts`.

## Decisions worth knowing

- OpenSky Network is not a provider: its terms require a written licence for operational use.
- ACARS stays on demand and browser-direct, plain text only, nothing stored, until the legal review and the Airframes answer are in.
- A backend (Supabase for sign-in and data, Cloudflare for hosting, caching and AI) is allowed and planned in Phase 18; secrets are server-side only.
- Educational and hobby use only: no navigation, flight planning or safety claims.
