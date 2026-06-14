-- 030: create `leg_transactions` (quantity-free event log) + the leg-state trigger.
--
-- WHY: legs are event-sourced, mirroring holding_transactions → holdings. The routine (and the
-- future raw-message backfill) inserts one event per host action; the trigger derives the
-- leg's current state. There are NO quantities (we never get share/contract counts) — events
-- carry a PRICE and the leg's WEIGHT after the event. P&L is a percentage.
--
-- action_type:
--   BUY        — open or add (weight up). Sets opened_at / entry_price (first buy) ; leg OPEN.
--   SELL       — reduce or close. weight > 0 → partial trim (still OPEN, weight updated, no
--                realized booked — can't size the slice); weight = 0 → full close (CLOSED,
--                exit_price = event price, realized_pnl_pct booked).
--   EXPIRED    — EXPIRED_WORTHLESS, exit 0 → realized −100% (long) / +100% (short).
--   EXERCISED  — EXERCISED, realized_pnl_pct = NULL (value converts to a spawned shares leg;
--                the writer opens that leg with entry = strike + premium, parent_leg_id set).
--
-- realized_pnl_pct = (exit_price − entry_price) / entry_price × 100, × −1 for short.
-- The trigger RECOMPUTES from all of a leg's events (replay-safe / order-independent), so the
-- backfill can insert events in any order and re-run idempotently.
--
-- Requires 029 applied.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.leg_transactions (
  id            uuid        not null default gen_random_uuid(),
  leg_id        uuid        not null,
  trader_id     uuid        not null,
  action_type   text        not null,
  price         numeric,
  weight        numeric,
  close_reason  text,
  executed_at   timestamptz not null default now(),
  notes         text,
  constraint leg_transactions_pkey primary key (id),
  constraint leg_transactions_leg_id_fkey
    foreign key (leg_id) references public.legs(id),
  constraint leg_transactions_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint leg_transactions_action_type_check check (
    action_type in ('BUY', 'SELL', 'EXERCISED', 'EXPIRED')
  ),
  constraint leg_transactions_close_reason_check check (
    close_reason in (
      'PROFIT_TARGET', 'STOP_HIT', 'THESIS_BROKEN', 'TRAIL_STOP',
      'EXPIRED_WORTHLESS', 'EXERCISED',
      'PARTIAL_PROFIT', 'RISK_REDUCTION', 'REBALANCE'
    ) or close_reason is null
  )
);

alter table public.leg_transactions enable row level security;

create policy "leg_transactions_select" on public.leg_transactions
  for select to authenticated using (true);

create policy "leg_transactions_write_admin" on public.leg_transactions
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

create or replace function fn_sync_leg_from_transaction()
returns trigger language plpgsql as $$
declare
  v_entry   numeric;
  v_opened  timestamptz;
  v_dir     text;
  v_sign    numeric;
  v_last    public.leg_transactions%rowtype;
  v_status  text;
  v_exit    numeric;
  v_realized numeric;
  v_closed  timestamptz;
  v_reason  text;
begin
  select direction into v_dir from public.legs where id = new.leg_id;
  v_sign := case when v_dir = 'short' then -1 else 1 end;

  -- entry = price of the earliest BUY; opened = first BUY time (replay-safe aggregates)
  select price into v_entry
  from public.leg_transactions
  where leg_id = new.leg_id and action_type = 'BUY'
  order by executed_at, id limit 1;

  select min(executed_at) into v_opened
  from public.leg_transactions
  where leg_id = new.leg_id and action_type = 'BUY';

  -- the most recent event determines current weight + open/closed state
  select * into v_last
  from public.leg_transactions
  where leg_id = new.leg_id
  order by executed_at desc, id desc limit 1;

  v_status := 'OPEN'; v_exit := null; v_realized := null; v_closed := null; v_reason := null;

  if v_last.action_type = 'EXERCISED' then
    v_status := 'EXERCISED'; v_closed := v_last.executed_at; v_reason := 'EXERCISED';
    -- realized stays null: value transfers to the spawned shares leg
  elsif v_last.action_type = 'EXPIRED' then
    v_status := 'EXPIRED_WORTHLESS'; v_exit := 0; v_closed := v_last.executed_at;
    v_reason := coalesce(v_last.close_reason, 'EXPIRED_WORTHLESS');
    if v_entry is not null and v_entry <> 0 then
      v_realized := (v_exit - v_entry) / v_entry * 100 * v_sign;  -- −100% long / +100% short
    end if;
  elsif v_last.action_type = 'SELL' and coalesce(v_last.weight, 0) = 0 then
    v_status := 'CLOSED'; v_exit := v_last.price; v_closed := v_last.executed_at;
    v_reason := v_last.close_reason;
    if v_entry is not null and v_entry <> 0 then
      v_realized := (v_exit - v_entry) / v_entry * 100 * v_sign;
    end if;
  end if;
  -- BUY, or partial SELL (weight > 0) → leg stays OPEN, just a weight change

  update public.legs set
    entry_price      = coalesce(entry_price, v_entry),
    weight           = v_last.weight,
    opened_at        = coalesce(opened_at, v_opened),
    status           = v_status,
    exit_price       = v_exit,
    realized_pnl_pct = v_realized,
    closed_at        = v_closed,
    close_reason     = v_reason
  where id = new.leg_id;

  return new;
end;
$$;

create trigger trg_leg_transactions_sync
  after insert on public.leg_transactions
  for each row execute function fn_sync_leg_from_transaction();

commit;
