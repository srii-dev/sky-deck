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
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are public by design (they reach every browser). `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are real secrets and are not needed yet; never put them in a `VITE_` variable. Without the Supabase pair the site works but sign-in is off.

## After a deploy

- `https://<address>/api/health` answers `{"status":"ok"}`.
- Run the smoke tests against it: `E2E_BASE_URL=https://<address> bun run test:e2e`.
- Open the site on a phone and a laptop, then follow `RELEASE.md` section 5.
- Set the Supabase Auth Site URL to the address (Supabase dashboard, Authentication, URL configuration).

## Roll back

```sh
bunx wrangler deployments list --name skydeck
bunx wrangler rollback --name skydeck
```

Database changes are separate: undo them with a new migration (see `RELEASE.md`).

## Not covered yet

Custom domain, preview deployments per pull request (21b), uptime checks and quota alarms (21d), scheduled jobs and a shared cache (18f, 19h). They need a domain or further decisions.
