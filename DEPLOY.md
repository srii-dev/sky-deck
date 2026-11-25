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

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are public by design (they reach every browser). `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `GEMINI_API_KEY` are real secrets; never put them in a `VITE_` variable. Without the Supabase pair the site works but sign-in is off. The web push settings (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `SUPABASE_SERVICE_ROLE_KEY`) have their own checklist below.

adsb.lol key quota: the free key allows 300 requests an hour and 1,000 a day, far fewer than continuous polling needs. The app counts its requests (kept at about 85% of each limit) and, when the quota is used up, shows saved copies up to an hour old instead of sending requests that would be refused; repeated 429s can get a free key revoked. A paid key needs its own numbers in `ADSBLOL_FREE_LIMITS` (`src/lib/quota-guard.ts`).

AI sharing: the build adds a second Durable Object, `AiHub` (binding `AI_HUB`, migration tag `v2`, `new_sqlite_classes`), next to `FeedHub` (tag `v1`). Deployed migration tags must never be edited; add a new tag for any further change. The first deploy applies `v2` automatically. `AiHub` reads `AI`, `GEMINI_API_KEY` and `AI_ENABLED` from its own environment.

Closed-page alerts (web push, Phase 10f): the build adds a third Durable Object, `PushHub` (binding `PUSH_HUB`, migration tag `v3`), and a cron trigger every two minutes (`*/2 * * * *`) that runs its check. Until the four push settings exist the cron run returns at once, without calling the object, and the Alert rules dialog says the closed-page switch is "Not available on this site yet". Switching it on is its own checklist: see "Closed-page alerts: switch-on checklist" below.

Shared feed cache: the build adds a Durable Object, `FeedHub` (binding `FEED_HUB`, a SQLite class, the only kind on the Workers Free plan), with migration tag `v1`. The first deploy creates it; nothing needs setting up. Every feed request then also counts as one Durable Object request.

AI (ACARS panel descriptions): the build adds a Workers AI binding named `AI` to the Worker, so nothing needs setting up for it. `GEMINI_API_KEY` is optional and only used when Workers AI fails or its daily budget is used (`bunx wrangler secret put GEMINI_API_KEY --name skydeck`). Set `AI_ENABLED` to `off` to switch all AI off.

Supabase keep-alive: the build adds a second, daily cron trigger (`17 4 * * *`, 04:17 UTC) to the Worker. It reads one row of `profiles` as the anonymous role (row-level security returns none) so the free Supabase project is not paused after a week without activity. It uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` above and nothing else; without them it logs "not configured, skipped". Check it in the Cloudflare dashboard (Workers, skydeck, Settings, Trigger events) and in the logs (`[keepalive] supabase ok (200)`). Locally: `bun run preview:worker -- --test-scheduled`, then open `http://127.0.0.1:4174/cdn-cgi/handler/scheduled?cron=17+4+*+*+*`.

Cron triggers: the Worker now has two (`17 4 * * *` and `*/2 * * * *`, both declared in `vite.config.ts`). The Workers Free plan allows 5 per account, so 3 are left for any other Worker on the account. A deploy replaces the list; the dashboard (Workers, skydeck, Settings, Trigger events) shows both.

## Closed-page alerts: switch-on checklist

