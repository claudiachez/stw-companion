-- 073: risk_alert_state — de-dup memory for the drawdown-alert cron (Item 3 of
-- plans/20260719_drawdown-protection-overhaul.md).
--
-- The scheduled evaluator (apps/web/netlify/functions/drawdown-alerts-cron.ts) emails a
-- user when their account drawdown ladder or a per-stock stop ladder ESCALATES. This table
-- remembers the last level we alerted at, per (user, kind, scope), so a persistent breach
-- isn't re-sent every day — only a genuine escalation (a deeper rung, or ok→near→breach)
-- fires again. A full recovery to `ok` deletes the row, so a later re-entry alerts afresh.
--
-- `last_level` is a single monotonic number the cron computes (0 = ok, 1 = near, 100+depth
-- = breach at that drawdown depth) — an alert is sent only when the current level exceeds
-- the stored one. Written by the cron via the service role; RLS is user-owned so a user
-- could read their own alert history later (no UI consumes it yet).
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

create table if not exists public.risk_alert_state (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  -- 'account_drawdown' (the account ladder) | 'per_stock' (a single name's stop ladder).
  alert_kind      text        not null,
  -- 'account' for the account ladder, else the underlying ticker for a per-stock alert.
  scope           text        not null,
  -- Monotonic severity level last alerted: 0 ok · 1 near · 100 + |rung%| breach.
  last_level      numeric     not null default 0,
  last_alerted_at timestamptz,
  updated_at      timestamptz not null default now(),
  unique (user_id, alert_kind, scope)
);

comment on table public.risk_alert_state is
  'De-dup memory for the drawdown-alert cron: the last level alerted per (user, kind, scope), so only a genuine escalation re-sends. A recovery to ok deletes the row.';

alter table public.risk_alert_state enable row level security;

drop policy if exists "own_alert_state_all" on public.risk_alert_state;
create policy "own_alert_state_all" on public.risk_alert_state
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_risk_alert_state_user on public.risk_alert_state (user_id);
