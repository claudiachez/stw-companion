-- 057: regime_daily + traders.regime_proxy — plans/integrity-guardrails.md Item 3.
--
-- One row per trading day per tracked instrument, backing the advisory
-- regimeGate() (packages/shared/src/utils/regime.ts). Deliberately separate
-- from macro_daily_snapshots (048) — that table backs the Macro Dashboard's
-- weighted composite; this one backs the frozen, forward-tested regime gate.
-- Do not merge these two systems (standing prohibition, see the source spec).
--
-- Market-level fields (vix_close, vix3m_close, etc.) are duplicated on every
-- equity instrument's row for that trading day rather than split into a
-- separate table — matches the spec's exact column list ("Plus market-level
-- per day: vix_close, ...") and keeps a single row queryable per
-- (trading_date, instrument) without a join for the common case.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table if not exists public.regime_daily (
  id                        uuid        primary key default gen_random_uuid(),
  trading_date              date        not null,
  instrument                text        not null,  -- 'IWM' | 'SPY' | 'QQQ' (trend candidates)
  close                     numeric,
  sma200                    numeric,
  trend_state               text        check (trend_state in ('GREEN', 'RED', 'UNKNOWN')),
  roc_252d_positive         boolean,
  sma200_slope_positive     boolean,    -- SMA today vs 20 trading days ago
  rv20_annualized           numeric,
  rv20_percentile_2y        numeric,    -- percentile rank within a 504-trading-day window
  -- Market-level fields (same value across every instrument row for a given trading_date)
  vix_close                 numeric,
  vix3m_close               numeric,
  vix_ratio                 numeric,    -- vix_close / vix3m_close
  vol_state                 text        check (vol_state in ('GREEN', 'RED', 'UNKNOWN')),
  tnx_level                 numeric,
  tnx_63d_change_positive   boolean,
  source                    text        not null default 'twelvedata', -- data source recorded per row
  engine_version            text        not null,
  created_at                timestamptz not null default now(),
  unique (trading_date, instrument)
);

comment on table public.regime_daily is
  'One row per trading day per tracked instrument for the advisory regime gate (regimeGate() in packages/shared). Deliberately NOT the Macro Dashboard composite (macro_daily_snapshots, migration 048) — do not merge these systems. UNKNOWN states are written explicitly, never interpolated or skipped, on any missing input day.';

alter table public.regime_daily enable row level security;
drop policy if exists "regime_daily_read" on public.regime_daily;
create policy "regime_daily_read" on public.regime_daily
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

create index if not exists regime_daily_trading_date_idx on public.regime_daily (trading_date desc);

-- ── traders.regime_proxy — per-trader proxy instrument, zero code changes to onboard ──
alter table public.traders
  add column if not exists regime_proxy text;

comment on column public.traders.regime_proxy is
  'The instrument/underlying regimeGate() evaluates for this trader. STW -> IWM. Graddox -> per-signal underlying (store "underlying" as a literal marker; consumers resolve the actual symbol per signal). New traders onboard by setting this column alone.';

update public.traders set regime_proxy = 'IWM' where name = 'STW' and regime_proxy is null;
update public.traders set regime_proxy = 'underlying' where name = 'Graddox' and regime_proxy is null;

commit;
