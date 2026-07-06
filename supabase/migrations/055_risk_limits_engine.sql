-- 055: risk limits engine — plans/integrity-guardrails.md Item 2.
--
-- Structurally multi-tenant from day one (every subscriber has RLS-scoped
-- `user_positions` via Flex sync) even though this ships for the operator's own
-- book first. Flags only — nothing here enforces a limit on any order path.
--
--   (a) risk_config — one row per user, RLS-owned exactly like user_positions.
--       Seeded with the operator's row using the exact placeholder defaults from
--       the spec (10% position / 25% sector / 100% gross / ladder -10%->70%, -15%->50%),
--       resolved by email (not a hardcoded uuid) so this applies cleanly to both
--       sandbox and PROD, matching this repo's trader-seed-by-name precedent.
--   (b) ticker_sector_map — a small, admin-editable static table (NOT the live
--       Finnhub-industry algorithm in packages/shared/src/utils/macro.ts, which is
--       an unrelated system for STW's own Sector Rotation feature). Same
--       app_config-style admin-write RLS pattern.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- ── (a) risk_config ──────────────────────────────────────────────────────────
create table if not exists public.risk_config (
  user_id          uuid    primary key references auth.users(id) on delete cascade,
  max_position_pct numeric not null,
  max_sector_pct   numeric not null,
  max_gross_pct    numeric not null,
  ladder           jsonb   not null default '[]', -- [{ "drawdownPct": -10, "targetGrossPct": 70 }, ...]
  is_placeholder   boolean not null default true, -- true until the operator explicitly confirms these values
  updated_at       timestamptz not null default now()
);

comment on table public.risk_config is
  'Per-user risk-limit thresholds for the limits engine (packages/shared/src/utils/limits.ts). Flags only — never enforced on any order path. is_placeholder marks seeded defaults that have not yet been reviewed by the account owner.';

alter table public.risk_config enable row level security;
drop policy if exists "own_risk_config_all" on public.risk_config;
create policy "own_risk_config_all" on public.risk_config
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed the operator's row with the spec's exact placeholder defaults.
insert into public.risk_config (user_id, max_position_pct, max_sector_pct, max_gross_pct, ladder, is_placeholder)
select id, 10, 25, 100,
  '[{"drawdownPct": -10, "targetGrossPct": 70}, {"drawdownPct": -15, "targetGrossPct": 50}]'::jsonb,
  true
from auth.users where email = 'cc@claudiachez.com'
on conflict (user_id) do nothing;

-- ── (b) ticker_sector_map — small operator-editable static table ────────────
create table if not exists public.ticker_sector_map (
  ticker     text primary key,
  sector     text not null,
  updated_at timestamptz not null default now()
);

comment on table public.ticker_sector_map is
  'Small (~26-35 row) operator-editable ticker->sector map for the limits engine sector-concentration check. Static by design (spec: "do not build a data-feed integration for this") — distinct from the live Finnhub-industry algorithm in macro.ts.';

alter table public.ticker_sector_map enable row level security;
drop policy if exists "ticker_sector_map_select" on public.ticker_sector_map;
create policy "ticker_sector_map_select" on public.ticker_sector_map
  for select to authenticated using (true);
drop policy if exists "ticker_sector_map_write_admin" on public.ticker_sector_map;
create policy "ticker_sector_map_write_admin" on public.ticker_sector_map
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
