<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Live ADS-B data is fetched only through `createServerFn` proxies in `src/lib/adsb.functions.ts` (adsb.lol → airplanes.live fallback, ~5 s in-memory cache); the browser never calls ADS-B providers directly, to avoid CORS and keep provider changes in one place. OpenSky Network is intentionally not a provider: its terms require a written license for operational REST API use, so do not re-add it without one.
- MapLibre is loaded only via `React.lazy` behind `<ClientOnly>` (`src/components/skydeck/FlightMap.tsx`); shared map types live in `map-config.ts` so SSR never imports maplibre-gl.
- Map overlays (aircraft, trails, terrain, buildings) are re-installed in the `style.load` handler, because switching basemaps replaces the whole style.
- Aircraft are drawn a few seconds in the past and interpolated between real position reports (`src/lib/smooth-motion.ts`); dead reckoning from speed/track only runs past the newest report, capped, then the aircraft is held and dimmed; the delay adapts to measured update lateness; polling cadence lives in `use-aircraft-feed.ts`.
- Map tiles come only from free, keyless tile sources (OpenFreeMap, Esri imagery, AWS Terrarium DEM).
- A backend is allowed (decision 2026-11-07): Supabase (sign-in, data, row-level security) and Cloudflare (hosting, caching, AI). Secrets live only in server-side environment variables, read through `src/lib/server-config.server.ts`; never in the repo, the browser bundle (no secret may start with `VITE_`) or logs. The Supabase URL and anon key are public by design and reach the browser through `getAuthConfig` (`src/lib/auth-config.functions.ts`); the service role key never does. Database changes are migrations in `supabase/migrations/` with row-level security on every table, and every `security definer` function revokes public execute.
- Responsive variants (desktop side panel vs mobile bottom sheet) switch with CSS breakpoints, not JS, so SSR and first paint match.
- App name lives in `src/config/brand.ts`.
- Aircraft category (`kind`/`kindLabel`) is assigned server-side in `adsb.functions.ts` via `classifyAircraft` (`src/lib/aircraft-kind.ts`), so map icons, the panel and future features read one stored value.
- Exception to the proxy rule above: ACARS messages are fetched on demand, straight from the browser, from the public Airframes API (`src/lib/airframes-client.ts`, anonymous, no key). Each visitor then has their own rate-limit budget and no message passes through or is stored on our server. Keep it on demand, plain-text-only and attributed. Do not proxy, store or republish messages without revisiting Airframes' terms and the legal notes in the README.
- Upstream ADS-B requests are spaced per provider (`PROVIDER_MIN_GAP_MS`) and identical in-flight requests are shared (`src/lib/request-control.ts`). This is per server instance only.
