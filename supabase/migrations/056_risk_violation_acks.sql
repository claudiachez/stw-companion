-- 056: risk_violation_acks — plans/integrity-guardrails.md Item 2.6.
--
-- Violations themselves are computed live from `user_positions` + `risk_config`
-- (packages/shared/src/utils/limits.ts) — nothing about a breach is stored. This
-- table stores only the human state layered on top: has this breach been
-- reviewed, and if so what's the glide path? No grandfathering — a day-one
-- breach is real and starts life as 'new'.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table if not exists public.risk_violation_acks (
  id                     bigserial   primary key,
  user_id                uuid        not null references auth.users(id) on delete cascade,
  scope                  text        not null,  -- underlying ticker, sector name, or 'GROSS'
  violation_type         text        not null check (violation_type in ('position', 'sector', 'gross')),
  status                 text        not null default 'new' check (status in ('new', 'acknowledged', 'glide_path')),
  glide_path_note        text,       -- e.g. "no adds to CXDO; reduce to 10% by 2026-08-01"
  glide_path_target_date date,
  updated_at             timestamptz not null default now(),
  unique (user_id, scope, violation_type)
);

comment on table public.risk_violation_acks is
  'Human review state layered on top of live-computed limits-engine violations. new = unreviewed breach (default on first sight, no grandfathering) | acknowledged | glide_path (operator has set a written reduce-to-compliance plan).';

alter table public.risk_violation_acks enable row level security;
drop policy if exists "own_risk_violation_acks_all" on public.risk_violation_acks;
create policy "own_risk_violation_acks_all" on public.risk_violation_acks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