Web push (Phase 10f, PRs #102 and #105) ships switched off. Do these in order, once. Every command runs on your own computer from the repository folder; a secret's value is typed at the prompt Wrangler shows, never on the command line, in chat or in the repository.

1. **Deploy the code first** (the usual "Deploy" above, from `main`). The site works the same as before: the cron run finds no `VAPID_PRIVATE_KEY` and stops, and the switch is not offered. Check `/api/health` and the map.
2. **Apply both migrations, in this order**, in the Supabase dashboard (SQL Editor, paste the file, Run), or with `supabase db push` once the CLI is linked:
   1. `supabase/migrations/20261125000000_web_push.sql` (tables `push_subscriptions` and `push_rules`, row-level security, own-row policies).
   2. `supabase/migrations/20261125010000_web_push_limits.sql` (moves the 5-browser and 20-rule limits from the insert policies into triggers and sets `created_at` and `updated_at` on the server). Apply it in the same sitting: with only the first file, every subscribe fails with "infinite recursion detected in policy".

   Check in the SQL Editor that both tables have row-level security and both triggers exist:

   ```sql
   select tablename, rowsecurity from pg_tables
   where schemaname = 'public' and tablename in ('push_subscriptions', 'push_rules');
   select tgname from pg_trigger
   where tgrelid in ('public.push_subscriptions'::regclass, 'public.push_rules'::regclass) and not tgisinternal;
   ```

   Expected: two rows with `rowsecurity` true, then `push_subscriptions_before_write` and `push_rules_before_write`. Then run the Security Advisor (Database, Advisors): it should report nothing new.
3. **Make the VAPID key pair once**: `npx web-push generate-vapid-keys` (downloads the `web-push` tool for that one command; nothing is added to the project). It prints a public key and a private key. Save both in your password manager straight away. Never make a new pair later: every saved browser subscription belongs to this pair, and a new one silently stops alerts for everyone until they switch them on again.
4. **Set the four secrets** (each command asks for the value and creates a new version of the live Worker with it; nothing is redeployed from the repository):

   ```sh
   bunx wrangler secret put VAPID_PUBLIC_KEY --name skydeck            # the public key from step 3
   bunx wrangler secret put VAPID_PRIVATE_KEY --name skydeck           # the private key from step 3
   bunx wrangler secret put VAPID_SUBJECT --name skydeck               # https://skydeck.sky-deck.workers.dev until there is a contact address (a mailto: address also works)
   bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name skydeck   # Supabase dashboard, Project Settings, API Keys
   ```

   For `SUPABASE_SERVICE_ROLE_KEY` use the legacy `service_role` key (the long value starting `eyJ`, on the Legacy API keys tab): the check sends it both as `apikey` and as `Authorization: Bearer`, which is how the legacy key is used. A new `sb_secret_` key was not tested with this code. The service role key bypasses row-level security; it is used only inside `PushHub` (`getPushConfig` only checks that it is set) and never reaches a browser or a log. `bunx wrangler secret list --name skydeck` shows the names (never the values). Alerts switch on when the last of the four is set.
5. **Check the cron runs** (`bunx wrangler tail skydeck`, or the dashboard's Workers Logs). Every two minutes there should be one `[push-check]` line with counts only, for example `{"rules":0,"circles":0,"circlesFailed":0,"skipped":0,"events":0,"sent":0,"failed":0,"removed":0,"retried":0}`. No line at all means a setting is missing (the object answers "not-configured", which is not logged) or the cron did not run (check Trigger events). `[push-check] failed:` means the object threw; the message says why. Once a day, at 04:17 UTC, `[keepalive] supabase ok (200)` should appear too.
6. **Try it end to end** on a laptop and an Android phone (Chrome) with a test account: sign in, Watchlist, Alert rules, make a rule with a small area over busy airspace (for example "any aircraft within 10 nm of" a large airport), switch on "Also alert me when SkyDeck is closed", allow notifications, then close every SkyDeck tab. A notification should arrive within a few minutes, and clicking it should open the map on that aircraft. On an iPhone or iPad, web push works only after "Add to Home Screen" (iOS 16.4 or later), from the installed app. Then check in Supabase (Table Editor) that `push_subscriptions` has one row per browser and `push_rules` only the rules with an area, and that switching the alerts off in a browser removes that browser's row (and the rules, once no browser is left).
7. **Watch the free-plan numbers for the first days** (Cloudflare dashboard, Workers and Durable Objects metrics): each check is one Durable Object request to `PushHub` plus one per feed circle it loads through `FeedHub` (at most 20), so up to about 15,000 of the plan's 100,000 daily Durable Object requests once rules exist; with no rules it is 720 a day. Each check also makes at most about 25 outside requests (database reads, up to 20 pushes, a few deletes). The CPU time per check was not measured; if the `PushHub` metrics show errors or the check takes long, switch it off (below) and report it.

To switch closed-page alerts off again without a deploy: `bunx wrangler secret delete VAPID_PRIVATE_KEY --name skydeck`. The cron stops calling the object and the switch disappears from the dialog; saved subscriptions and rules stay in Supabase. To switch back on, put the same private key back (step 4); it must be the saved one, not a new pair.

## After a deploy

- `https://<address>/api/health` answers `{"status":"ok"}`.
- Run the smoke tests against it: `E2E_BASE_URL=https://<address> bun run test:e2e`.
- Open the site on a phone and a laptop, then follow `RELEASE.md` section 5.
- Set the Supabase Auth Site URL to the address (Supabase dashboard, Authentication, URL configuration). Done for the workers.dev address on 2026-11-25; set it again for a domain.
- In the dashboard (Workers, skydeck, Settings, Trigger events) both cron triggers are listed. Once web push is switched on, `[push-check]` lines appear every two minutes (see the checklist above).
- Note the new version id (`bunx wrangler deployments list --name skydeck`) in the release notes: it is the next rollback target.

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

Durable Object migrations: the Worker config in `vite.config.ts` declares the migration tags `v1` (`FeedHub`), `v2` (`AiHub`) and `v3` (`PushHub`). Never edit or remove a deployed tag, and never reuse one: Cloudflare keeps the history of applied tags per Worker and a changed history is refused or can orphan the stored data. Cloudflare also refuses a rollback across a Durable Object class change ([Rollbacks, Bindings](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings)): once a version with a new tag is live, `wrangler rollback` can only go back to versions that already had that tag. The first deploy with `v3` is therefore a one-way step: the versions live before it (4f6dc7dc, and 15abf587 before that) stop being rollback targets, and the new version is the earliest one. If that release itself is bad, fix forward: revert the bad change on `dev` (keep the `PushHub` export, its binding and the `v3` tag), promote and deploy; to stop only web push, delete `VAPID_PRIVATE_KEY` (see the checklist). Any further change to these classes is a new tag (`v4`, ...), never an edit, and is best deployed on its own, as Cloudflare advises.

Database changes are separate: undo them with a new migration (see `RELEASE.md`); never edit an applied one.

## Not covered yet

Custom domain, preview deployments per pull request (21b) and quota alarms (21d). They need a domain or further decisions. The uptime workflow runs (the repository variable `SITE_URL` was set on 2026-11-25).
