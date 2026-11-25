# Open decisions for Sri, 2026-11-25

Short briefs for the choices in `dev-plan.md` ("Decisions needed" and section A of "Remaining work") that only Sri can make. Each brief has the options, the trade-offs, the cost, a recommendation, next steps and numbered sources. Facts were re-checked on the web on 2026-11-25 and replace the earlier local briefs in `docs/briefs/` where they differ. Marks on sources: **read** = the owner's own page read today, **secondary** = a third party or search summary, **refused** = the page refused an automated request (Sri should read it in a browser), **earlier brief** = carried over and not re-checked. Nothing here is legal advice.

## Summary: one line per decision

| # | Decision (plan rows) | Recommendation |
| --- | --- | --- |
| 1 | Name, domain, handles (Decision 7, 15b) | Keep "SkyDeck", add a qualifier, register `skydeckmap.com` on Cloudflare now (about $11 a year) after Sri runs the trademark searches in a browser. |
| 2 | Landing page and `/map` redirect (15e, Decision 8) | Landing at `/`, map at `/map`, a 308 redirect that keeps the query string for old links (shared, embedded and push notification links), built in this repo, before the domain goes live. |
| 3 | Monitoring, errors, analytics (21c to 21e, Decision 9) | Stay inside Cloudflare and GitHub: pin the `observability` config before 1 December 2026, add UptimeRobot as a second uptime check, check quota dashboards weekly, and use no analytics. |
| 4 | Supabase backups and seed data (21f, 18i) | A weekly encrypted dump from a separate private repo, one restore rehearsal into a temporary second free project, and test accounts only when a feature needs them. |
| 5 | Private contact address (23g, 16e) | Open a free Proton mailbox used only for SkyDeck now, switch on GitHub private vulnerability reporting, and forward a domain address to the mailbox once there is a domain. |
| 6 | Esri imagery terms (0a, 0f) | Get a free ArcGIS Location Platform key restricted to the site address with pay-as-you-go off. Publish with `VITE_FLAGS=-satellite` until it is in. |
| 7 | airplanes.live access (0b, 19d) | Remove airplanes.live from the code and add FlyItalyADSB as the backup source. |
| 8 | Planespotters photos (13d) | Show thumbnails in the aircraft panel, following the Photo API rules exactly; collection gets a "Show photo" button. Sri reads the terms once first. |
| 9 | ACARS label docs licence (6c) | Use the MIT-licensed `@airframes/acars-decoder` descriptions, and post a licence request to the documentation repository in parallel. |

Things only Sri can do, whatever is chosen: run the trademark searches (1), read the Planespotters and airplanes.live terms in a browser (7, 8), create accounts and secrets (1, 3, 4, 5, 6), and say yes to each recommendation.

---

## 1. Project name, domain and handles (Decision 7, plan row 15b)

**Decision for Sri:** Keep "SkyDeck" as it is, keep it with a qualifier in the domain and handles, or rename; and register a domain now or after the product is finished.

