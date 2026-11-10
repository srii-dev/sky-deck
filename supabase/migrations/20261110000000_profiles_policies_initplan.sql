-- Phase 17b: the database advisor flagged the two profiles policies for calling auth.uid() once per row.
-- Wrapping it in a select makes Postgres evaluate it once per query. Same rules as before: a user can
-- read and change only their own profile.

drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
