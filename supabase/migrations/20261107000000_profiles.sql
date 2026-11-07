-- Phase 18c: the first table. One row per signed-in user.
-- Rule for every table in this folder: row-level security is switched ON in the same migration
-- (src/test/migrations.test.ts checks this).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read and change only their own profile.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- There is deliberately no insert or delete policy: the row is created by the trigger below and
-- removed together with the auth user (on delete cascade).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
