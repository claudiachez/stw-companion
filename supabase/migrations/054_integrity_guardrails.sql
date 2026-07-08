-- 054: integrity guardrails — plans/integrity-guardrails.md Items 0.5 + 1.
--
-- Additive only. Combines the closed-weight invariant guard (Item 0.5, which needs
-- ops_log to exist so corrections can be logged) with Item 1's schema/audit work:
--   (a) ops_log — queryable backlog of operational events (outages, maintenance
--       pauses, manual data corrections), seeded with the two known historical events.
--   (b) holdings: a BEFORE trigger that RAISEs (fail loud, never silently coalesces)
--       if last_action IN ('Closed','Expired') AND current_weight <> 0.
--   (c) leg_transactions: weight -> NOT NULL (PROD audit confirmed zero null rows —
--       safe); weight_status/source/date_precision provenance columns.
--   (d) Backfill source='snapshot_reconciled' for the rows actually written by the
--       6/12 and 6/18 Friday-truth-up reconciliation runs (identified by content,
--       not by the literal phrase "reconciled from weekly snapshot" — that phrase
--       does not appear anywhere in current notes; see WEEK1_REPORT.md for how the
--       candidate set was derived).
--   (e) macro_daily_snapshots.engine_version — Item 0's scorer-version stamp, so a
--       stored score is attributable to the code that produced it.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- ── (a) ops_log — queryable operational event backlog ──────────────────────────
create table if not exists public.ops_log (
  id             bigserial   primary key,
  event_type     text        not null,  -- 'outage' | 'maintenance_pause' | 'data_correction' | 'flag_resolution'
  period_start   timestamptz not null,
  period_end     timestamptz,          -- null = instantaneous event or still-open
  affected_scope text        not null, -- e.g. a channel name, ticker, or table
  detail         text        not null,
  resolved       boolean     not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.ops_log is
  'Structured operational event log: outages, maintenance pauses, manual data corrections, flag-resolution actions. Queryable backlog — previously these only lived in run_log free text.';

alter table public.ops_log enable row level security;
drop policy if exists "admin_read_ops_log" on public.ops_log;
create policy "admin_read_ops_log" on public.ops_log
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

insert into public.ops_log (event_type, period_start, period_end, affected_scope, detail, resolved) values
  ('outage', '2026-07-01 00:00:00+00', '2026-07-01 23:59:59+00', 'live-notes-portfolio',
   'Chrome extension disconnected; both the morning and afternoon runs processed 0 messages that day.', true),
  ('maintenance_pause', '2026-06-11 00:00:00+00', '2026-06-18 23:59:59+00', 'ARKK, CRNC, MITK, RNG',
   'Daily-routine maintenance pause; the subsequent Friday truth-up (6/12 and 6/18 runs) reconstructed these positions from the weekly snapshot rather than from live Discord alerts, producing synthetic-dated diary rows.', true)
on conflict do nothing;

-- ── (b) holdings: closed-weight invariant — fail loud, never silently coalesce ──
create or replace function public.fn_check_closed_weight_zero()
returns trigger language plpgsql as $$
begin
  if new.last_action in ('Closed', 'Expired') and new.current_weight is not null and new.current_weight <> 0 then
    raise exception 'holdings.current_weight must be 0 when last_action is Closed/Expired (ticker=%, trader_id=%, current_weight=%)',
      new.ticker, new.trader_id, new.current_weight;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_holdings_closed_weight_zero on public.holdings;
create trigger trg_holdings_closed_weight_zero
  before insert or update on public.holdings
  for each row execute function public.fn_check_closed_weight_zero();

-- ── (c) leg_transactions: NOT NULL + provenance columns ─────────────────────────
alter table public.leg_transactions
  alter column weight set not null;

alter table public.leg_transactions
  add column if not exists weight_status text,
  add column if not exists source text not null default 'live',
  add column if not exists date_precision text not null default 'day';

alter table public.leg_transactions
  drop constraint if exists leg_transactions_weight_status_check;
alter table public.leg_transactions
  add constraint leg_transactions_weight_status_check check (
    weight_status in ('stated', 'split_derived', 'resolved_late', 'assumed_split', 'zero_by_spec')
    or weight_status is null
  );

alter table public.leg_transactions
  drop constraint if exists leg_transactions_source_check;
alter table public.leg_transactions
  add constraint leg_transactions_source_check check (
    source in ('live', 'snapshot_reconciled', 'backfill')
  );

alter table public.leg_transactions
  drop constraint if exists leg_transactions_date_precision_check;
alter table public.leg_transactions
  add constraint leg_transactions_date_precision_check check (
    date_precision in ('day', 'week')
  );

comment on column public.leg_transactions.weight_status is
  'Provenance of the stated weight: stated (host-given) | split_derived (90:10/20:80 fallback) | resolved_late | assumed_split | zero_by_spec (EXPIRED/EXERCISED convention). NULL = historical row, provenance unknown.';
comment on column public.leg_transactions.source is
  'live (normal daily-run ingestion) | snapshot_reconciled (inserted by a Friday truth-up reconciling a gap against the weekly snapshot) | backfill (one-time historical correction).';
comment on column public.leg_transactions.date_precision is
  'day = executed_at date is authoritative | week = only the week is known (unresolvable reconciliation); never interpolate a fake day.';

-- ── (d) backfill source='snapshot_reconciled' for the identified 6/12 + 6/18 rows ──
-- Identified by content (notes describing inference from the portfolio-update
-- snapshot), not the literal phrase assumed in the original spec draft — that phrase
-- does not occur anywhere in current leg_transactions.notes.
update public.leg_transactions
  set source = 'snapshot_reconciled'
  where id in (
    '5e9e966b-65a7-4a82-8968-91ea5ec4a712', -- ADEA BUY 2026-06-12
    '66ef3b26-60ac-41b4-98b6-e2172f8ccacb', -- ADEA SELL 2026-06-12
    'bb576b0f-0b42-45ae-be6e-b636f4f27278', -- RNG EXPIRED 2026-06-12
    'aef0507f-1493-453c-9333-6f6a42d8f583', -- MITK BUY 2026-06-18
    'a65684e0-cd50-45d6-8dac-1212e7a60d8a', -- ARKK EXPIRED 2026-06-18
    '2c34dd88-b223-4c5b-8a4d-9a41397ee2db'  -- CRNC BUY 2026-06-18
  );

-- ── (e) macro_daily_snapshots: scorer-version stamp (Item 0) ────────────────────
alter table public.macro_daily_snapshots
  add column if not exists engine_version text;

comment on column public.macro_daily_snapshots.engine_version is
  'Identifies the scorer code version that produced this row (see ENGINE_VERSION in macro-snapshot.ts). Historical rows before this column existed will be NULL.';

commit;
