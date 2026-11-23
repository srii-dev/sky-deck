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

```sh
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

Shared feed cache: the build adds a Durable Object, `FeedHub` (binding `FEED_HUB`, a SQLite class, the only kind on the Workers Free plan), with migration tag `v1`. The first deploy creates it; nothing needs setting up. Every feed request then also counts as one Durable Object request.

AI (ACARS panel descriptions): the build adds a Workers AI binding named `AI` to the Worker, so nothing needs setting up for it. `GEMINI_API_KEY` is optional and only used when Workers AI fails or its daily budget is used (`bunx wrangler secret put GEMINI_API_KEY --name skydeck`). Set `AI_ENABLED` to `off` to switch all AI off.

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

```sh
bunx wrangler deployments list --name skydeck
bunx wrangler rollback --name skydeck
```

Database changes are separate: undo them with a new migration (see `RELEASE.md`).

## Not covered yet

Custom domain, preview deployments per pull request (21b), uptime checks and quota alarms (21d), scheduled jobs and a shared cache (18f, 19h). They need a domain or further decisions.
