-- Fix for 20261109020000: the 50 item limit was written as a subquery on the same table inside the insert policy,
-- and Postgres refuses that ("infinite recursion detected in policy"). Found by testing on the real project.
-- The limit is now a trigger that counts the signed-in user's own rows (security invoker, so row-level security
-- still applies to the count).

drop policy "watchlist_insert_own" on public.watchlist_items;

create policy "watchlist_insert_own" on public.watchlist_items
  for insert with check ((select auth.uid()) = user_id);

create function public.enforce_watchlist_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.watchlist_items w where w.user_id = new.user_id) >= 50 then
    raise exception 'watchlist is full (50 items)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger watchlist_items_limit
  before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_limit();
