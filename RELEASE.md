# Release notes and checklist

Working document for Phase 17 (final testing and release). It records what was checked, what was not, and what must be decided before the site is made public. Dated 2026-11-24, after the Phase 17 audit of the deployed site. Keep it short and honest: a box is ticked only when it was seen to be true.

State on 2026-11-24: the site runs on Cloudflare at https://skydeck.sky-deck.workers.dev (deployed by hand from `main`), with Workers AI, the adsb.lol key and its quota guard, the shared feed cache (`FeedHub`) and the shared AI object (`AiHub`). Pull requests get an advisory Claude review. The audit found no secret leaks, no XSS sinks, no open proxy, row-level security and `delete_my_account` fine, and the live site healthy (robots, sitemap, canonical, manifest, icons, health); 121 live tests passed.

## 1. Release checklist (17e)

### Done

- [x] **0e Self-hosted fonts** (Phase 16a, approved 2026-11-09).
- [x] **0g Route data freshness**: wrong routes are detected and hidden (Phases 11 and 14).
- [x] **0i Stale-cache quirk**: fixed earlier (see the changelog).
- [x] **0j Cloudflare deployment**: live at https://skydeck.sky-deck.workers.dev (`DEPLOY.md`).
- [x] **0k AGENTS.md and README wording**: backend rule updated; the Lovable block and note were removed (15a).
- [x] **AI**: Workers AI first, Gemini as fallback, shared `AiHub`, per-visitor rate limits; the privacy, terms, disclaimer, help and credits texts now say so (2026-11-24).
- [x] **adsb.lol key quota**: counted and paced (`src/lib/quota-guard.ts`), saved copies up to an hour old.
- [x] **Shared cache**: the feed runs in one global `FeedHub` Durable Object.
- [x] **Claude pull request review**: advisory workflow on pull requests (#88, #89).
- [x] Lovable removed from the code (15a).
- [x] A Content-Security-Policy tried in report-only mode (section 2). Enforcing it needs nonces on the inline scripts first.

### Open, owner actions (do not decide these in code)

- [ ] **Indexing (R2, R8).** Keep the site out of search engines until the legal pages are approved. Recommendation: `bunx wrangler secret put SITE_INDEXING --name skydeck` and type `off`. Delete the secret at launch.
- [ ] **ACARS and Satellite flags (R2).** Their legal questions are open: Esri imagery terms (0a), the Airframes answer (0c) and the ACARS legal review (0d). Recommendation: wait for the answers. Only if you do not want to wait, publish without them: `VITE_FLAGS="-acars,-satellite" bun run build`, then deploy from `main`.
- [ ] **`SITE_URL` repository variable and uptime workflow (R9).** `gh variable set SITE_URL --body https://skydeck.sky-deck.workers.dev` (or the repository Settings, Secrets and variables, Actions, Variables). The scheduled uptime workflow (`.github/workflows/uptime.yml`) needs it and runs only from `main`. Also set the Worker's `SITE_URL` secret once there is a domain (`DEPLOY.md`).
- [ ] **Domain and brand name (15b, Decision 7)**: buy the domain after the product is finished; the name was never checked for clashes.
- [ ] **Private contact address (23g)**: create it once there is a domain, then replace `CONTACT_NOTE` in `src/lib/legal-content.ts`.
- [ ] **Legal pages read by the owner (16e).** The AI text on privacy, terms, disclaimer and help is new (2026-11-24); read it before indexing is allowed.
- [ ] **Lovable**: disconnect the project in Lovable and remove the Lovable GitHub app from the repository (15a).
- [ ] **Supabase Auth Site URL** set to the real address (dashboard, Authentication, URL configuration), and the Google sign-in decision made.
- [ ] **0a Esri satellite imagery terms**: not read. Keep, use a keyed source, or drop Satellite.
- [ ] **0b airplanes.live 403**: unresolved; adsb.lol is the working provider and airplanes.live the fallback.
- [ ] **0c Airframes anonymous API**: unresolved (email draft is local only).
- [ ] **0d ACARS legal review**: not done.
- [ ] **0f Credits wording**: matches the code, not checked against each source's current terms. New: the Llama 4 Community License text was not read, so "Built with Llama" is a guess at what it asks for; the Gemini free-tier terms were not read either.
- [ ] **0h Cold-start console errors**: not reproduced or fixed.
- [ ] **Monitoring and quota alarms** for the free tiers (21d): not set up. Error reports go to the host's log as `[client-error]` lines; `/api/health` is ready for an uptime checker; no analytics by decision (21e).

## 2. Security review (17b)

Checked on 2026-11-09 and again on the live site on 2026-11-24 (audit):

- **Secrets**: no key-shaped strings in tracked files, no `.env` file tracked (only `.env.example`, names only), nothing key-shaped in the built browser files, no `VITE_` variable holds a secret (and the server refuses to start with one).
- **Input validation**: every server function validates its input with a schema (feed, search, route, airport, ATIS, airspace, weather, AI, client error report). No open proxy and no XSS sink were found.
- **Database**: row-level security is on for all tables; every policy is limited to the signed-in user's own rows. The accepted advisor warning is `delete_my_account()`: signed-in users call it on purpose, it only deletes the caller's own row, has a fixed search path and is not callable by anonymous visitors.
- **Dependencies**: `bun audit` reports one moderate advisory (minimatch) in development tooling (eslint), not in the shipped app. CI fails on high or critical advisories.
- **Headers**: `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` on every response.- **Report-only Content-Security-Policy** on HTML pages (`src/lib/csp.ts`); reports are logged as `[csp-report]` (read them with `wrangler tail`).
- **Not done**: an enforcing Content-Security-Policy (inline scripts need nonces first), `frame-ancestors` (embedding is a feature), Cross-Origin-Opener-Policy, load testing and a penetration test.

## 3. Quota and failure drills (17c)

Drilled on 2026-11-24 against the deployed build and its local runtime; all behaved acceptably.

| Situation                                   | What the visitor sees                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Live provider answers 429 or is busy        | "Live data is busy. Retrying…", saved copies up to an hour old, then recovers by itself |
| adsb.lol key quota (30 s window) used up    | Saved copies with their real age instead of requests that would be refused              |
| AI not configured or its daily budget is up | The AI buttons say the description is unavailable; the rest of the app is unaffected    |
| Airframes unreachable                       | The ACARS card and panel show an error; the map keeps working                           |
| Browser storage blocked                     | Settings and collections last until the page closes                                     |
| Location denied                             | The map stays where it is; nothing breaks                                               |
| Hostile share links                         | Bad values are ignored                                                                  |
| JavaScript off                              | A message instead of a blank page                                                       |
| Supabase not configured or down             | Sign-in is off or fails with a message; the map and local data still work               |
| Error in a component                        | The error boundary page, and a `[client-error]` log line                                |
| No connection at all                        | The offline page (to be re-checked on the deployed build)                               |

## 4. Accessibility and performance (17d)

Checked in the development build only:

- Every page has one `h1`, a `main` landmark and a language; no duplicate ids; every form field and switch has a name; no images without alt text; no horizontal scroll at 375 px on the text pages and the inspector.
- Contrast of the text and background colours in both themes is checked by a test.
Not done: a screen reader pass, a keyboard-only pass of every dialog, Lighthouse or similar on the deployed build, real load-time numbers.

## 5. Soft launch and rollback (17f)

The site is deployed but not announced. Before announcing it:

1. Open it on a phone and a laptop.
2. Share with a few people and ask them to try: search, selecting an aircraft, the watchlist, an alert, installing the app, the two Explain with AI buttons.
3. Watch the host's logs for `[client-error]` lines and the data providers for 403 and 429 answers.
4. **Rollback**: follow "Roll back" in `DEPLOY.md` (it is the one place for the steps, including why the Durable Object migrations must not be touched). Database changes are additive migrations in `supabase/migrations/`; undo them with a new migration, never by editing an applied one. If a bad release is cached by the service worker, change `CACHE` in `public/sw.js` so every visitor drops the old copies.
5. Keep the known issues below visible to testers.

## 6. Known issues

- "Airspace data could not be loaded." appears often in development; one of the four airspace requests answers with an error. Cause not found.
- The panel's status badge (a simple altitude and vertical rate rule) can disagree with the Flight facts card (the better rules).
- Right after the development server starts, the first page opened can be replaced by the map page restored from the saved state (development only).
- The refresh budget (`FEED_BUDGET_PER_MIN`, default 90 a minute) is now shared through `FeedHub`; the figure is still a guess.
- Rapid reloads make the free feed answer "busy" for several seconds.
- The 404 page shows the map page's title.
- The status page shows airplanes.live as refused (HTTP 403): our server is blocked by it (0b), and adsb.lol is the only working aircraft source.
- Feedback needs a GitHub account; there is no private contact address yet (23g).
- Satellite imagery, ACARS and airplanes.live use terms that have not been confirmed (section 1).
- Text in scripts other than latin falls back to the system font.
