-- 064: user_executions — Week-2 Item 1 (plans/20260709_integrity-guardrailsv2.md).
--
-- Append-only ingestion of a subscriber's own IBKR fills (the Flex "Trades /
-- executions" section), keyed on the IBKR execution id so re-syncs never
-- duplicate. This is the second half of the subscriber IBKR pipeline: 011's
-- `user_positions` is a mutable snapshot (delete-all-then-insert every sync);
-- `user_executions` is the OPPOSITE — an immutable event log that only ever
-- grows, because its input window (~1 year of the Flex lookback) slides daily
-- and pre-window history is unrecoverable. Every fill we've ever seen must be
-- kept even after it ages out of the live Flex report.
--
-- Written by apps/web/netlify/functions/ibkr-flex.ts on the same manual sync
-- that refreshes user_positions (idempotent upsert on (user_id, ibkr_exec_id),
-- ignoreDuplicates). Consumed by TCA v1 (Week-2 Item 2) joining these fills to
-- the host's leg_transactions. RLS per user, same own-rows pattern as
-- user_positions — a subscriber reads/writes only their own fills.
--
-- Same weight-only / no-derived-quantities philosophy does NOT apply here: an
-- execution is a real broker fill and carries a real quantity + price. All
-- date-bucketing is done downstream via tradingDateET(executed_at) — we store
-- the exact instant plus the raw source string (exec_datetime_raw) so a wrong
-- timezone assumption can always be re-derived rather than being lossy.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

create table if not exists public.user_executions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  -- IBKR execution id (ibExecID) — the idempotency key. One row per fill.
  ibkr_exec_id      text        not null,
  order_id          text,                 -- ibOrderID (multiple fills share one order)
  trade_id          text,                 -- tradeID
  transaction_id    text,                 -- transactionID
  underlying        text        not null, -- clean ticker (AAPL, not the OCC symbol)
  symbol            text,                 -- raw symbol / OCC option symbol as reported
  asset_class       text        not null, -- 'STK' | 'OPT'
  side              text        check (side in ('BUY','SELL') or side is null),
  quantity          numeric,              -- signed per IBKR (BUY > 0, SELL < 0)
  price             numeric,              -- tradePrice per share/contract
  commission        numeric,              -- ibCommission (IBKR reports this negative)
  proceeds          numeric,              -- gross proceeds as reported
  currency          text,
  -- Options-specific (NULL for STK rows)
  strike            numeric,
  put_call          text        check (put_call in ('C','P') or put_call is null),
  expiry            text,                 -- YYYYMMDD
  multiplier        integer     default 1,
  -- Exact execution instant. executed_at is the parsed timestamptz; the raw
  -- Flex dateTime string is kept verbatim so the tz interpretation is auditable.
  executed_at       timestamptz not null,
  exec_datetime_raw text,
  account           text,                 -- resolved IBKR account (Uxxxxxxx)
  source            text        not null default 'ibkr_flex',
  synced_at         timestamptz not null default now(),
  unique (user_id, ibkr_exec_id)
);

comment on table public.user_executions is
  'Append-only log of a subscriber''s own IBKR fills (Flex Trades/executions section), keyed on ibExecID. Never delete-and-reinsert (unlike user_positions) — the Flex lookback window slides daily and pre-window history is unrecoverable. Consumed by TCA (Week-2 Item 2).';
comment on column public.user_executions.ibkr_exec_id is
  'IBKR ibExecID — the idempotency key. Upsert on (user_id, ibkr_exec_id) with ignoreDuplicates so re-syncs never create duplicate fills.';
comment on column public.user_executions.executed_at is
  'Exact execution instant. All date-bucketing downstream uses tradingDateET(executed_at); exec_datetime_raw preserves the source string so the tz assumption stays auditable.';

alter table public.user_executions enable row level security;

drop policy if exists "own_executions_all" on public.user_executions;
create policy "own_executions_all" on public.user_executions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TCA joins by ticker + execution date window; index the common access paths.
create index if not exists idx_user_executions_user_ticker
  on public.user_executions (user_id, underlying);
create index if not exists idx_user_executions_user_executed_at
  on public.user_executions (user_id, executed_at);
