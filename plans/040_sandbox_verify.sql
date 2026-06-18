-- 040 trigger verification — paste into the SANDBOX SQL editor and Run.
-- Everything happens inside a transaction that ROLLS BACK, so nothing is persisted.
-- The final `select * from _chk` shows the derived `legs` scoreboard after each diary event;
-- compare the EXPECT comments. (Run `select * from public.app_config;` separately to see the seed.)

begin;

create temp table _chk (
  seq int, leg text, step text, status text, entry numeric, init numeric, weight numeric,
  exit_price numeric, realized numeric, opened date, closed date
) on commit drop;

-- ════════════════════════════════════════════════════════════════════
-- PART A — synthetic mechanics (open → trim → close → delete)
-- ════════════════════════════════════════════════════════════════════
insert into public.holdings (ticker, trader_id, name, conviction, last_action, rank, basket)
select 'ZZTRIG', t.id, 'Trigger test', 3, 'New', 999, 'Other' from public.traders t limit 1;

insert into public.legs (ticker, trader_id, instrument_type, direction, status)
select ticker, trader_id, 'SHARES', 'long', 'OPEN' from public.holdings where ticker = 'ZZTRIG';

-- 1) OPEN @ $100, 4% ───────────────────────────────────────────────
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'BUY', 100, 4.0, '2026-01-01' from public.legs where ticker = 'ZZTRIG';
insert into _chk select 1, 'trimtest', 'after BUY', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker = 'ZZTRIG';
-- EXPECT: OPEN | entry 100 | init 4 | weight 4 | exit NULL | realized NULL | opened 2026-01-01 | closed NULL

-- 2) TRIM @ $120 → 2% (still OPEN; books realized on the 2% slice sold) ─
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'SELL', 120, 2.0, '2026-02-01' from public.legs where ticker = 'ZZTRIG';
insert into _chk select 2, 'trimtest', 'after TRIM', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker = 'ZZTRIG';
-- EXPECT: OPEN | weight 2 | realized +20.0   (slice 2% @ (120-100)/100)

-- 3) CLOSE @ $130 → 0 (CLOSED; realized = weighted avg of both slices) ─
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'SELL', 130, 0, '2026-03-01' from public.legs where ticker = 'ZZTRIG';
insert into _chk select 3, 'trimtest', 'after CLOSE', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker = 'ZZTRIG';
-- EXPECT: CLOSED | entry 100 | weight 0 | exit 130 | realized +25.0  ((2×20 + 2×30)/4) | closed 2026-03-01

-- 4) DELETE the trim → trigger replays remaining events (UPDATE/DELETE firing + recompute) ─
delete from public.leg_transactions lt using public.legs l
  where lt.leg_id = l.id and l.ticker = 'ZZTRIG' and lt.action_type = 'SELL' and lt.price = 120;
insert into _chk select 4, 'trimtest', 'after DELETE trim', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker = 'ZZTRIG';
-- EXPECT: CLOSED | weight 0 | exit 130 | realized +30.0   (only the close slice 4% @ (130-100)/100)

-- ════════════════════════════════════════════════════════════════════
-- PART B — the real ADEA ledger (4 legs, isolated as ZZADEA)
--   5/15 New  $30C Jun  @1.50 (0.6%)   |  5/15 New  $30C Sep @3.58 (1.4%)
--   5/15 Close $30C Jun @0.00          |  5/15 New  Shares   @30.10 (0.6%)
--   6/1  Upsize $35C Sep @2.74 (2.0%)
--   6/12 Close  $30C Sep @0.00         |  6/12 add Shares    @30.10 (→1.4%)
-- ════════════════════════════════════════════════════════════════════
insert into public.holdings (ticker, trader_id, name, conviction, last_action, rank, basket)
select 'ZZADEA', t.id, 'ADEA test', 3, 'New', 998, 'Other' from public.traders t limit 1;

-- the 4 legs (structural only — the trigger derives the rest)
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 30, 'CALL', '2026-06-19', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 30, 'CALL', '2026-09-18', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 35, 'CALL', '2026-09-18', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, direction, status)
select 'ZZADEA', trader_id, 'SHARES', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';

-- $30C Jun: BUY then Close (same day) ─────────────────────────────────
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 1.50, 0.60, '2026-05-15'
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-06-19';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'SELL', 'Closed', 0.00, 0, '2026-05-15'
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-06-19';

-- $30C Sep: BUY (5/15) then Close (6/12) ──────────────────────────────
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 3.58, 1.40, '2026-05-15'
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-09-18';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'SELL', 'Closed', 0.00, 0, '2026-06-12'
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-09-18';

-- $35C Sep: Upsize/open (6/1) ─────────────────────────────────────────
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'Upsized', 2.74, 2.00, '2026-06-01'
  from public.legs where ticker='ZZADEA' and option_strike=35 and option_expiry='2026-09-18';

-- Shares: open 0.6% lot (5/15) then add a 1.4% lot (6/12) → leg sums to 2.0% ──
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 30.10, 0.60, '2026-05-15'
  from public.legs where ticker='ZZADEA' and instrument_type='SHARES';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 30.10, 1.40, '2026-06-12'
  from public.legs where ticker='ZZADEA' and instrument_type='SHARES';

-- derived scoreboard for each ADEA leg
insert into _chk select 10, '$30C Jun', 'ADEA', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-06-19';
-- EXPECT: CLOSED | entry 1.50 | init 0.60 | weight 0 | exit 0 | realized -100 | opened 2026-05-15 | closed 2026-05-15
insert into _chk select 11, '$30C Sep', 'ADEA', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-09-18';
-- EXPECT: CLOSED | entry 3.58 | init 1.40 | weight 0 | exit 0 | realized -100 | opened 2026-05-15 | closed 2026-06-12
insert into _chk select 12, '$35C Sep', 'ADEA', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker='ZZADEA' and option_strike=35 and option_expiry='2026-09-18';
-- EXPECT: OPEN | entry 2.74 | init 2.00 | weight 2.00 | exit NULL | realized NULL | opened 2026-06-01
insert into _chk select 13, 'Shares', 'ADEA', status, entry_price, initial_weight, weight, exit_price, realized_pnl_pct, opened_at::date, closed_at::date
  from public.legs where ticker='ZZADEA' and instrument_type='SHARES';
-- EXPECT: OPEN | entry 30.10 | init 0.60 | weight 2.00 (0.6 + 1.4 lots) | exit NULL | realized NULL | opened 2026-05-15

select * from _chk order by seq;

rollback;
