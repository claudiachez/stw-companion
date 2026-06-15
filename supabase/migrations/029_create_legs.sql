-- 029: create the `legs` table — structured per-leg position tracking (weight + %-P&L model).
--
-- WHY: replaces the `holdings.position_detail` text blob with one row per share-lot / option
-- leg, FK'd to the holdings composite PK.
--
-- ⚠️ NO SIZES. There are no share/contract counts anywhere — not in position_detail, not in
-- ibkr_legs. The only sizing signal STW publishes is WEIGHT (% of portfolio), often per-leg
-- when members ask. So a leg stores its `weight`, NOT a contract count, and P&L is a
-- PERCENTAGE:
--   unrealized_pnl_pct = (mark_price − entry_price) / entry_price × 100   (× −1 for short)
--   realized_pnl_pct   = (exit_price  − entry_price) / entry_price × 100   (set on close)
-- Dollar figures are derived later by the $100k notional portfolio layer as
-- `weight × NAV × pnl%` — never stored here. `unrealized_pnl_pct` is computed at query time
-- (view or @stw/shared), never stored (it would be stale between price updates).
--
-- per-leg `weight`: the host states it in chat for multi-leg positions; when he doesn't, the
-- writer applies the default split (mixed = 90% shares / 10% across option legs; options-only
-- = split across option legs; shares-only = 100%) and the admin can override it.
--
-- EXERCISE (a common path): the option leg closes with status EXERCISED and
-- realized_pnl_pct = NULL (no cash event — value converts to stock). The writer opens a new
-- SHARES leg with entry_price = strike + premium and parent_leg_id pointing back to the option
-- leg; that shares leg then carries the trade's continuing %.
--
-- Requires 025 applied (holdings composite PK).
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.legs (
  id                uuid        not null default gen_random_uuid(),
  ticker            text        not null,
  trader_id         uuid        not null,
  parent_leg_id     uuid,
  instrument_type   text        not null,
  option_strike     numeric,
  option_expiry     date,
  option_right      text,
  direction         text        not null default 'long',
  status            text        not null default 'OPEN',
  entry_price       numeric,
  weight            numeric,
  mark_price        numeric,
  mark_price_source text,
  mark_price_at     timestamptz,
  exit_price        numeric,
  realized_pnl_pct  numeric,
  opened_at         timestamptz,
  closed_at         timestamptz,
  close_reason      text,
  constraint legs_pkey primary key (id),
  constraint legs_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint legs_parent_leg_id_fkey
    foreign key (parent_leg_id) references public.legs(id),
  constraint legs_instrument_type_check check (
    instrument_type in ('SHARES', 'OPTION')
  ),
  constraint legs_option_right_check check (
    option_right in ('CALL', 'PUT') or option_right is null
  ),
  constraint legs_direction_check check (
    direction in ('long', 'short')
  ),
  constraint legs_status_check check (
    status in ('OPEN', 'CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED')
  ),
  constraint legs_mark_price_source_check check (
    mark_price_source in ('FINNHUB', 'IBKR') or mark_price_source is null
  ),
  constraint legs_close_reason_check check (
    close_reason in (
      'PROFIT_TARGET', 'STOP_HIT', 'THESIS_BROKEN', 'TRAIL_STOP',
      'EXPIRED_WORTHLESS', 'EXERCISED'
    ) or close_reason is null
  ),
  constraint legs_option_fields_check check (
    (instrument_type = 'OPTION'
      and option_strike is not null
      and option_expiry is not null
      and option_right is not null)
    or
    (instrument_type = 'SHARES'
      and option_strike is null
      and option_expiry is null
      and option_right is null)
  )
);

-- FK to holdings composite PK
alter table public.legs
  add constraint legs_holding_fkey
    foreign key (ticker, trader_id) references public.holdings(ticker, trader_id);

alter table public.legs enable row level security;

create policy "legs_select" on public.legs
  for select to authenticated using (true);

create policy "legs_write_admin" on public.legs
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
