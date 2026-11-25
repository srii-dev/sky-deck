# Deploying to Cloudflare

SkyDeck builds into a Cloudflare Worker with static assets (`bun run build` writes `.output/`). This file is the whole procedure. Nothing here needs a secret in the repository or in chat.

## Once

1. A free Cloudflare account.
2. On your own computer: `bunx wrangler login`. A browser page asks you to approve. The login is stored on your computer, not in the repository.
3. Check it: `bunx wrangler whoami` shows the account (the list of permissions it prints is long; ignore it).

## Try the production build on your computer

```sh
bun run build
bun run preview:worker      # http://127.0.0.1:4174, runs in Cloudflare's local runtime, no login needed
E2E_BASE_URL=http://127.0.0.1:4174 bun run test:e2e
```

`bun run preview` (Vite's own preview) does not work with this build; use `preview:worker`.

## Deploy

Deploy only from `main` (production), after `dev` has been promoted to it (`CONTRIBUTING.md`, "Promote and deploy"). `dev` is the working branch and is never deployed.

```sh
git checkout main && git pull   # production code
bun run build
bun run deploy              # worker name: skydeck, public address https://skydeck.<your-subdomain>.workers.dev
```

The first deploy asks Cloudflare to register a free `workers.dev` subdomain if the account has none. Deploying makes the site public to anyone with the address.

## Settings the app reads

Set each one as a Worker secret (they persist across deploys). Values are typed at a prompt, never put on the command line or in the repository:

```sh
bunx wrangler secret put SUPABASE_URL --name skydeck
bunx wrangler secret put SUPABASE_ANON_KEY --name skydeck
bunx wrangler secret put SITE_URL --name skydeck        # public address, once there is a domain
bunx wrangler secret put FEED_BUDGET_PER_MIN --name skydeck   # optional
bunx wrangler secret put ADSBLOL_API_KEY --name skydeck  # adsb.lol key; without it the live feed is refused (HTTP 429)
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are public by design (they reach every browser). `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are real secrets; never put them in a `VITE_` variable. Without the Supabase pair the site works but sign-in is off.

adsb.lol key quota: the free key allows 300 requests an hour and 1,000 a day, far fewer than continuous polling needs. The app counts its requests (kept at about 85% of each limit) and, when the quota is used up, shows saved copies up to an hour old instead of sending requests that would be refused; repeated 429s can get a free key revoked. A paid key needs its own numbers in `ADSBLOL_FREE_LIMITS` (`src/lib/quota-guard.ts`).

AI sharing: the build adds a second Durable Object, `AiHub` (binding `AI_HUB`, migration tag `v2`, `new_sqlite_classes`), next to `FeedHub` (tag `v1`). Deployed migration tags must never be edited; add a new tag for any further change. The first deploy applies `v2` automatically. `AiHub` reads `AI`, `GEMINI_API_KEY` and `AI_ENABLED` from its own environment.

Closed-page alerts (web push, Phase 10f): the build adds a third Durable Object, `PushHub` (binding `PUSH_HUB`, migration tag `v3`), and a cron trigger every two minutes that runs its check. Until the settings below exist the cron run returns at once and nothing is sent. To switch it on: apply `supabase/migrations/20261125000000_web_push.sql` and then `20261125010000_web_push_limits.sql` (SQL editor or `supabase db push`; the second moves the account limits into triggers, without it every subscribe fails), make a VAPID key pair once on your own computer with `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (for example the site's https address) and `SUPABASE_SERVICE_ROLE_KEY` with `bunx wrangler secret put <NAME> --name skydeck`. Keep the key pair: a new one makes every saved subscription useless. Each check spends at most about 25 outside requests (2 database reads, up to 20 pushes, a few deletes) and up to 20 feed circles through `FeedHub`.

Shared feed cache: the build adds a Durable Object, `FeedHub` (binding `FEED_HUB`, a SQLite class, the only kind on the Workers Free plan), with migration tag `v1`. The first deploy creates it; nothing needs setting up. Every feed request then also counts as one Durable Object request.

AI (ACARS panel descriptions): the build adds a Workers AI binding named `AI` to the Worker, so nothing needs setting up for it. `GEMINI_API_KEY` is optional and only used when Workers AI fails or its daily budget is used (`bunx wrangler secret put GEMINI_API_KEY --name skydeck`). Set `AI_ENABLED` to `off` to switch all AI off.

Supabase keep-alive: the build adds a daily cron trigger (`17 4 * * *`, 04:17 UTC) to the Worker. It reads one row of `profiles` as the anonymous role (row-level security returns none) so the free Supabase project is not paused after a week without activity. It uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` above and nothing else; without them it logs "not configured, skipped". Check it in the Cloudflare dashboard (Workers, skydeck, Settings, Trigger events) and in the logs (`[keepalive] supabase ok (200)`). Locally: `bun run preview:worker -- --test-scheduled`, then open `http://127.0.0.1:4174/cdn-cgi/handler/scheduled?cron=17+4+*+*+*`.

## After a deploy

- `https://<address>/api/health` answers `{"status":"ok"}`.
- Run the smoke tests against it: `E2E_BASE_URL=https://<address> bun run test:e2e`.
- Open the site on a phone and a laptop, then follow `RELEASE.md` section 5.
- Set the Supabase Auth Site URL to the address (Supabase dashboard, Authentication, URL configuration).

## Optional settings and switches

- `SITE_URL`: the public address (for canonical links, the sitemap and link previews). Set on the live preview.
- `SITE_INDEXING`: set to `off` (`bunx wrangler secret put SITE_INDEXING --name skydeck`, type `off`) to keep the site out of search engines until launch; delete it to allow indexing.
- Publish without the ACARS card or the Satellite map: build with `VITE_FLAGS="-acars,-satellite"` (set the variable for that one command: `VITE_FLAGS="-satellite" bun run build`), then deploy as usual. Both are on in a normal build.
- Link-preview image: `node scripts/make-share-image.mjs` redraws `public/og-image.png` (for example after a rebrand).
- Policy reports: `bunx wrangler tail skydeck` shows `[csp-report]` lines (directive, blocked address, page).
- Uptime check: `node scripts/uptime-check.mjs https://<address>` by hand. The scheduled workflow (`.github/workflows/uptime.yml`) also needs the repository variable `SITE_URL`, and GitHub runs it only from the default branch (`main`).

## Roll back

This is the only rollback procedure; `RELEASE.md` points here.

1. List the recent versions and pick the last good one: `bunx wrangler deployments list --name skydeck`. Note its version id.
2. Roll back to it: `bunx wrangler rollback <version-id> --name skydeck` (without an id it goes to the previous version). Wrangler asks for a message; say why.
3. Check it: `https://<address>/api/health` answers `{"status":"ok"}`, then run the live tests: `E2E_BASE_URL=https://<address> bun run test:e2e`. Open the site once on a phone or laptop.
4. If visitors still see the bad version, the service worker cached it: change `CACHE` in `public/sw.js` and redeploy from `main` (see `RELEASE.md` section 5).
5. Fix on `dev`, promote to `main` and deploy again. A rollback does not change the code on `main`; the next deploy replaces it.

Durable Object migrations: the Worker config in `vite.config.ts` declares the migration tags `v1` (`FeedHub`), `v2` (`AiHub`) and `v3` (`PushHub`). Never edit or remove a deployed tag, and never reuse one: Cloudflare keeps the history of applied tags per Worker and a changed history is refused or can orphan the stored data. A rollback moves the Worker code back but does not undo a migration, and the objects keep their data. So an older version must still be able to run next to the `FeedHub` and `AiHub` classes (do not roll back to a version from before `v2` and expect `AiHub` to disappear). Any further change to those classes is a new tag (`v3`, ...), never an edit.

Database changes are separate: undo them with a new migration (see `RELEASE.md`); never edit an applied one.

## Not covered yet

Custom domain, preview deployments per pull request (21b) and quota alarms (21d). The uptime check is prepared but needs the repository variable `SITE_URL` (see above). They need a domain or further decisions.
