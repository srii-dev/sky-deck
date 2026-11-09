-- Phase 5g: the signed-in user's watchlist and recently viewed flights, so they follow the user across devices.
-- Row-level security is on in this migration; a user can read and change only their own rows.
-- Limits (50 watched items, 15 recent flights) are enforced here too, not only in the app.

create table public.watchlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('flight', 'aircraft', 'airport')),
  key text not null check (char_length(key) between 3 and 10),
  label text not null check (char_length(label) <= 60),
  added_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.watchlist_items enable row level security;

create policy "watchlist_select_own" on public.watchlist_items
  for select using ((select auth.uid()) = user_id);

create policy "watchlist_insert_own" on public.watchlist_items
  for insert with check (
    (select auth.uid()) = user_id
    and (select count(*) from public.watchlist_items w where w.user_id = (select auth.uid())) < 50
  );

create policy "watchlist_update_own" on public.watchlist_items
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "watchlist_delete_own" on public.watchlist_items
  for delete using ((select auth.uid()) = user_id);


create table public.recent_flights (
  user_id uuid not null references auth.users (id) on delete cascade,
  hex text not null check (hex ~ '^[0-9a-f]{6}$'),
  callsign text check (char_length(callsign) <= 12),
  registration text check (char_length(registration) <= 12),
  type text check (char_length(type) <= 8),
  viewed_at timestamptz not null default now(),
  primary key (user_id, hex)
);

alter table public.recent_flights enable row level security;

create policy "recent_select_own" on public.recent_flights
  for select using ((select auth.uid()) = user_id);

create policy "recent_insert_own" on public.recent_flights
  for insert with check ((select auth.uid()) = user_id);

create policy "recent_update_own" on public.recent_flights
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "recent_delete_own" on public.recent_flights
  for delete using ((select auth.uid()) = user_id);

-- Keep only the 15 most recently viewed flights per user. Runs as the signed-in user (security invoker), so
-- row-level security still applies to the delete.
create function public.trim_recent_flights()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.recent_flights r
  where r.user_id = new.user_id
    and r.hex not in (
      select r2.hex from public.recent_flights r2
      where r2.user_id = new.user_id
      order by r2.viewed_at desc
      limit 15
    );
  return null;
end;
$$;

create trigger recent_flights_trim
  after insert or update on public.recent_flights
  for each row execute function public.trim_recent_flights();
