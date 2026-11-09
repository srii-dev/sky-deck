# Database (Supabase)

SQL migrations for the Supabase project. Nothing here is applied automatically. The project exists (see "Status of the real project" below).

## Rules

- One migration file per change, named `YYYYMMDDHHMMSS_description.sql`, applied in name order.
- Every table switches row-level security on in the same migration and has explicit policies. `src/test/migrations.test.ts` checks this.
- No secrets, keys or connection strings in these files, ever.
- Never edit a migration that has been applied: add a new one.
- Test data lives in a seed file that contains only invented values (plan item 18i), never real users or real messages.

## Applying a migration (by hand, until the Supabase CLI is set up)

1. Open the project in the Supabase dashboard, then SQL Editor.
2. Paste the migration and run it.
3. Check Authentication, then Policies: every table must show "RLS enabled".

With the Supabase CLI later: `supabase db push` after linking the project.

## Tables

| Table | Purpose | Migration |
| --- | --- | --- |
| `profiles` | one row per signed-in user (optional display name); created by a trigger when a user signs up | `20261107000000_profiles.sql`, `20261109000000_revoke_handle_new_user_execute.sql` |

Planned (each in its own migration with its own policies, when its phase starts): `watchlist_items` (5g), `saved_views` (22e), `wait_reports` (4k), `ai_cache` and `ai_budget` (18g), `feedback` (23b), `moderation_actions` (23e).

## Status of the real project

A free Supabase project named `skydeck` (region us-east-1) was created on 2026-11-09. The migrations in this folder were applied to it through the Supabase connector, which records them in the project's own migration list under its own timestamps (the file names here are the source of truth).

- `20261107000000_profiles.sql`: ran without errors. `profiles` has row-level security on (checked with the connector's table listing).
- `20261109000000_revoke_handle_new_user_execute.sql`: added because the project's security advisor reported that `handle_new_user()` could be called through the public API (`/rest/v1/rpc/handle_new_user`). After the revoke the advisor reported no findings.

## Account deletion function

`20261109010000_delete_my_account.sql` adds `public.delete_my_account()`: a signed-in user deletes their own auth user, and the profile row goes with it (cascade). The id comes from the session (`auth.uid()`), never from an argument. Execute is revoked from `public` and `anon` and granted to `authenticated`. The Supabase security advisor therefore lists one warning ("signed-in users can execute a security definer function"); that is intended and is how users delete their own account without a server-side admin key.

Checked on the real project on 2026-11-09 inside one rolled-back transaction: a new auth user got a profile row from the signup trigger, an `anon` call to the function was refused, and a call as that user removed both the user and the profile. It was also used from the browser through the Account dialog.

## NOT VERIFIED

Sign-up through the app (and the confirmation email link) has not been exercised: the test user was created directly in the database. The Auth Site URL must be set in the Supabase dashboard (Authentication, URL Configuration) to the real site address before confirmation emails work.
