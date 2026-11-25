-- Fix for 20261125000000_web_push (security review, 2026-11-25).
-- 1. The 5-browser and 20-rule limits were written as subqueries on the same table inside the insert policies, and
--    Postgres refuses every insert then ("infinite recursion detected in policy", the same problem the watchlist
--    had in 20261109030000). The limits are now triggers that count the user's own rows (security invoker, so
--    row-level security still applies to the count). A full account gets errcode check_violation (23514).
-- 2. created_at and updated_at were whatever the browser sent. The scheduled check reads rows oldest first and
--    stops at its caps, so a back-dated row would always be checked before everyone else's. The server now sets
--    both: created_at on insert (kept on update), updated_at on every insert and update.
-- Both functions run as the caller (security invoker); trigger functions cannot be called directly.

drop policy "push_subscriptions_insert_own" on public.push_subscriptions;

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);

drop policy "push_rules_insert_own" on public.push_rules;

create policy "push_rules_insert_own" on public.push_rules
  for insert with check ((select auth.uid()) = user_id);

create function public.push_subscriptions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.push_subscriptions s where s.user_id = new.user_id) >= 5 then
      raise exception 'push subscriptions are full (5 browsers)' using errcode = 'check_violation';
    end if;
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_before_write
  before insert or update on public.push_subscriptions
  for each row execute function public.push_subscriptions_before_write();

create function public.push_rules_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    and (select count(*) from public.push_rules r where r.user_id = new.user_id) >= 20 then
    raise exception 'push rules are full (20 rules)' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger push_rules_before_write
  before insert or update on public.push_rules
  for each row execute function public.push_rules_before_write();