**Where it stands (2026-11-25):**
- `src/config/brand.ts` sets `APP_NAME = "SkyDeck"`; the word appears 74 times in 38 files under `src/` (66 in 34 on 2026-11-21). Storage keys use `skydeck:`. Logo and icons shipped 2026-11-22 (PR #74), so a rename now also means a new wordmark.
- Live only at skydeck.sky-deck.workers.dev. `SITE_URL` is unset, so no canonical link is written; 15g and the contact address (23g) wait for a domain.
- New since 2026-11-20: skydecklive.com now names a single maker on its About page, so it is a one-person project [2]. getskydeck.app is taken [5]. skydeck.studio, skydeck.software and getskydeck.dev are free [5]. The .com price rose on 2026-11-01 [8].
- Not re-checked today: the official trademark registers (USPTO, EUIPO, WIPO). They are JavaScript or CAPTCHA pages that refused automated reading on 2026-11-20 [earlier brief].

**The closest clash.** skydecklive.com is "SKYDECK, the live sky, anywhere on Earth". It is a 3D web view of live air traffic with callsign, type, altitude and speed, flight search, a "Sky-Dex" log and an embeddable widget [1]. That is the same field, the same name and almost the same features as SkyDeck. It shows no pricing and no ™ or ® [1][2]. The domain was registered at Cloudflare on 2026-06-17 [3]. Other users of the name work in other fields: Berkeley SkyDeck is a startup accelerator with no ™ shown [4]; earlier finds included JetIQ's Skydeck charter software and Asteria's SkyDeck drone platform [earlier brief]. Trademarks found through aggregator sites: SKYDECK.AI, US reg. 7740154, class 42, AI software platforms, live [6]; SKYDECK USA, a 2025 application for pavers and turf [7]; older SKYDECK marks for venues, events and building materials [earlier brief]. None of these is for flight tracking, but aggregators can be out of date. No App Store app named exactly "SkyDeck" for flights turned up; the nearest is "FlightDeck - Flight Tracker" [9]. This is not legal advice.

**Domains** (availability from the Vercel registrar lookup [5]; Cloudflare prices from a third-party copy of Cloudflare's price list dated 2026-10-20 [10]; Cloudflare's own pages give no figures [11])

| Domain | Free? | Cloudflare price per year |
| --- | --- | --- |
| skydeck .com .net .org .app .dev .live .io .me .tech .xyz | No, all taken | n/a |
| skydeck.aero | Not free, and limited to the aviation community; Cloudflare does not sell .aero [12] | n/a |
| skydeckmap.com, getskydeck.com, skydeck3d.com, skydecktracker.com | Yes | about $11.17 from 2026-11-01 (was $10.46) [8][10] |
| skydeckmap.app / skydeckmap.dev / getskydeck.dev | Yes | $8.20 first year, then $14.20 / $12.20 |
| skydeck.page | Yes | $10.20 |
| skydeck.fyi | Yes | $5.20 |
| skydeck.site | Yes | $4.99 first year, then $27.70 |
| skydeck.studio, skydeck.software | Yes | not checked (in the Name.com student offer) |

Cloudflare Registrar sells domains at cost, with free WHOIS privacy and DNSSEC [11], and supports .com .app .dev .live .page .fyi .site .me .tech .io [12]. Email Routing is free. It needs Cloudflare as the domain's DNS, not Cloudflare as the registrar. It allows up to 200 forwarding rules, but it cannot send or reply from the custom address [13]. GitHub Student Pack: a free .me domain for a year (Namecheap), a free .TECH domain for a year, and a free Name.com domain on more than 25 endings, including .live, .app and .dev [14]. Each one renews at the normal price after the first year; .tech renews at $49.20 at Cloudflare [10].

**Handles:** GitHub `skydeck` is an organization in Palo Alto that has been inactive since 2015 [15]. Bluesky `skydeck.bsky.social` is taken (2023, 58 posts); `skydeckmap`, `getskydeck` and `skydeckapp` on Bluesky are free [16]. YouTube `@skydeck` exists (German-language channel) [17]. X and Instagram refused automated readers, and Reddit was blocked, so Sri must check those and Threads in a browser.

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Keep "SkyDeck", buy nothing until finished | No work, matches Sri's plan | Variant domains can be taken (getskydeck.app was taken this week); 23g and 15g stay blocked | $0 now |
| B. Keep "SkyDeck", register skydeckmap.com now on Cloudflare, use "skydeckmap" handles | Cheap; unlocks Email Routing (23g), `SITE_URL` and 15g; the name stays | Shares the name with a live 3D air-traffic site, so expect mix-ups and weaker search results | about $11.17 a year, about 30 min |
| C. Rename (for example Altiview: altiview.app is free [5], but the name was not checked for clashes) | Clear name of its own | New logo, a 38-file string change, a new name check | $10 to $15 a year plus a few hours |

**Recommendation:** Option B. No registered SKYDECK mark found covers flight tracking. The real clash is a hobby site by one person, and a qualifier ("SkyDeck Map", skydeckmap.com) keeps the two apart at low cost. Register now rather than later: about $11 a year is less than the risk of losing the variant, and it unblocks the contact address and the canonical URL today. Spend the student-pack free domains on nothing; they renew at full price somewhere other than Cloudflare.

**If Sri agrees, next steps:**
1. Sri: in a browser, search "skydeck" at https://tmsearch.uspto.gov/ (classes 9 and 42), https://www.tmdn.org/tmview/ and https://branddb.wipo.int/. If a live mark covers map or flight software, stop and pick option C.
2. Sri: Cloudflare dashboard > Domain Registration > Register Domains > `skydeckmap.com` (1 year, auto-renew on).
3. Sri: Workers & Pages > skydeck > Settings > Domains & Routes > Add custom domain `skydeckmap.com`; then set `SITE_URL=https://skydeckmap.com` as a variable and redeploy.
4. Sri: Email > Email Routing on that zone; add `hello@skydeckmap.com` that forwards to a private inbox (23g). Claude then updates the legal pages.
5. Sri: claim `skydeckmap` on Bluesky, X, Instagram, Threads, YouTube and Reddit, and a GitHub org if wanted.
6. Claude: add "SkyDeck Map" wording where the domain appears, and leave `APP_NAME` and the storage keys as they are.

**Sources** (read 2026-11-25 unless marked)
1. SKYDECK home, https://skydecklive.com/, read: live 3D air traffic, Sky-Dex, embed widget; no maker, pricing or terms.
2. SKYDECK About, https://skydecklive.com/about/, read: names one maker; no ™ or ®.
3. Verisign RDAP, https://rdap.verisign.com/com/v1/domain/skydecklive.com, read: Cloudflare, created 2026-06-17.
4. Berkeley SkyDeck, https://skydeck.berkeley.edu/, read: UC Berkeley accelerator, no ™ shown.
5. Vercel domain availability and price API (registry lookup), read: availability of every domain listed.
6. Markinton, SKYDECK.AI, https://markinton.com/trademark/skydeck-ai-98006979, secondary: reg. 7740154, class 42, live.
7. Justia, SKYDECK USA, https://trademarks.justia.com/993/41/skydeck-99341851.html, secondary: filed 2025-08-17, classes 19 and 27.
8. Webhosting.today, https://webhosting.today/2026/05/21/verisign-starts-a-four-year-com-price-cycle-the-first-7-hits-in-november/, secondary: .com wholesale price up 7% from 2026-11-01.
9. FlightDeck - Flight Tracker, https://apps.apple.com/app/id6759628645, secondary (search result): the nearest App Store name.
10. CostGoat, Cloudflare domain prices, https://costgoat.com/pricing/cloudflare-domains, secondary: per-TLD prices as of 2026-10-20.
11. Cloudflare Registrar, https://www.cloudflare.com/products/registrar/ and https://domains.cloudflare.com/, read: sells at cost, no markup; prices only shown in the dashboard.
12. Cloudflare TLD policies, https://www.cloudflare.com/tld-policies, read: supported endings; .aero not listed.
13. Cloudflare Email Routing docs, https://developers.cloudflare.com/email-routing/llms-full.txt, read: free; needs Cloudflare DNS; 200 rules; no sending.
14. GitHub Student Developer Pack, https://education.github.com/pack, read: the Namecheap .me, .TECH and Name.com offers.
15. GitHub, https://github.com/skydeck, read: organization, 46 repos, last update 2015.
16. Bluesky public API (getProfile and getProfiles), read: skydeck.bsky.social exists; the three variants return nothing.
17. YouTube, https://www.youtube.com/@skydeck, read: the channel exists. x.com and instagram.com refused automated readers; reddit.com was blocked.

---

## 2. Landing page at `/`, the map at `/map`, and old links (plan row 15e, Decision 8)

**Decision for Sri:** Should `/` become a landing page with the map moved to `/map`, and if so, how should old shared, embedded and notification links that point at `/?...` be redirected? Also: where should the landing page be built (Decision 8)?

**Where it stands (2026-11-25):**
- The map is still route `/` (`src/routes/index.tsx`). It reads the query on the client: `lat lon z p b hex base` (`src/lib/share-link.ts`), `embed=1` (`src/lib/embed.ts`), `open=search|account` (`site-meta.ts`), and `mock=1` (development only). `/about` now exists as a text page, along with `/help`, `/press`, `/privacy`, `/terms`, `/disclaimer`, `/status`, `/whats-new` and `/inspector`. The inspector has no back link of its own. It uses the shared header, whose "Map" item points at `/` (`SiteChrome.tsx`).
- New since the 2026-11-20 brief: web push (Phase 10f, PR 102). `push-alerts.ts` builds notification links as `/?lat=..&lon=..&z=9&hex=..`, and the fallback in `sw.js` `safePath` is `/`. Notifications already sitting on people's devices will point at `/?...`, so the redirect has to cover them as well as shared links and embeds.
- The map writes links from `window.location.pathname`, and embed snippets are built from the current address. Once the map is at `/map`, new share, embed and copy links follow it without further changes. The service worker sends page loads straight to the network (`fetch(req)` in navigate mode), so it passes a redirect on to the browser. No change is needed there beyond the fallback path.
- `src/server.ts` already returns its own redirects before the router runs (http to https, 301 for GET and 308 otherwise). That is a ready-made place for a query-preserving redirect. `SITE_URL` is not set and there is no custom domain yet, so today no canonical link is written and the sitemap has no host. The search cost of moving now is close to zero.
- Rough size of option B below: about 5 new files (`routes/map.tsx`, a new landing `routes/index.tsx`, `lib/landing-content.ts`, `lib/map-redirect.ts` and its test) and about 16 to 18 changed files: `site-meta.ts` (`MAP_ACTIONS`, `SITEMAP_PATHS`, JSON-LD url), `SiteChrome.tsx`, `push-alerts.ts`, `sw.js` (fallback path and `CACHE` bump), `manifest.webmanifest`, `server.ts`, the generated `routeTree.gen.ts`, 4 unit tests (`app-routing`, `service-worker`, `push-alerts`, `site-meta`), 6 e2e files (`flows` has 20 `openMap` calls that default to `/` plus 3 explicit `/?lat=` calls, and `a11y`, `screens`, `smoke`, `readme-images`, `production` also change; `warm-up` works either way), and README.

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Keep the map at `/`. Put the landing at `/welcome` (or grow `/about`) and add a first-visit card on the map | Nothing breaks. About 3 to 5 files. The first-run guide already appears for new visitors who arrive without share parameters (`first-run.ts`) | `/`, the page search engines and new visitors see first, stays a client-only map that is heavy and has little text. The plan asks for a server-rendered landing for "fast first paint and search", which this only half meets. Two "about" pages | Free. About half a day of agent work and less than an hour of Sri's review |
| B. Landing at `/`, map at `/map`. Any `/` with a map key gets a server redirect to `/map` with the query string kept exactly | One clear home page for visitors and search. Every old link keeps working, because all of them carry a known key. It matches how the bigger trackers split home and map (see note) | Permanent redirects are cached by browsers. That is harmless here as long as `/map` never goes away. Installed apps need the manifest step below. Client-side links must be updated too, because `server.ts` only sees full page loads | Free. About 1 to 2 days of agent work. Sri spends about 1 to 2 hours on review and the design call, plus 5 minutes for the DevTools check |
| C. Landing at `/` only for first-time visitors who arrive without parameters; returning visitors get the map at `/` | Regulars keep their habit and nothing redirects | One URL serves two very different pages. The server cannot read `localStorage`, so it needs a cookie, or the page swaps on the client, which flashes and loads the map bundle anyway. Search engines would see only the landing. The hardest option to test (the screenshot and a11y matrices double) | Free. About 2 days, plus ongoing test upkeep |

**Redirect rule for B:** in `src/server.ts`, before the router, call a pure helper `mapRedirectTarget(url)`. If the path is exactly `/` and the query has any of `lat lon z p b hex base embed open mock`, return `/map` plus the original query string unchanged. Use 308 (Google treats 301 and 308 as "permanently moved" and shows the target in results [1]). Leave `/` with no key, or with only `utm_*`, as the landing (200). The redirect has to be in Worker code, because Cloudflare's `_redirects` file cannot match on query parameters [2]. TanStack's `redirect()` also accepts a `statusCode`, and the installed router-core line defaults it to 307 [3][4]. A `beforeLoad` redirect on the new `/` route is an optional second guard for client-side navigation.

**Installed apps:** Chrome only allows a `start_url` change when the manifest has an `id`. Without one, it builds the id from `start_url` [5][6]. So keep `start_url: "/"` until Sri reads Chrome's computed id. Then add `"id"` with that exact value and set `"start_url": "/map"`. Installed apps pick up the change after a launch and after all their windows close, which takes up to a day or more on Android [5]. Safari or iOS behaviour was not verified.

**How others do it:** ADS-B Exchange runs a marketing site at www.adsbexchange.com with "View Live Map" linking to globe.adsbexchange.com [7]. Airplanes.live serves its map at globe.airplanes.live with `?lat=&lon=&zoom=&icao=` parameters [8]. Flightradar24 puts the live map on its home page, with location paths such as `/51.50,-0.12/6` (secondary source) [9]. Plane Finder could not be checked because its site refused the automated request [10].

**Recommendation:** Choose B, with the 308 server redirect above, and do it before the custom domain (Decision 7), so the new domain starts with the final layout and no search history is lost. It covers shared links, embeds (an iframe follows the same-site redirect) and push notifications with one tested rule. Option C costs more and stays fragile. Option A is only worth it if Sri wants no landing work this phase. For Decision 8, build the landing in this repo (plan's recommendation): it reuses the header, footer, tokens, SSR and `og-image.png`, and costs nothing. Framer's free plan does not allow a custom domain [11], and Framer would split the site. A quick visual mock first is optional, not needed.

**If Sri agrees, next steps:**
1. Sri: reply "B, build in repo" and pick the hero (recommended: the still `og-image.png`, which needs no live data and no motion work).
2. Sri (5 minutes, optional): open the live site's installed app or a tab in Chrome, go to DevTools > Application > Manifest, and copy "Computed App Id" into the thread [6].
3. Agent, on one branch: move the map to `src/routes/map.tsx` and build the landing in `src/routes/index.tsx` from `lib/landing-content.ts`. Add `lib/map-redirect.ts` with unit tests (every key, `utm_*` only, bare `/`, the query kept byte for byte) and wire it into `server.ts`. Update `MAP_ACTIONS`, `SITEMAP_PATHS`, `SiteChrome` "Map", `push-alerts.ts` `eventUrl`, the `sw.js` fallback (and bump `CACHE`), the tests, e2e (add a redirect test for `/?lat=..` and `/?embed=1`) and README.
4. Agent: change the manifest only after step 2 (`id` set to the computed value, `start_url` set to `/map`). Otherwise leave it as is.
5. Sri: after deploy, open an old shared link and an old embed snippet and confirm both land on `/map` with the same view.

**Sources** (read 2026-11-25 unless marked)
1. Google Search Central, Redirects and Google Search, https://developers.google.com/search/docs/crawling-indexing/301-redirects, read. 301 and 308 mean permanently moved and show the target in results; 302 and 307 keep the source; the page says nothing about query strings.
2. Cloudflare Workers, Static assets redirects, https://developers.cloudflare.com/workers/static-assets/redirects/, read. Query parameter matching is not supported, and Worker-handled requests need redirects in Worker code.
3. TanStack Router, RedirectOptions, https://tanstack.com/router/latest/docs/framework/react/api/router/RedirectType, read. Documents `statusCode`, `headers`, `to` and `href`, with no default stated.
4. @tanstack/router-core 1.171.17 `src/redirect.ts` on unpkg, https://app.unpkg.com/@tanstack/router-core@1.171.17/files/src/redirect.ts, read. `statusCode || code || 307`. The repo pins react-router 1.170.41 and has no `node_modules` here, so the exact installed line was not re-read.
5. web.dev, How Chrome handles updates to the web app manifest, https://web.dev/articles/manifest-updates, read. A `start_url` change requires `id`; update timing on desktop and Android; Safari not covered.
6. Chrome for Developers, PWA manifest id, https://developer.chrome.com/blog/pwa-manifest-id, read. Without `id`, the id comes from `start_url`; copy "Computed App Id" from DevTools before adding one.
7. ADS-B Exchange, Maps, https://www.adsbexchange.com/maps/, read. The marketing page links "View Live Map" to globe.adsbexchange.com.
8. airplanes.live, Map help, https://airplanes.live/map-help, read. The map is at globe.airplanes.live and takes lat, lon, zoom and icao parameters.
9. Bellingcat toolkit, Flightradar24, https://bellingcat.gitbook.io/toolkit/more/all-tools/flightradar24.md, secondary. The home page is the live map; example link `/51.50,-0.12/6`.
10. Plane Finder, https://planefinder.net/, refused. Not verified, so Sri must look in a browser.
11. Framer pricing, https://www.framer.com/pricing, read. A custom domain needs a paid plan; code export not stated.
12. Earlier brief `docs/briefs/landing-page.md` (2026-11-20), earlier brief. File list and redirect outline, re-checked against `dev` at 9116479.

---

## 3. Monitoring, error reporting and analytics (plan rows 21c, 21d incl. "21d quota alarms", 21e; Decision 9)

**Decision for Sri:** Which free tools catch errors, raise alarms (site down, quotas) and, if at all, count visitors, while keeping "no consent banner" and the promises in DATA.md and `/privacy`?

**Where it stands (2026-11-25):**
- Errors: browser errors (error boundary, `window-error`, `unhandled-rejection`) go to one `[client-error]` log line each, capped and rate limited; CSP violations go to `[csp-report]`; `server.ts` logs SSR crashes. Nothing is stored by the app, so the Cloudflare log view is the only inbox. `/api/health` and `/status` exist (status sends no alerts).
- Logs config: the build sets Durable Objects, crons and AI in `vite.config.ts`, but **no `observability` block**. New Workers have logs on by default [1][2], but nobody has confirmed the live Worker writes them, and the config does not pin it.
- Uptime: `SITE_URL` is now set and a manual run at 17:17 UTC checked the live site fine. But GitHub ran the `*/30` schedule only 4 times in about 34 hours (07:01, 18:59, 02:59, 12:34 UTC), and those runs checked nothing because `SITE_URL` was empty then. GitHub says scheduled runs can be delayed or dropped under load, especially at the top of the hour [6].
- **New since the 2026-11-20 brief:** from **1 December 2026** (in 6 days) Workers Logs and Issues move to "Cloudflare Observability" pricing: Free gets 0.5 GB of ingestion a day and 7 days of retention, shared by all logs, traces and Issues. Once that is used up, new data is dropped until 00:00 UTC [3][4]. Until then it stays at 200,000 events a day, kept 3 days [1].
- Still true: Workers Issues (groups exceptions, 5xx answers and `console.error`) is a free open beta. Its alerts go to a webhook, chat or incident tool, not email [5]. The Free plan has no Workers, Durable Objects or usage notification [7]. Workers Logpush is Paid only [4]. General Logpush is now on all plans but billed by use [4].

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| **E1. Errors: keep the log lines, pin `observability` in config, turn on Issues** | No new dependency or third party. Matches what DATA.md already says. Issues groups repeats. | No email alerts [5]. Logs last 3 days (7 from Dec 1), so Sri must look. The 0.5 GB/day cap can drop logs on a busy day [3]. | Free. A small config PR. |
| E2. Errors: Sentry Developer (free) with `@sentry/cloudflare` | Grouping, email alerts, 30-day history, Durable Objects support [8][9] | 5k errors, 1 user [8]. A new dependency that needs `nodejs_compat` [9]. Sends IP address and user data by default unless switched off [9]. DATA.md and `/privacy` must name a new processor. | Free. About a day of work, plus upkeep. |
| E3. Errors: GlitchTip or Better Stack free | Sentry-compatible (GlitchTip) or 100k exceptions (Better Stack) [10][11] | GlitchTip Free gives only 1,000 events a month [10]. Better Stack Free is "for personal projects" [11]. Same privacy work as E2. | Free. Similar work to E2. |
| **U1. Uptime: keep the GitHub check, move it off :00 and :30** | Already built and tested. A failed run emails the person who last changed the cron line [6]. | Runs can be late or dropped [6] (seen today). Turned off after 60 days without repository activity in a public repo [6]. | Free. A one-line change. |
| **U2. Uptime: add UptimeRobot Free as a second pinger** | 50 monitors, checks every 5 min, email alerts, no card [12] | One more account. It only sees our server, never visitors. | Free. 10 min of Sri's time. |
| U3. Uptime: Better Stack Free instead of U2 | 10 monitors, email and Slack, status page [11] | Free plan is "for personal projects" [11]. The check interval is not stated. | Free. 10 min. |
| **Q1. Quotas: a weekly look at the dashboards, plus Supabase's own emails** | Nothing to build. Supabase says it notifies when the Free quota is exceeded, and again before restrictions [13]. | Cloudflare sends nothing. A spike is seen only after it happens [7]. | Free. 5 min a week. |
| Q2. Quotas: a GitHub job that reads Cloudflare GraphQL usage | Automatic, and the alarm is a failed run (email) | Free-plan access and the token permission are still unverified (earlier brief). It needs a Cloudflare API token as a GitHub secret. | Free. Half a day, plus a secret. |
| **A1. Analytics: none in the page, read the Worker's own request metrics** | No script, no cookie, no new third party. Keeps the 2026-11-10 decision. | Counts requests, not visitors. | Free. Nothing to build. |
| A2. Analytics: Cloudflare Web Analytics beacon | Free, cookieless. Cloudflare says it "does not collect or use your visitors' personal data" [14]. Works on workers.dev with the manual JS snippet [15][16]. | On workers.dev it needs a script from `static.cloudflareinsights.com` and beacons to `cloudflareinsights.com`, so the CSP must change [16][17]. DATA.md and `/privacy` need a line. No version pinning or SRI for the manual snippet [17]. | Free. A short PR. |

On consent: none of the recommended options sets a cookie or adds a browser script. Whether A2 needs a banner where Sri lives is a question for a lawyer; this is not legal advice.

**Recommendation:** Choose **E1 + U1 + U2 + Q1 + A1**. Everything stays inside Cloudflare and GitHub, the app gets no new dependency, and visitors' browsers talk to no new third party. So DATA.md, `/privacy` and "no consent banner" stay true with at most one sentence on log retention. Pin `observability` in the config before 1 December, so the move to the 0.5 GB/day allowance cannot silently turn logs off. Add UptimeRobot, because today's run history shows GitHub's schedule alone misses hours at a time. Revisit Sentry (E2) only if the 3-to-7-day log window loses real bugs, and Web Analytics (A2) only if Sri wants visitor numbers.

**If Sri agrees, next steps:**
1. Thread (config PR): in `vite.config.ts`, under `nitro({ cloudflare: { wrangler: { ... } } })`, add `observability: { enabled: true, head_sampling_rate: 1, issues: { enabled: true } }`. Wrangler on `dev` is ^4.158, and Issues needs 4.134+ [5]. Check that `.output/server/wrangler.json` contains it, then update DEPLOY.md. If an Issues setting is left out of the config, the next deploy turns Issues off [5].
2. Thread (same PR): change `uptime.yml` cron to `7,37 * * * *` (off the busy top of the hour [6]). Sri makes or approves this commit, so that failure emails go to Sri [6].
3. Thread: add to DATA.md and `/privacy` that the hosting platform keeps request and error logs for about 3 days (7 days from 1 December 2026) [1][3]. Check whether invocation logs record full request URLs with query strings. A `redactQueryString` option is listed for the `cf` CLI config [2], but it is unverified for Wrangler.
4. Sri, after the deploy: Cloudflare dashboard, Workers & Pages, skydeck, Observability. Confirm that `[client-error]` and `[keepalive]` lines appear, then open the Issues tab. After 1 December, check usage under the account's Observability pricing page.
5. Sri (optional, 10 min): sign up at uptimerobot.com with Sri's own email. Add an HTTP(s) keyword monitor for `https://skydeck.sky-deck.workers.dev/api/health` with keyword `ok`, every 5 min, with email alerts.
6. Sri, weekly: Workers & Pages overview (requests against 100,000 a day), Durable Objects usage, and the Supabase project's Usage page. Keep Supabase billing emails out of the spam folder.
7. Thread: record the decision in dev-plan rows 21c to 21e and Decision 9, and remove "21d quota alarms" from section A.

**Sources** (read 2026-11-25 unless marked)
1. Workers Logs, https://developers.cloudflare.com/workers/observability/logs/workers-logs/, read: Free 200,000 events/day, 3 days; pricing changes 1 Dec 2026; new Workers have observability on; the `observability` setting is required to write logs.
2. Wrangler configuration and Config Explorer, https://developers.cloudflare.com/workers/wrangler/configuration/ and /cf/projects/config-explorer/, read (via Cloudflare docs search): `enabled` defaults to true for new Workers; `issues.enabled`; `redactQueryString` listed for `cf`.
3. Cloudflare Observability pricing, https://developers.cloudflare.com/observability/pricing/, read: Free 0.5 GB/day ingestion, 7-day retention, ingestion stops at the cap until 00:00 UTC; Free accounts switch 1 Dec 2026; Issues shares the allowance.
4. Workers pricing and Logpush changelog, https://developers.cloudflare.com/workers/platform/pricing/ and /changelog/post/2026-09-30-logpush-usage-based-pricing/, read (via docs search): Workers Logpush is Paid only; Logpush on all plans with usage pricing.
5. Workers Issues, https://developers.cloudflare.com/workers/observability/issues/, read: open beta, free during beta; signals; alerts to agent, webhook, chat or incident tool (no email); Wrangler 4.134+; a deploy without the setting turns Issues off.
6. GitHub, Events that trigger workflows (schedule), https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows, read: delays at high load and the top of the hour, dropped jobs, 60-day auto-disable, notifications to the last cron editor. Run history from `gh run list`, read.
7. Cloudflare Notifications available, https://developers.cloudflare.com/notifications/notification-available/, read: no Workers, Durable Objects or usage notification on Free; Health Checks and Usage Based Billing need Pro.
8. Sentry pricing, https://sentry.io/pricing/, read: Developer plan 5k errors, 1 user, 30-day lookback.
9. Sentry for Cloudflare, https://docs.sentry.io/platforms/javascript/guides/cloudflare, read: needs `nodejs_compat`; wraps Durable Objects; sends IP and user data by default unless `dataCollection.userInfo: false`.
10. GlitchTip pricing, https://glitchtip.com/pricing, read: Free 1,000 events a month, 30 days.
11. Better Stack Uptime pricing, https://betterstack.com/uptime/pricing, read: Free "for personal projects", 10 monitors, email and Slack, 100,000 exceptions.
12. UptimeRobot pricing, https://uptimerobot.com/pricing/, read: Free 50 monitors, 5-min interval, email alerts, no card.
13. Supabase Billing FAQ, https://supabase.com/docs/guides/platform/billing-faq, read: notified when the Free quota is exceeded, and before Fair Use restrictions; the grace period length is not stated.
14. Cloudflare Web Analytics, About, https://developers.cloudflare.com/web-analytics/about/, read: free, privacy-first, no personal data collected.
15. Web Analytics, Get started and Limits, https://developers.cloudflare.com/web-analytics/get-started/ and /web-analytics/limits/, read: manual snippet for sites not proxied; 10 such sites per account.
16. Astro migration guide, https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/astro/, read (via docs search): "On a workers.dev URL, add the beacon script to your layout."
17. Web Analytics FAQ and Data origin, https://developers.cloudflare.com/web-analytics/faq/ and /web-analytics/data-metrics/data-origin-and-collection/, read (via docs search): CSP entries needed; beacons go to `cloudflareinsights.com`; no SRI for the manual snippet; unsampled data kept 7 days.

---

## 4. Supabase backups, a restore rehearsal, and test accounts (plan rows 21f, 18i)

**Decision for Sri:** How should copies of the free Supabase database be made and kept, and how is one restore practised? And when test accounts are needed, where are they created and how?

**Where it stands (2026-11-25):**
- No backups exist. The free plan has no automatic backups [1][3], and nothing in the repo makes a dump. There is still no `supabase/seed.sql`, no `config.toml`, and no CLI setup.
- New since the 2026-11-20 brief: a daily Worker cron at 04:17 UTC now sends one anon REST read to keep the project awake (`src/lib/supabase-keepalive.server.ts`, row 18f). Pausing is handled, but a paused or lost project still means lost accounts.
- New: the database now also holds `push_subscriptions` and `push_rules` (web push, 10f). The Worker now uses `SUPABASE_SERVICE_ROLE_KEY` for the push check (`src/server/push-hub.ts`). The earlier brief said no code used that key.
- The GitHub repo `srii-dev/sky-deck` is **public** (checked today with `gh api`). Dumps hold email addresses and password hashes, so they must never be committed there or uploaded as its Actions artifacts [5][7].
- `src/test/migrations.test.ts` already blocks connection strings and JWT-looking values in migrations. The README rule "seed file contains only invented values" is already written.

**Facts checked today**
- Free plan: "Automatic backups: Not included", no PITR, paused after 1 week of inactivity, 2 active projects [1]. Free plan backups "are not available for download" [3]. PITR is a paid add-on for Pro and higher, from about $100 a month [2].
- Supabase tells free projects to export with `supabase db dump` and keep the copies off-site [2]. A backup is three files: `--role-only`, schema, and `--data-only --use-copy` [4]. The CLI runs pg_dump in a container, so Docker is needed locally [4][6]. GitHub's ubuntu runners have Docker.
- Restore goes into a new project with one `psql --single-transaction ... --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql` [4]. Auth settings, API keys, and changes to the auth schema (such as our `handle_new_user` trigger on `auth.users`) are not carried over. They must be redone from the migrations and the dashboard [4]. The schema dump leaves out the `auth` and `storage` schemas [6]. Supabase does not say outright that the data dump includes `auth.users`, but its CI guide says `data.sql` holds "email addresses and password hashes" [5].
- Supabase's GitHub Actions guide commits dumps daily. It warns "Never backup your data to a public repository", notes that dumps stay in git history, and suggests a private bucket. It needs `SUPABASE_DB_URL` (the Session pooler string, because runners are IPv4 only) [5].
- Anyone signed in with read access can download Actions artifacts. On a public repo that means anyone. The default retention is 90 days [7]. GitHub Free gives 2,000 Actions minutes and 500 MB of storage a month, which matters for private repos [8].
- `seed.sql` runs on the first `supabase start` and on every `supabase db reset` (local only). `supabase db push --include-seed` pushes it to a linked project [9][10]. `supabase start` needs Docker [11]. Supabase's own example `seed.sql` puts a placeholder row in `auth.users` that "can't be used to sign in". For real test users it points to the Auth admin API or local Studio [11].
- `auth.admin.createUser({ email, password, email_confirm: true })` needs the service_role key and must run only on a server [12]. Raw SQL inserts into `auth.users` and `auth.identities` are only shown in community threads, with no staff guidance, and they break when the auth schema changes [13].

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Manual dump on Sri's PC, monthly and before risky migrations | Simple. Nothing secret goes to GitHub. | Needs Docker Desktop and the Supabase CLI installed. Easy to forget. The files need a private place, such as an encrypted folder. | Free. 1 to 2 hours to set up, 10 minutes a month. |
| B. Scheduled dump in a **separate private repo** (`sky-deck-backups`): Actions dumps, encrypts with `gpg --symmetric`, and uploads an artifact with `retention-days: 30`. Nothing is committed. | Automatic. No local Docker. Encrypted, so even a leaked artifact is unreadable without the passphrase. Private repos do not hit the 60-day schedule shutoff of public ones (earlier brief). | Two secrets live in GitHub (DB URL and passphrase). Losing the passphrase makes every dump useless. Uses some of the 2,000 minutes and 500 MB. | Free. About 1 hour of Sri's time, mostly clicking. |
| C. Same workflow in the public repo | One repo | Artifacts are downloadable by anyone, and a mistake would leak user emails. Against Supabase's own advice [5]. | Free, but not acceptable |
| D. No data backups: schema from migrations, lists from localStorage | No work | A lost project loses every account and the push rules. | Free |
| E. Pro plan | 7-day daily backups, never paused [1] | Against the free-only rule | $25 a month |
| Seed 1. Wait until a feature needs sample data | No work now | Each test pass keeps making ad-hoc users | Free |
| Seed 2. `scripts/seed-test-users.mjs` calls `auth.admin.createUser` with invented `@example.com` users and inserts invented rows, **against a local stack or a throwaway second free project, never production** | Supported path [11][12]. Works across auth schema changes. | Needs the service role key of the target project in a local `.env`, so only Sri runs it. | Free |
| Seed 3. Raw SQL into `auth.users` in `seed.sql` | No key needed | Undocumented, and it breaks on auth upgrades [13] | Free |

**Recommendation:** Choose **B**. Make one restore rehearsal into a temporary second free project, then delete that project. Option B is the only one that keeps running without Sri remembering it or installing Docker, and encryption plus a private repo covers the public-repo problem. Do the rehearsal once after the first dump, and again after any large migration. For 18i, choose **Seed 1 now and Seed 2 when the first feature needs it**, using the same temporary project or a local stack, so no test account ever lands in the real project.

**If Sri agrees, next steps:**
1. Sri creates a private repo on GitHub named `sky-deck-backups` (New repository, Private).
2. Sri copies the Session pooler connection string from the Supabase dashboard (project `skydeck`, Connect, Session pooler) and generates a long passphrase in a password manager. In the new repo, Sri adds them under Settings, Secrets and variables, Actions as `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`. Claude never sees either value.
3. Claude writes `.github/workflows/backup.yml` for that repo. It runs weekly on Sunday plus on manual dispatch, uses `supabase/setup-cli@v1`, makes the three dumps from [5], runs `tar` then `gpg --batch --symmetric --cipher-algo AES256 --passphrase-env`, and uses `actions/upload-artifact` with `retention-days: 30`. Sri reviews and pushes it.
4. Rehearsal (Sri, about 30 minutes). Create a second free project `skydeck-restore-test`. Download the artifact and decrypt it locally with `gpg -d`. Run the `psql` command from [4] against the new project's Session pooler string. Check the row counts of `profiles`, `watchlist_items` and `push_rules`, and check that one test sign-in works. Then delete the project. Claude adds a "Backups and restore" section to `supabase/README.md` with the date and what failed.
5. Claude updates rows 21f and 18i in dev-plan.md and adds "encrypted backups kept 30 days in a private repository" to DATA.md and the privacy text.

**Sources** (read 2026-11-25 unless marked)
1. Supabase Pricing, https://supabase.com/pricing, read. Free: no automatic backups, no PITR, paused after 1 week, 2 active projects. Pro: 7 days of backups.
2. Database Backups, https://supabase.com/docs/guides/platform/backups, read. Daily backups only on Pro, Team and Enterprise. PITR is a paid add-on. Free projects should `db dump` and keep copies off-site.
3. Production Checklist, https://supabase.com/docs/guides/deployment/going-into-prod, read. "Database backups are not available for download for Free Plan projects."
4. Backup and Restore using the CLI, https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore, read. Gives the three dump commands, the psql restore, and what is not carried over.
5. Automated backups using GitHub Actions, https://supabase.com/docs/guides/deployment/ci/backups, read. Warns never to use a public repo and that `data.sql` holds emails and password hashes. Use the Session pooler.
6. CLI reference, supabase db dump, https://supabase.com/docs/reference/cli/supabase-db-dump, read. Runs pg_dump in a container. The schema dump ignores `auth`, `storage` and extension schemas.
7. Downloading workflow artifacts, https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts, read. Anyone signed in with read access can download. Kept 90 days by default.
8. Product usage included, https://docs.github.com/en/billing/reference/product-usage-included, read. GitHub Free: 2,000 Actions minutes and 500 MB storage.
9. Seeding your database, https://supabase.com/docs/guides/local-development/seeding-your-database, read. Seed runs on the first `supabase start` and on `db reset`. Configured in `[db.seed]`.
10. CLI reference, supabase db push, https://supabase.com/docs/reference/cli/supabase-db-push, read. `--include-seed` pushes seed data.
11. Local development workflow, https://supabase.com/docs/guides/local-development/cli-workflows, read. Docker is required. Its example seed user cannot sign in. Use the admin API or Studio for real users.
12. auth.admin.createUser, https://supabase.com/docs/reference/javascript/auth-admin-createuser, read. Server only, keep service_role secret, `email_confirm: true`.
13. Discussion #9251, https://github.com/orgs/supabase/discussions/9251, secondary. Community SQL inserts into `auth.users` and `auth.identities`, with no staff answer, and they break on auth schema changes.

---

## 5. A private contact address for takedowns and complaints (plan rows 23g, 16e)

**Decision for Sri:** Should SkyDeck keep the public GitHub issues page as its only contact until a domain is bought, or open a private address now?

**Where it stands (2026-11-25):**
- `src/lib/legal-content.ts` sets `CONTACT_URL` to the repo's `/issues` page. `CONTACT_NOTE` appears on About, Privacy and Terms (including "Complaints and takedown process"). The note tells people not to post private details and promises that "a way to give [a private reply] will be arranged". That private way does not exist yet. `src/test/legal-content.test.ts` checks that `CONTACT_URL` is a GitHub issues URL.
- The repo is public. Its private vulnerability reporting is **off** (`gh api .../private-vulnerability-reporting` returned `enabled: false` today). There is no `SECURITY.md`. `.github/ISSUE_TEMPLATE/config.yml` disables blank issues and lists only a Help link.
- Sri decided on 2026-11-10 to create a private address once there is a domain. The domain is to be bought "after the final product is finished" (dev-plan, Decisions). The gap could therefore last months.
- Nothing has changed since the 2026-11-20 briefs. There is still no custom domain, only `skydeck.sky-deck.workers.dev`.

**Facts checked today**
- Cloudflare Email Routing: inbound mail is "Unlimited" on Workers Free [2]. It forwards to destination addresses, and every rule stays disabled until the destination is verified [3]. Limits are 200 rules per domain, 200 destinations, and 25 MiB per message [4]. Setup picks "a domain from your Cloudflare account" and adds Cloudflare MX, SPF and DKIM records at the root [5]. So it needs an owned domain on Cloudflare and cannot work on workers.dev. It only receives. On Workers Free, Cloudflare Email Sending sends only to verified addresses in the account [2], so replies to the public have to go out through another mailbox.
- Gmail "Send mail as" for a non-Gmail address needs that provider's SMTP server. Google also says that from January 2027 Gmail will stop supporting "Send as" for third-party addresses [6]. Free forwarding plus Gmail replying "as" the domain address is therefore not a durable plan.
- Proton Free: 1 address, up to 1 GB of mail storage, 150 sent messages a day. Custom domains are listed only for paid plans [7]. Free accounts must stay active. The page says sign in "at least once a year" in one place and "more than 24 months" in another. Reminder emails come before deletion [8]. A dedicated free Gmail account would work the same way. I did not re-check Gmail's free limits today.
- GitHub private vulnerability reporting is free to switch on for public repos (Settings, Advanced Security, Private vulnerability reporting, Enable). Reporters use "Report a vulnerability" on the Advisories tab, and admins are notified [9]. It is meant for security reports only, not takedowns.
- Spam: harvesters crawl web pages. Writing "name at example dot com" is "relatively easy to overcome". JavaScript hiding hurts screen readers. A form hides the address but needs a backend [10]. A form on the Worker would need a way to send mail (see above) plus Turnstile against bots. That is extra code, so it is not worth it before a domain exists.
- Rules, briefly and not legal advice. The EU DSA, Art. 12, asks providers of *intermediary services* for a single point of contact that is electronic, user-friendly, "shall not solely rely on automated tools", and is published and kept up to date [11]. Art. 11 is the same idea for authorities. Whether a hobby site that mostly shows its own aggregated data counts as an intermediary service at all is unclear. A plain email address meets that style either way, and a public issue tracker does not suit private complaints. A US DMCA designated agent only matters for section 512 safe harbour, which covers storing material that users upload [12]. SkyDeck has no public user uploads today. If it ever adds them, registration costs $6 for 3 years [12].

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. GitHub issues only until a domain exists (today) | No work. Already on every legal page. | Not private. The Terms promise a private route that does not exist. A rights holder or person shown on the site has to post publicly. | Free. No time. |
| B. Dedicated free mailbox now (Proton Free, for example `skydeck-contact@proton.me` if free), published on the legal pages. Later, Cloudflare Email Routing forwards `contact@<domain>` to it. | Private route works today. Sri's personal address stays off the site. The later switch to a domain address is a DNS change plus one line of text. | Sign in at least yearly, or the account can be deleted [8]. Spam goes to that mailbox. Replies come from the proton.me address, even after the domain arrives. | Free. About 20 minutes, then a weekly check. |
| C. Wait for the domain, then Cloudflare Email Routing to Sri's own inbox | Neat `contact@` address. Free [2]. | The gap lasts until the domain is bought. It only receives, and replies come from Sri's personal address unless a mailbox is added. | Free plus the domain |
| D. Contact form on the Worker | Address never published [10] | Needs mail sending and Turnstile. Sending on Free goes only to verified addresses [2]. Not verified to work without an onboarded domain. | Free, a few hours of code |
| Add-on to any option: private vulnerability reporting plus `SECURITY.md` | Free, private channel for security reports [9] | Security only | 2 minutes |

**Recommendation:** Choose **B plus the security add-on, now**. A dedicated free Proton mailbox closes the gap the Terms page already admits to. It keeps Sri's personal address private, and when the domain arrives it becomes the Email Routing destination, so nothing is thrown away. Keep GitHub issues for public questions and bugs. Switch on private vulnerability reporting so security reports never have to be public.

**If Sri agrees, next steps:**
1. Sri creates a free Proton account used only for SkyDeck (proton.me, Create a free account), with a password from a password manager. Sri adds a monthly calendar reminder to sign in.
2. Sri switches on Settings, Advanced Security, Private vulnerability reporting, Enable on `srii-dev/sky-deck` (or approves Claude running `gh api -X PUT repos/srii-dev/sky-deck/private-vulnerability-reporting`).
3. Sri gives Claude the new address. It will be public anyway. Claude then edits `src/lib/legal-content.ts`: it adds `CONTACT_EMAIL`, rewrites `CONTACT_NOTE` to read "private requests and takedowns: email ...; public questions and bugs: GitHub issues", and drops the "will be arranged" sentence. It updates `src/test/legal-content.test.ts`, adds a "Private request or takedown" `mailto:` entry to `.github/ISSUE_TEMPLATE/config.yml`, and adds a short `SECURITY.md`. Sri reads the new text before it ships.
4. Claude updates rows 23g and 16e in dev-plan.md and adds the mailbox to DATA.md (emails received are kept in that mailbox and deleted when the matter is closed).
5. Later, once the domain exists: in the Cloudflare dashboard, Sri adds the domain, opens Email, Email Routing, adds the Proton address as a destination and verifies it, then creates `contact@<domain>`. Claude swaps the address in `legal-content.ts`.

**Sources** (read 2026-11-25 unless marked)
1. Cloudflare Email Routing overview, https://developers.cloudflare.com/email-routing/, read. Available on Free and Paid plans. It forwards and processes inbound mail.
2. Email Service pricing, https://developers.cloudflare.com/email-service/platform/pricing/, read. Inbound is "Unlimited" on Workers Free. Sending on Free goes only to verified addresses.
3. Email routing rules and addresses, https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/, read. Rules stay disabled until the destination is verified.
4. Email Service limits, https://developers.cloudflare.com/email-service/platform/limits/, read. 200 rules per domain, 200 destinations, 25 MiB.
5. Domain configuration, https://developers.cloudflare.com/email-service/configuration/domains/, read. Choose a domain from the Cloudflare account. Adds MX, SPF and DKIM at the root.
6. Send emails from a different address or alias, https://support.google.com/mail/answer/22370, read. Needs the other provider's SMTP. Third-party "Send as" ends January 2027.
7. Proton plans explained, https://proton.me/support/proton-plans, read. Free: 1 address, up to 1 GB, 150 messages a day. Custom domain only on paid plans.
8. Inactive accounts, https://proton.me/support/inactive-accounts, read. Free accounts can be deleted after inactivity. The page says 1 year in one place and 24 months in another, with reminder emails.
9. Configuring private vulnerability reporting for a repository, https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository, read. Settings path. Admins are notified.
10. Email address harvesting, https://en.wikipedia.org/wiki/Email_harvesting, secondary. Munging is weak, JavaScript hiding hurts accessibility, and forms have trade-offs.
11. DSA Article 12, https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-12/, secondary (copy of the Official Journal text). The point of contact must be electronic, user-friendly, not solely automated, and public. EUR-Lex itself returned only navigation to the fetcher, so Sri can read the official text at https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng in a browser.
12. DMCA Directory FAQs, https://www.copyright.gov/dmca-directory/faq.html, read. An agent is needed only to seek section 512 safe harbour. $6 per designation, expires after 3 years.

---

## 6. Satellite imagery: keep keyless Esri, use a free Esri key, swap, or drop (plan rows 0a, 0f)

**Decision for Sri:** The Satellite map loads Esri World Imagery with no account or key, which Esri's own terms do not describe as allowed for a non-Esri app. Do you want a free Esri account and key, a different (coarser) imagery source, or no Satellite at all?

**Where it stands (2026-11-25):**
- The code on `dev` is unchanged since the 2026-11-20 brief. `FlightMap.tsx` loads `server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}` (256 px, max zoom 19) straight from the browser. Its attribution reads "Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community", with no "Powered by Esri".
- `credits.ts` (entry `esri`) calls the licence "the Esri Master License Agreement". `VITE_FLAGS=-satellite` still builds without Satellite and its credit, and `allowedBasemap()` turns a saved Satellite choice into Dark. `AGENTS.md` still lists Esri among the "free, keyless tile sources".
- New today: Esri's "Sunsetting legacy basemaps" post (February 17, 2026) is now readable. It does not list World Imagery on `server.arcgisonline.com` for retirement; only World Imagery (Clarity) goes, in March 2028 [3]. So the service is not about to vanish, but the terms question is unchanged.
- New today: Esri's Location Platform help now says plainly that MapLibre is allowed, as long as calls use tokens from your subscription and keep Esri's attribution [5].
- New today: EOX's licence page now puts all of EOxCloudless under CC BY-NC-SA 4.0 for non-commercial use [11]. The 2016 CC BY layer from the earlier brief is not mentioned there.

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Keep keyless Esri | Works today; best detail | Esri's terms summary says use needs Esri software or an ArcGIS Online subscription [2]; Esri could block keyless calls | $0; 15 min to add "Powered by Esri" |
| B. Free ArcGIS Location Platform key | The only route Esri describes for a MapLibre app [5]; 2 million basemap tiles a month free [4]; with pay-as-you-go off, going over means Satellite goes blank until next month, not a bill [6] | The key is visible in the browser by design; restrict it to the site's address, but referrers can be faked [7][13]; key lasts at most 1 year [7]; Sri must make an account | $0; Sri 20 min, plus a yearly key renewal; about half a day of code |
| C. EOX Sentinel-2 cloudless | No key; CC BY-NC-SA fits a hobby site [11] | Zoom 14 at most, no uptime promise [13]; useless at airport scale | $0; 1 to 2 hours of code |
| D. USGS or NASA GIBS | Public domain (USGS) or open (GIBS) | USGS is sharp only in the lower 48 US states; GIBS is about 250 m [13] | $0; 1 to 2 hours |
| E. MapTiler free plan | No card; stops (no bill) at 5,000 map sessions a month [8] | "Personal or non-commercial" plan; the pricing page does not say satellite is in Free; one key | $0; Sri 15 min; half a day of code |
| F. Stadia Maps | Good imagery | Free plan excludes satellite and commercial use [9] | Paid only for satellite |
| G. Mapbox | 750,000 raster tiles a month free [10] | Over that it bills per 1,000 tiles [10]; I could not confirm a hard stop or whether a card is needed | $0 until it is not |
| H. Drop Satellite | No terms risk; switch already built | Visitors lose a feature they see in the README screenshots | $0; none (flag) or 1 hour to remove for good |

**Recommendation:** Choose B. It keeps the same imagery, Esri's help pages explicitly allow it with MapLibre [5], and with pay-as-you-go left off the worst case is a blank Satellite map late in a busy month, never a bill [6]. Until the key is in place, publish with `VITE_FLAGS=-satellite`. If Sri does not want an Esri account, choose H; the free keyless sources (C, D) are too coarse to be worth the work. This is not legal advice.

**Credits wording (row 0f), for option B:**
- Map attribution control: "Powered by [Esri](https://www.esri.com)" plus "Sources: " and the service's own `copyrightText`, read from the service metadata rather than hardcoded, because Esri says provider names change [1][12]. Today that text is "Esri, Vantor, Earthstar Geographics, and the GIS User Community" [1].
- `credits.ts` licence line: "Used with an ArcGIS Location Platform subscription, under Esri's terms of use." Link the World Imagery item and Esri's terms page.
- If Satellite is dropped, the `esri` credit goes with it (the flag already hides it).

**If Sri agrees, next steps:**
1. Sri: sign up free at https://location.arcgis.com and leave pay-as-you-go off (Billing page).
2. Sri: in the developer dashboard, create an API key (Developer credentials, New), give it only the basemap privilege the thread names, set Allowed referrers to `https://skydeck.sky-deck.workers.dev`, and set expiry to 1 year. Put a calendar reminder 2 weeks before it ends.
3. Sri: store it with `bunx wrangler secret put ARCGIS_API_KEY --name skydeck`. The key will reach browsers anyway, but keep it out of the repo.
4. A code thread: pick the keyed imagery endpoint from Esri's MapLibre docs (static basemap tiles or the keyed World Imagery tile URL, both in [13]), pass the key to the browser through a server function like `getAuthConfig`, add the attribution above, fall back to Dark when tiles fail, and update `credits.ts`, README line 152 and the `AGENTS.md` "keyless" rule.
5. Until step 4 ships, deploy with `VITE_FLAGS=-satellite`.
6. After one week, Sri checks tile usage on the Location Platform Usage page so we know how far 2 million tiles goes.

**Sources** (read 2026-11-25 unless marked)
1. World Imagery item JSON, https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json, read: Esri Master License Agreement; credits "Esri, Vantor, Earthstar Geographics, and the GIS User Community"; modified 2026-11-19; not for offline tile export.
2. Esri terms of use summary (April 21, 2025), https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf, read: attribution required; "If you do not have Esri software, you must purchase an ArcGIS Online subscription"; no harvesting or redistributing tiles; no commercial use of Living Atlas content.
3. Sunsetting legacy basemaps (February 17, 2026), https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/announcements/sunsetting-legacy-basemaps (read through its wp-json copy), read: phases in October 2026, March 2028, December 2029; only World Imagery (Clarity) is listed.
4. Location Platform pricing, https://location.arcgis.com/pricing/, read: basemap tiles 2M free then $0.15 per 1,000; 25 GB tile bandwidth free; no date shown.
5. Location Platform licensing and attribution, https://location.arcgis.com/help/licensing-and-attribution/, read: MapLibre and Esri Leaflet allowed; use your subscription's tokens; keep "Powered by Esri" and data attribution.
6. Location Platform billing and account management, https://location.arcgis.com/help/billing/ and /help/account-management/, read: free tiers refresh each billing cycle; past the free tier with pay-as-you-go off, access stops until the next cycle; a card is needed only for pay-as-you-go; neither page says a card is needed to sign up; an account stays active if it used a service in the last 12 months.
7. ArcGIS security FAQ, https://developers.arcgis.com/documentation/security-and-authentication/faq/, read: keys in public apps can be scraped; allowed referrers reject other origins; expiry 1 day to 1 year; legacy keys retired June 27, 2026.
8. MapTiler Cloud pricing, https://www.maptiler.com/cloud/pricing/, read: Free plan 5k map sessions and 100k requests a month, no billing details, pauses until next month, "personal, or non-commercial use"; satellite on Free not stated.
9. Stadia Maps pricing and Alidade Satellite docs, https://stadiamaps.com/pricing/ and https://docs.stadiamaps.com/map-styles/alidade-satellite, read: pricing says satellite is Standard and up and Free is not for commercial use; the style page tags Free too, so the two pages disagree.
10. Mapbox pricing, https://www.mapbox.com/pricing/, read: 50,000 GL JS map loads and 750,000 Raster Tiles requests free, then pay as you go.
11. EOxCloudless licence, https://cloudless.eox.at/documentation/license, read: CC BY-NC-SA 4.0 for non-commercial use, commercial licence otherwise; credit "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data year)".
12. Esri and data attribution, interactive maps, https://developers.arcgis.com/documentation/esri-and-data-attribution/interactive-maps/, read: "Powered by Esri" with Esri linked to esri.com, bottom right; "Sources:" plus `copyrightText`, always visible; plain MapLibre must add both by hand.
13. Esri satellite brief, /mnt/project-files/sky-deck/docs/briefs/esri-imagery.md, earlier brief: EOX zoom 14 limit, USGS and GIBS resolution, keyed tile endpoints, referrers can be got around.

---

## 7. airplanes.live access and the backup ADS-B source (plan rows 0b, 19d)

**Decision for Sri:** airplanes.live refuses SkyDeck's requests (HTTP 403), so the backup source behind adsb.lol does nothing. Do you want to ask airplanes.live for access, replace it with another free backup, run with adsb.lol alone, or build an own receiver?

**Where it stands (2026-11-25):**
- The server still tries adsb.lol first and airplanes.live second, for both the map feed and search (`adsb-sources.ts`), with no key for airplanes.live and a 1 s gap between its requests. The `/status` page probes it and shows "Refused" for a 401, 403 or 429 (`status-probes.ts`).
- Since the 2026-11-20 brief: all feed requests now run through one shared `FeedHub` object (2026-11-22), and with `ADSBLOL_API_KEY` set, `quota-guard.ts` counts every adsb.lol request and never sends one over the key's limits (2026-11-23). DEPLOY.md says the free key allows 300 an hour and 1,000 a day, and that without the key the feed is refused. I did not check whether the key is set on the live site.
- New today: airplanes.live's API guide is now readable [1]. It says 1 request a second, "Non-Commercial Use", no feeder needed "currently", and no SLA. It names no approval process and no contact address. Its terms page and the API itself still refused my automated reader [2].
- Not found: any airplanes.live statement that cloud or datacenter addresses (such as Cloudflare's) are blocked. The earlier brief got the same 403 from Sri's home computer [7], so the block is not only about Cloudflare.

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Email airplanes.live and keep the code as is | Could restore a large second network | No contact or approval process is published [1]; may never answer; meanwhile every adsb.lol failure wastes a call on a 403 | $0; Sri 15 min |
| B. Remove airplanes.live, run adsb.lol alone | Simplest; removes a dead call and a red line on /status | One source: when the adsb.lol key quota runs out, the map shows saved copies only | $0; about 1 hour of code |
| C. Remove airplanes.live, add FlyItalyADSB as backup | Free self-serve key, no review; commercial use allowed; 30 a minute and 300,000 a month per key, radius up to 500 km [5] | Smaller network; CC BY-SA 4.0 credit needed [5]; radius in km, not nautical miles (earlier brief [7]); key on the server only | $0; Sri 5 min; half a day of code |
| D. Remove airplanes.live, add adsb.fi as backup | No key; 1 request a second; v3 point endpoint up to 250 nm [4] | "Personal, non-commercial use only"; whether a public hobby site counts as personal is not stated [4]; 4xx answers count toward a temporary IP block, which on shared Cloudflare addresses could hit us for others' mistakes [4] | $0; half a day of code, plus an email to adsb.fi |
| E. Own receiver feeding adsb.lol | adsb.lol feeder key: 7,200 a day and the raw re-api [3]; a feeder key is the long-term fix for row 19d | Hardware is not free: a FlightAware Pro Stick Plus is £57 and out of stock at one shop [9]; a full Pi build is about $130 to $180 (secondary [10]); adsb.fi's feeder perk is tied to the feeder's own IP, so it does not help the Worker [4] | About $150 once; a weekend to set up |
| F. ADS-B Exchange | Big network | $10 a month for 10,000 requests, non-commercial [6] | Paid, so ruled out |
| G. OpenSky | | Excluded by project policy: needs a written licence for live use [8] | n/a |

**Recommendation:** Do B now and C straight after. airplanes.live publishes no way to ask for access [1] and refuses even home connections [7], so it should not sit in the request path or on the status page. FlyItalyADSB is the only free backup whose terms clearly allow a public site [5]; adsb.fi's "personal use" wording is too unclear to rely on without asking. Sri can still send airplanes.live a short note if a contact address turns up, but nothing should wait for it. Leave the own receiver (E) for row 19d, since it costs money. This is not legal advice.

**Credits wording (row 0f):** remove the `airplanes-live` entry from `credits.ts` and README line 139. For FlyItalyADSB add: "Aircraft data from FlyItalyADSB (flyitalyadsb.com), licensed under CC BY-SA 4.0", with links to the site and the licence [5]. The adsb.lol entry (ODbL 1.0 [3]) stays as it is.

**If Sri agrees, next steps:**
1. A code thread: remove airplanes.live from `adsb-sources.ts` (feed source list, `PROVIDER_MIN_GAP_MS`, `FEED_PROVIDER_ORDER`, `READSB_HOSTS`), `status-probes.ts`, `credits.ts`, the `adsb.functions.ts` comment, README lines 109 and 139 and `AGENTS.md`.
2. Sri: get a free key at https://flyitalyadsb.com/en/dati/api/ (an email address, the key is shown once). Store it with `bunx wrangler secret put FLYITALY_API_KEY --name skydeck`. Never paste it into a chat.
3. The same thread: add FlyItalyADSB as the second source (`X-Api-Key` header, km radius, its own quota counter in `quota-guard.ts` at about 85% of 30 a minute and 300,000 a month), a `/status` probe, and the credit above.
4. Optional, Sri: open https://airplanes.live in a normal browser, read the terms page and look for a contact address. If one exists, ask whether a non-commercial hobby site on Cloudflare Workers may use the API at 1 request a second.
5. Optional, Sri: ask adsb.fi (contact on its GitHub page [4]) whether a free public hobby site counts as "personal, non-commercial use", if a third source is ever wanted.

**Sources** (read 2026-11-25 unless marked)
1. airplanes.live API guide, https://airplanes.live/api-guide, read: 1 request per second; "Non-Commercial Use"; "Access does not currently require a feeder"; "No SLA No Uptime Guarantee"; no contact or approval process named.
2. airplanes.live terms of use and API, https://airplanes.live/terms-of-use/ and https://api.airplanes.live/v2/point/40.64/-73.78/5, refused: both failed with a client error for the automated reader; Sri must read the terms in a browser.
3. adsb.lol API docs, https://www.adsb.lol/docs/open-data/api, read: no key 500 a day per IP; anonymous 500; adhoc 1,000; feeder 7,200 a day plus re-api; `x-api-key` header; 429 with Retry-After; ODbL 1.0. It does not show the hourly limit that DEPLOY.md uses.
4. adsb.fi open data README, https://github.com/adsbfi/opendata/blob/main/README.md, read: base `opendata.adsb.fi/api/`; `/v3/lat/../lon/../dist/..` up to 250 nm; 1 request a second; feeders get `/v2/snapshot` by IP; 4xx answers count toward a temporary IP block; "personal, non-commercial use only"; cite adsb.fi with a link.
5. FlyItalyADSB API page, https://flyitalyadsb.com/en/dati/api/, read: free self-serve key; 30 a minute and 300,000 a month per key, 100 a minute per IP; 500 km radius; commercial use allowed; CC BY-SA 4.0, credit FlyItalyADSB; use the key from the server.
6. ADS-B Exchange API Lite, https://www.adsbexchange.com/api-lite/, read: $10 a month for 10,000 requests through RapidAPI, non-commercial.
7. ADS-B providers brief, /mnt/project-files/sky-deck/docs/briefs/adsb-providers.md, earlier brief: airplanes.live 403 from Sri's own computer on 2026-11-21; FlyItalyADSB radius in km; Cloudflare egress IPs are shared.
8. FlyItalyADSB provider comparison (updated 2026-11-11), https://flyitalyadsb.com/en/dati/confronto/, secondary: OpenSky needs a written licence for operational REST use; airplanes.live allows other commercial use only with approval.
9. The Pi Hut, FlightAware Pro Stick Plus, https://thepihut.com/collections/all/products/flightaware-pro-stick-plus-usb-sdr-ads-b-receiver, secondary: £57 including VAT, out of stock.
10. SpecPicks, build an ADS-B flight tracker with a Raspberry Pi 4 (2026), https://specpicks.com/reviews/build-ads-b-flight-tracker-raspberry-pi-4-2026, secondary: about $130 to $180 for a full build; its own totals do not add up exactly.

---

## 8. Aircraft photos from Planespotters (plan row 13d)

**Decision for Sri:** Should SkyDeck show Planespotters photo thumbnails for the selected aircraft (and on collected registrations), following the rules on Planespotters' own Photo API page?

**Where it stands (2026-11-25):**
- No photos anywhere on `dev`: `AircraftPanel.tsx`, `CollectionDialog.tsx` and `src/lib/collection.ts` have no image code, and `credits.ts` has no photo source. The collection lives in localStorage and keeps type and registration counts only.
- The page's security policy (`src/lib/csp.ts`) allows images only from SkyDeck itself (`img-src 'self' data: blob:`), so photos need two new hosts added there. `Referrer-Policy` is `strict-origin-when-cross-origin`, so the browser sends the Origin/Referer that Planespotters checks for, and `public/sw.js` ignores requests to other sites, so it would never cache a photo.
- New since the 2026-11-20 brief: Planespotters has a dedicated Photo API page with clear written rules [1], and its general terms now load at a new address [2]. The earlier brief found no API terms and could not read the terms page. Both pages answered an automated reader today, but only as a summary, so Sri should still read them once in a browser.
- The API worked today without a key and returns, per photo, a 200 px and a 420 px thumbnail address, a photo-page link and the photographer's name [3].

**What the Photo API page says (summary of [1]; not legal advice):** the API is free with no key; two endpoints, `/pub/photos/hex/<hex>` and `/pub/photos/reg/<reg>`. Each photo needs the photographer's name in visible text next to the image, and the thumbnail must be a plain link (no `nofollow`) to the photo page the API returned. All returned addresses must be used unchanged: no proxying, rewriting or re-hosting. The browser that shows the image must load it directly; it may be held in memory while on screen but not saved. API answers may be cached for at most 24 hours. Photos may not be a paid, premium or members-only feature, and thumbnail sizes must be the same for everyone. No use for training or evaluating AI models, and no re-exposing the data through SkyDeck's own API or exports. "Reasonable" volume only; contact them for higher volume. Access can be revoked at any time. No separate commercial-use clause. The general terms add that thumbnails must keep the author's attribution and link back to the original photo [2].

**Options**

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. No photos (today) | Nothing to maintain or get wrong. | Panel and collection stay text only. | None. |
| B. Planespotters thumbnails, loaded in the browser, aircraft panel first | Written rules fit SkyDeck (free, public, low volume) [1]; good coverage; same approach as tar1090, which has a "Pictures planespotters.net" setting [4][5]; another open-source tracker read the rules the same way [6]. | Strict rules: visible credit, plain link, unchanged URLs, nothing stored over 24 h, never sent to SkyDeck's AI features. Access can be withdrawn. The collection list could create bursts if every row loads a photo. Whether the API sends CORS headers for skydeck's origin was not tested. | Free. About half a day of agent work plus tests; 10 minutes for Sri to read two pages. |
| C. airport-data.com thumbnails | Simple API by hex or registration, returns photographer and link [7]. | The API page states no attribution, caching or rate-limit rules [7]; the only "permission" is an undated forum post by the site admin, with other posters saying each photographer must agree [8]. | Free; similar work to B. |
| D. Wikimedia Commons | Free licences; reuse is clearly allowed. | Each file has its own licence and attribution text to show [10]; few photos are searchable by registration; much more code. | Free; one to two days of work. |
| E. JetPhotos | Large archive. | No public photo API was found [9]. | Not possible today. |

**Recommendation:** Choose B, aircraft panel only at first, and make it follow the Photo API page to the letter: load from the browser, show "Photo © <photographer>" next to the image, wrap the thumbnail in a plain link to the returned photo page, keep answers in tab memory for at most an hour, and store nothing. For the collection dialog, add a "Show photo" button per registration rather than loading photos for every row. No email to Planespotters is needed for this volume [1]; option C is weaker on terms and D is much more work for few matches.

**If Sri agrees, next steps:**
1. Sri: open https://www.planespotters.net/photo/api and https://www.planespotters.net/legal/termsofuse in a normal browser. Check the rules listed above, look for any date or new clause (commercial use, rate numbers, attribution wording), and reply "photos OK" or what differs.
2. Agent: add `src/lib/planespotters.ts`: fetch `/pub/photos/hex/<hex>` from the browser only after an aircraft is selected; check the JSON shape; reject anything not `https`; keep the URLs exactly as returned; in-memory cache of about 32 entries for at most 1 hour; no localStorage, Supabase or service-worker storage; quietly show nothing on errors or 403.
3. Agent: a small photo component in `AircraftPanel.tsx` using the 200 px `thumbnail` (same size for every visitor), inside `<a href={link} target="_blank" rel="noopener">` (no `nofollow`), with the photographer's name in visible text beside it. Never pass photo data to the AI description code.
4. Agent: add `https://api.planespotters.net` to `connect-src` (in `CSP_CONNECT_ORIGINS`) and `https://t.plnspttrs.net` to `img-src` in `src/lib/csp.ts`, with tests; test in `npm run dev` that the API answers the browser (CORS) and the image loads.
5. Agent: a "Planespotters.net" entry in `src/lib/credits.ts` (new group such as "Aircraft photos", linking the Photo API page) and in the README's data sources; a flag in `flags.ts` so photos can be switched off quickly if access is withdrawn.
6. Later, optional: the "Show photo" button in `CollectionDialog.tsx`, reusing the same component and cache; never save photo data in the collection record.

**Sources** (read 2026-11-25 unless marked)
1. Planespotters.net Photo API, https://www.planespotters.net/photo/api, read (via a summarising reader; Sri to confirm in a browser). Rules summarised above; two endpoints; no date on the page.
2. Planespotters.net Terms of Use, https://www.planespotters.net/legal/termsofuse, read. Thumbnails go to partner sites, must keep author attribution and link back; no API section. The old address /about/termsofuse failed today.
3. Planespotters API answer, https://api.planespotters.net/pub/photos/hex/4CA87C, read. Fields: thumbnail, thumbnail_large, link, photographer; no licence fields.
4. tar1090 `html/script.js`, https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/script.js, read. Has a "Pictures planespotters.net" toggle (`planespottersAPI`); the credit-drawing code was not located in what was read.
5. tar1090 docs summary, https://context7.com/wiedehopf/tar1090/llms.txt, secondary. Config options `showPictures` and `planespottersAPI`.
6. LiveTrafficStan issue #79 and PR #101, https://github.com/vasilyevstan/LiveTrafficStan/issues/79, secondary. Another tracker's reading of the same rules (credit, unchanged link, no image storage, 24 h JSON ceiling).
7. airport-data.com API, https://airport-data.com/api, read. `ac_thumb.json` by hex or registration; no stated attribution, caching or rate-limit rules.
8. airport-data.com forum thread 7267, https://discuss.airport-data.com/d/7267-using-photos-in-an-app, read. Admin's informal, undated view that thumbnails may be shown; other users disagree.
9. Web search "JetPhotos API public developers photos terms", secondary. No official public JetPhotos API found.
10. Commons: Reusing content outside Wikimedia, https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia, refused (the reader got no page). Known from search results only that attribution follows each file's licence; secondary.

---

## 9. ACARS label meanings (plan row 6c)

**Decision for Sri:** Where, if anywhere, should SkyDeck get plain-English meanings for ACARS labels (for example "QP" or "44"), given that the best-known list, `airframesio/acars-message-documentation`, still has no licence?

**Where it stands (2026-11-25):**
- On `dev`, `src/lib/acars-explain.ts` explains about 30 standard abbreviations (ETA, RWY, PAX) by fixed rules and shows the label only as its raw code; its header says labels are deliberately not explained. `acars-messages.ts` just reads the `label` field. SkyDeck does not use any Airframes decoder package.
- The documentation repository still has no licence (GitHub reports none), was last pushed 2026-03-15, and its README still says the documentation is "PENDING" [1][2]. Its research notes are observed examples, not definitions: `research/1L.md` gives no meaning for "1L" and uses "appears to be" throughout [5].
- New since the 2026-11-20 brief and correcting plan row 6c: the MIT-licensed `@airframes/acars-decoder` does carry plain descriptions, one per message format it decodes, for example label QP "OUT Report", label 44 "ETA Report", and labels 80, 30 to 33 and others "Airline Defined Position Report" [6][7][8][9]. It is a decoder, not a general label dictionary: it names a message only when it recognises the format.
- Other sources re-checked: libacars is MIT and dumpvdl2 GPL-3.0, neither seen to hold a label table [10][11]; acarsdec is now archived with no licence [12]. A Rust crate has a roughly 100-code table, but it calls it "best-effort curated" from mixed sources and is under LGPL-2 [13]. Wikipedia, sigidwiki and the Airframes glossary have no label table [14][15][16]. Copies of the paywalled ARINC 620 standard appear in search results; they are unauthorised and must not be used.

**Options** (label meanings are facts, but a compiled table can still be protected; not legal advice)

| Option | Good | Watch out for | Cost |
| --- | --- | --- | --- |
| A. Keep labels unexplained (today) | No risk of a wrong or unlicensed meaning. | The label stays a bare code. | None. |
| B. Use `@airframes/acars-decoder` (MIT) and show its description when it decodes a message | Clear MIT licence [6][7]; maintained (pushed 2026-11-22); the description comes from the format actually recognised, so it is less of a guess than a code-to-meaning table; it can also pull out fields (times, positions). | Covers only formats it knows (about 95 plugins [8]); the same label can mean different things per airline, so show the decoder's description, not "label X means". Adds a dependency (`pako`) to the bundle or server. Message text is untrusted: render output as plain text only. MIT notice and credit needed. | Free. About a day of agent work with tests. |
| C. Ask the maintainers to licence the documentation repo | Would unlock the fullest community notes, credited properly. | They may not answer or may say no; the notes are mostly unconfirmed guesses [5], so even with a licence many entries are not safe to show as fact. | Free; 5 minutes for Sri to post the issue, then waiting. |
| D. Write SkyDeck's own short list with a citation per entry | Full control. | No free, licensed, authoritative source to cite: the standard is paywalled and the free lists are unlicensed or unclear [13][17]. | Free, but slow and still weakly sourced. |

**Recommendation:** Choose B now and post C in parallel. B gives real, correctly licensed descriptions for the messages the decoder recognises and keeps SkyDeck's rule of never guessing: when the decoder does not recognise a message, the label stays a bare code. If the maintainers add a licence later, revisit C as an extra layer, but only for entries their notes mark as confirmed. Drop D.

**Draft GitHub issue for Sri to post** on https://github.com/airframesio/acars-message-documentation/issues (posting it from your own account is your choice):

> **Title:** Could the research notes get a licence?
>
> Hi, and thank you for collecting these notes. I am building a free, non-commercial, open-source (MIT) flight tracker that shows ACARS messages from the Airframes API. I would like to show a one-line plain-English description for common labels, credited to this repository with a link. The repository has no licence file, so I have not copied anything from it. Would you consider adding a licence (for example CC BY 4.0 or MIT), or letting me know whether short label descriptions with credit and a link would be fine? Thank you either way.

**If Sri agrees, next steps:**
1. Sri: say "use the decoder" (option B), and post the issue above if you want (or email licensing@airframes.io, the contact the earlier brief found on Airframes' data repo [18]).
2. Agent: add `@airframes/acars-decoder` at a pinned version; decide by bundle size whether it runs in the browser or in the existing ACARS server function.
3. Agent: in `src/lib/acars-explain.ts`, add a "Message type" line from the decoder's description when it decodes the message, tagged "Decoded by the Airframes ACARS decoder (MIT)"; keep the raw label and original text; show nothing extra when it does not decode. Tests with real sample messages for QP, 44 and an unknown label.
4. Agent: add the decoder to `src/lib/credits.ts` and the README with its MIT notice; update plan row 6c (the decoder does hold descriptions).
5. Later: if the maintainers add a licence, a separate task to review their confirmed entries only.

**Sources** (read 2026-11-25 unless marked)
1. GitHub API, https://api.github.com/repos/airframesio/acars-message-documentation, read. `license: null`; pushed 2026-03-15; 8 open issues.
2. Repository page, https://github.com/airframesio/acars-message-documentation, read. Documentation "PENDING"; pull requests welcome; nothing on licence or reuse.
3. Issues list, https://github.com/airframesio/acars-message-documentation/issues, read. Four open titles visible (e.g. "label a9"); none about licence (titles only).
4. `research` folder listing via GitHub API, read. At least 90 label files (listing was cut off; the earlier brief counted 143 entries).
5. `research/1L.md`, https://raw.githubusercontent.com/airframesio/acars-message-documentation/main/research/1L.md, read. Examples from six airlines; no definition; no licence note.
6. GitHub API, https://api.github.com/repos/airframesio/acars-decoder-typescript, read. MIT; pushed 2026-11-22.
7. Decoder `package.json`, read. `@airframes/acars-decoder` 1.10.0, MIT, depends on `pako`.
8. Decoder `lib/MessageDecoder.ts`, read. About 95 plugins named by label; no central label table.
9. Decoder plugins `lib/plugins/Label_QP.ts`, `Label_44_ETA.ts`, `Label_80.ts`, read. Descriptions "OUT Report", "ETA Report", "Airline Defined Position Report" and OOOI report names.
10. GitHub API, https://api.github.com/repos/szpajder/libacars, read. MIT; pushed 2026-11-23.
11. GitHub API, https://api.github.com/repos/szpajder/dumpvdl2, read. GPL-3.0.
12. GitHub API, https://api.github.com/repos/TLeconte/acarsdec, read. No licence; archived.
13. sdr-acars `label.rs` and `NOTICE`, https://docs.rs/crate/sdr-acars/0.1.0/source/src/label.rs, secondary (third-party crate). About 100 codes, "best-effort curated", LGPL-2 derivative of acarsdec.
14. Wikipedia "ACARS", https://en.wikipedia.org/wiki/ACARS, read. No label table; cites ARINC 618.
15. sigidwiki ACARS page, https://sigidwiki.com/wiki/Aircraft_Communications_Addressing_and_Reporting_System_(ACARS), read. Frequencies only; no licence stated.
16. Airframes docs glossary, https://docs.airframes.io/docs/glossary, read. Terms only; "Copyright 2026 Airframes.io".
17. FlightAware forum "ACARS Message Labels", https://discussions.flightaware.com/t/acars-message-labels/52671, secondary. Links to hobby lists with no stated licence.
18. `airframesio/data` licence contact licensing@airframes.io, earlier brief (secondary there, not re-checked).
