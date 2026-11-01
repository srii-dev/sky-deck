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
- Live ADS-B data is fetched only through `createServerFn` proxies in `src/lib/adsb.functions.ts` (adsb.lol → airplanes.live → OpenSky fallback, ~5 s in-memory cache); the browser never calls ADS-B providers directly, to avoid CORS and keep provider changes in one place.
- MapLibre is loaded only via `React.lazy` behind `<ClientOnly>` (`src/components/skydeck/FlightMap.tsx`); shared map types live in `map-config.ts` so SSR never imports maplibre-gl.
- Map overlays (aircraft, trails, terrain, buildings) are re-installed in the `style.load` handler, because switching basemaps replaces the whole style.
- Aircraft positions are interpolated client-side by dead-reckoning from speed/track with an easing correction on each poll; polling cadence lives in `use-aircraft-feed.ts`.
- Only free, keyless tile sources (OpenFreeMap, Esri imagery, AWS Terrarium DEM) are used.
- Responsive variants (desktop side panel vs mobile bottom sheet) switch with CSS breakpoints, not JS, so SSR and first paint match.
- App name lives in `src/config/brand.ts`.
