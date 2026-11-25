-- Phase 10f: web push alerts that arrive while SkyDeck is closed.
-- Two tables, both with row-level security: a signed-in user can read and change only their own rows.
--   push_subscriptions: one row per browser that allowed notifications (the push service address and the two
--     public keys the browser handed out; nothing here can read the user's device).
--   push_rules: copies of the user's alert rules that should also be checked while the page is closed.
-- The scheduled check (src/server/push-hub.ts) reads both with the service role key, which bypasses row-level
-- security, and deletes a subscription when the push service says it is gone. This migration adds no functions.
-- Limits are enforced here too, not only in the app: 5 browsers and 20 rules per user.

create table public.push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Only the browsers' push services (Google, Mozilla, Microsoft, Apple): the server sends requests to this address,
  -- so it must never be one a user picks. The server checks the same list again (src/lib/web-push.ts).
  endpoint text not null check (
    endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com)/'
    and char_length(endpoint) <= 1000
  ),
  -- base64url P-256 public key (65 bytes -> 87 characters) and 16-byte auth secret (22 characters).
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (
    (select auth.uid()) = user_id
    and (select count(*) from public.push_subscriptions s where s.user_id = (select auth.uid())) < 5
  );

create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);


create table public.push_rules (
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id text not null check (char_length(rule_id) between 1 and 40),
  name text not null check (char_length(name) between 1 and 50),
  -- The rule's conditions (src/lib/alert-rules.ts RuleConditions); the check cleans them again before use.
  -- Must include an area: the closed-page check only looks at the areas people chose.
  conditions jsonb not null check (
    jsonb_typeof(conditions) = 'object'
    and conditions ? 'area'
    and pg_column_size(conditions) <= 2000
  ),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, rule_id)
);

alter table public.push_rules enable row level security;

create policy "push_rules_select_own" on public.push_rules
  for select using ((select auth.uid()) = user_id);

create policy "push_rules_insert_own" on public.push_rules
  for insert with check (
    (select auth.uid()) = user_id
    and (select count(*) from public.push_rules r where r.user_id = (select auth.uid())) < 20
  );

create policy "push_rules_update_own" on public.push_rules
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "push_rules_delete_own" on public.push_rules
  for delete using ((select auth.uid()) = user_id);

-- The scheduled check reads enabled rules of users who have at least one subscription.
create index push_rules_enabled_idx on public.push_rules (user_id) where enabled;
