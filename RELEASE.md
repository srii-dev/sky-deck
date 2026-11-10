# Release notes and checklist

Working document for Phase 17 (final testing and release). It records what was checked, what was not, and what must be decided before the site is made public. Dated 2026-11-09. Keep it short and honest: a box is ticked only when it was seen to be true.

## 1. Release checklist (17e)

Blockers carried over from Phase 0 (the status column in `dev-plan.md` has not been updated and is older than this list):

- [ ] **0a Esri satellite imagery terms**: not read. Keep, use a keyed source, or drop Satellite.
- [ ] **0b airplanes.live 403**: unresolved; adsb.lol is the working provider and airplanes.live the fallback.
- [ ] **0c Airframes anonymous API**: unresolved (email draft is local only).
- [ ] **0d ACARS legal review**: not done. The ACARS card is on demand and in the visitor's own browser, but a lawyer has not looked at it.
- [x] **0e Self-hosted fonts**: built in Phase 16a. The assistant downloaded the files before asking; the owner then approved keeping them (2026-11-09).
- [ ] **0f Credits wording**: matches the code, not checked against each source's current terms.
- [x] **0g Route data freshness**: wrong routes are detected and hidden (Phases 11 and 14).
- [ ] **0h Cold-start console errors**: not reproduced or fixed.
- [x] **0i Stale-cache quirk**: fixed earlier (see the changelog).
- [ ] **0j Cloudflare deployment**: nothing deployed (16b not built).
- [ ] **0k AGENTS.md and README wording**: backend rule updated; Lovable block still present (15a not done).

Other items:

- [ ] Lovable removed (15a). Needs the owner's OK and disconnecting the Lovable and GitHub link.
- [ ] Brand name and domain (15b, Decision 7).
- [ ] Legal pages read by the owner and a private contact added (16e).
- [ ] `SITE_URL` set once there is a domain (canonical links, sitemap).
- [ ] Monitoring and quota alarms for the free tiers: not set up (needs the hosting accounts).
- [ ] Supabase Auth Site URL set to the real address, and the Google sign-in decision made.
- [ ] A Content-Security-Policy tried in report-only mode (see section 2).

## 2. Security review (17b)

Checked on 2026-11-09:

- **Secrets**: no key-shaped strings in tracked files, no `.env` file tracked (only `.env.example`, names only), nothing key-shaped or named like a secret in the built browser files, no `VITE_` variable holds a secret (and the server refuses to start with one).
- **Input validation**: every server function validates its input with a schema (feed, search, route, airport, ATIS, airspace, weather, client error report).
- **Database**: row-level security is on for all three tables; every policy is limited to the signed-in user's own rows. Tested in a rolled-back transaction: a signed-in user can read and change only their own profile row. The database performance advisor flagged two profiles policies, fixed by migration `20261110000000_profiles_policies_initplan.sql`.
- **Database, accepted**: the security advisor warns that signed-in users can call `delete_my_account()`. That is the intended way to delete an account; the function only ever deletes the caller's own row (`auth.uid()`), has a fixed search path, and is not callable by anonymous visitors.
- **Dependencies**: `bun audit` reports one moderate advisory (minimatch, denial of service through patterns) in development tooling (eslint). It is not in the shipped app.
- **Headers (new)**: server and static responses now send `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- **Not done**: a Content-Security-Policy (the map needs workers, blobs and many tile hosts, and inline scripts are used for the theme and structured data), `frame-ancestors` (the Lovable preview embeds the page), Cross-Origin-Opener-Policy (a later sign-in popup may need it), rate-limit load testing, and a penetration test.

## 3. Quota and failure drills (17c)

| Situation                                     | What the visitor sees                                                                               | How it was checked                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Live aircraft provider rate-limits or is busy | "Live data is busy. Retrying…", the status shows LOADING, then recovers by itself and the map fills | Seen live on 2026-11-09 (caused by many quick reloads)                     |
| Airspace request fails                        | "Airspace data could not be loaded." toast, the rest of the map keeps working                       | Seen live (appears often in development; cause not found)                  |
| Route unknown or wrong                        | "Route not available", or the route is hidden with a note                                           | Unit tests and seen live                                                   |
| Browser storage blocked                       | Settings and collections last until the page closes                                                 | Unit tests                                                                 |
| AI quota used up (Gemini, Workers AI)         | Nothing: no feature calls the AI service yet                                                        | Code review; the wrapper has budgets and a kill switch with tests          |
| Database quota used up or Supabase down       | Sign-in and sync fail with an error message; the map and local data still work                      | Not drilled                                                                |
| No connection at all                          | The offline page (installed app or any page load that fails)                                        | Unit tested with a fake service worker; not seen in a real offline browser |

## 4. Accessibility and performance (17d)

Checked in the development build only:

- Every page has one `h1`, a `main` landmark and a language; no duplicate ids; every form field and switch has a name; no images without alt text; no horizontal scroll at 375 px on the text pages and the inspector.
- Contrast of the text and background colours in both themes is checked by a test.
- The map page, filters, follow mode, 3D trail, the ACARS card, the Light and Satellite basemaps and the phone bottom sheet were opened and worked.

Not done: a screen reader pass, a keyboard-only pass of every dialog, Lighthouse or similar on a deployed build, real load-time numbers (the development server is not representative; the map library alone is 289 kB gzipped).

## 5. Soft launch and rollback (17f)

Not started: nothing is deployed. When it is:

1. Deploy to a preview address first and open it on a phone and a laptop.
2. Share with a few people and ask them to try: search, selecting an aircraft, the watchlist, an alert, installing the app.
3. Watch the host's logs for `[client-error]` lines and the data providers for 403 and 429 answers.
4. **Rollback**: the host keeps earlier deployments; redeploy the last good one. Database changes are additive migrations in `supabase/migrations/`; undo with a new migration, never by editing an applied one. The service worker keeps only built files; if a bad release is cached, change `CACHE` in `public/sw.js` so every visitor drops the old copies.
5. Keep the known issues below visible to testers.

## 6. Known issues

- "Airspace data could not be loaded." appears often in development; one of the four airspace requests answers with an error. Cause not found.
- The panel's status badge (a simple altitude and vertical rate rule) can disagree with the Flight facts card (the better rules).
- Right after the development server starts, the first page opened can be replaced by the map page restored from the saved state (a cold-start reload, development only). This also explains a link with `base=dark` once opening the saved Light basemap. Not seen with a warm server.
- Rapid reloads make the free feed answer "busy" for several seconds.
- The 404 page shows the map page's title.
- The status page shows airplanes.live as refused (HTTP 403): our server is blocked by it (0b), and adsb.lol is the only working aircraft source.
- Feedback needs a GitHub account; there is no private contact address yet (23g).
- Satellite imagery, ACARS and airplanes.live use terms that have not been confirmed (see section 1).
- Light theme: panels and dialogs were not all opened; toast and map icon colours were not reviewed.
- Text in scripts other than latin falls back to the system font.
