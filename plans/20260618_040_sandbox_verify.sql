-- 040 verification — paste into the SANDBOX SQL editor and Run.
-- The Supabase editor commits between statements, so this uses NO temp tables and NO rollback:
-- it deletes its own ZZ* test rows up front (idempotent re-runs) and ends on one SELECT showing the
-- final derived `legs` scoreboard for every test leg. A one-line cleanup is at the very bottom — run
-- it after you've eyeballed the results (or just re-run this whole script later; the top clears them).

-- 0) clear leftovers from any prior run (incl. the old ZZTRIG name)
delete from public.leg_transactions where leg_id in (select id from public.legs where ticker in ('ZZT1','ZZT2','ZZTRIG','ZZADEA'));
delete from public.legs     where ticker in ('ZZT1','ZZT2','ZZTRIG','ZZADEA');
delete from public.holdings where ticker in ('ZZT1','ZZT2','ZZTRIG','ZZADEA');

-- test holdings (reuse any existing trader)
insert into public.holdings (ticker, trader_id, name, conviction, last_action, rank, basket)
select 'ZZT1', id, 'trim test',        3, 'New', 990, 'Other' from public.traders limit 1;
insert into public.holdings (ticker, trader_id, name, conviction, last_action, rank, basket)
select 'ZZT2', id, 'delete-replay test', 3, 'New', 991, 'Other' from public.traders limit 1;
insert into public.holdings (ticker, trader_id, name, conviction, last_action, rank, basket)
select 'ZZADEA', id, 'ADEA test',      3, 'New', 992, 'Other' from public.traders limit 1;

-- ════ ZZT1 — TRIM that stays open (books realized on the slice sold) ════
insert into public.legs (ticker, trader_id, instrument_type, direction, status)
select 'ZZT1', trader_id, 'SHARES', 'long', 'OPEN' from public.holdings where ticker='ZZT1';
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'BUY', 100, 4.0, '2026-05-01' from public.legs where ticker='ZZT1';
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'SELL', 120, 2.0, '2026-05-02' from public.legs where ticker='ZZT1';
-- EXPECT ZZT1 Shares: OPEN | entry 100 | init 4 | weight 2 | exit NULL | realized +20.0  (slice 2% @ (120-100)/100)

-- ════ ZZT2 — TRIM then CLOSE, then DELETE the trim (proves UPDATE/DELETE firing + replay) ════
insert into public.legs (ticker, trader_id, instrument_type, direction, status)
select 'ZZT2', trader_id, 'SHARES', 'long', 'OPEN' from public.holdings where ticker='ZZT2';
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'BUY', 100, 4.0, '2026-05-01' from public.legs where ticker='ZZT2';
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'SELL', 120, 2.0, '2026-05-02' from public.legs where ticker='ZZT2';
insert into public.leg_transactions (leg_id, trader_id, action_type, price, weight, executed_at)
select id, trader_id, 'SELL', 130, 0,   '2026-05-03' from public.legs where ticker='ZZT2';
delete from public.leg_transactions lt using public.legs l
  where lt.leg_id = l.id and l.ticker='ZZT2' and lt.action_type='SELL' and lt.price=120;
-- EXPECT ZZT2 Shares: CLOSED | entry 100 | init 4 | weight 0 | exit 130 | realized +30.0
--        (trim deleted → replay leaves only the close slice 4% @ (130-100)/100; was +25 with the trim)

-- ════ ZZADEA — the real ledger (4 legs) ════
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 30, 'CALL', '2026-06-19', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 30, 'CALL', '2026-09-18', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, option_strike, option_right, option_expiry, direction, status)
select 'ZZADEA', trader_id, 'OPTION', 35, 'CALL', '2026-09-18', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';
insert into public.legs (ticker, trader_id, instrument_type, direction, status)
select 'ZZADEA', trader_id, 'SHARES', 'long', 'OPEN' from public.holdings where ticker='ZZADEA';

-- $30C Jun: New @1.50 (0.6%) then Closed @0 (same day)
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 1.50, 0.60, '2026-05-15' from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-06-19';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'SELL', 'Closed', 0.00, 0, '2026-05-15' from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-06-19';

-- $30C Sep: New @3.58 (1.4%) then Closed @0 (6/12)
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 3.58, 1.40, '2026-05-15' from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-09-18';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'SELL', 'Closed', 0.00, 0, '2026-06-12' from public.legs where ticker='ZZADEA' and option_strike=30 and option_expiry='2026-09-18';

-- $35C Sep: Upsize/open @2.74 (2.0%) on 6/1
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'Upsized', 2.74, 2.00, '2026-06-01' from public.legs where ticker='ZZADEA' and option_strike=35 and option_expiry='2026-09-18';

-- Shares: open 0.6% lot (5/15) then add a 1.4% lot (6/12) → leg sums to 2.0%
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 30.10, 0.60, '2026-05-15' from public.legs where ticker='ZZADEA' and instrument_type='SHARES';
insert into public.leg_transactions (leg_id, trader_id, action_type, action_label, price, weight, executed_at)
select id, trader_id, 'BUY', 'New', 30.10, 1.40, '2026-06-12' from public.legs where ticker='ZZADEA' and instrument_type='SHARES';

-- ════ RESULT — the derived scoreboard for every test leg ════
-- EXPECT ZZADEA: $30C Jun CLOSED -100 (w0) | $30C Sep CLOSED -100 (w0) | $35C Sep OPEN w2.00 | Shares OPEN w2.00 (0.6+1.4)
select h.ticker,
       case when l.instrument_type = 'SHARES' then 'Shares'
            else '$' || l.option_strike || left(l.option_right,1) || ' ' || to_char(l.option_expiry,'Mon ''YY') end as leg,
       l.status, l.entry_price as entry, l.initial_weight as init, l.weight,
       l.exit_price as exit, l.realized_pnl_pct as realized,
       l.opened_at::date as opened, l.closed_at::date as closed
from public.legs l
join public.holdings h on h.ticker = l.ticker and h.trader_id = l.trader_id
where l.ticker in ('ZZT1','ZZT2','ZZADEA')
order by h.ticker, l.instrument_type desc, l.option_expiry nulls first, l.option_strike;

-- ════ CLEANUP — run separately once you've reviewed the result above ════
-- delete from public.leg_transactions where leg_id in (select id from public.legs where ticker in ('ZZT1','ZZT2','ZZADEA'));
-- delete from public.legs     where ticker in ('ZZT1','ZZT2','ZZADEA');
-- delete from public.holdings where ticker in ('ZZT1','ZZT2','ZZADEA');
