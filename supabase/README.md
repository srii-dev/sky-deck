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

A free Supabase project named `skydeck` (region us-east-1) was created on 2026-11-09. Both migrations in this folder were applied to it through the Supabase connector, which records them in the project's own migration list under its own timestamps (the file names here are the source of truth).

- `20261107000000_profiles.sql`: ran without errors. `profiles` has row-level security on (checked with the connector's table listing).
- `20261109000000_revoke_handle_new_user_execute.sql`: added because the project's security advisor reported that `handle_new_user()` could be called through the public API (`/rest/v1/rpc/handle_new_user`). After the revoke the advisor reported no findings.

## NOT VERIFIED

The signup trigger has not been exercised: no user has signed up yet, so it is not proven that a `profiles` row appears for a new user, or that the trigger still fires after the revoke (Postgres does not check EXECUTE when a trigger fires, but this was not tested). Test it with the first sign-in (plan item 18d).
