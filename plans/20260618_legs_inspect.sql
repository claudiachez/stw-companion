-- Inspect / verify legs. Run in the SQL editor. Read-only.

-- ════ A) Position sum-check: do the OPEN legs sum to the holding's current_weight? ════
-- A mismatch (drift <> 0) flags a position whose legs don't add up to its stated weight.
select h.ticker,
       h.current_weight                                          as pos_weight,
       round(coalesce(sum(l.weight) filter (where l.status = 'OPEN'), 0), 2) as open_legs_sum,
       round(h.current_weight - coalesce(sum(l.weight) filter (where l.status = 'OPEN'), 0), 2) as drift,
       count(*) filter (where l.status = 'OPEN')                 as open_legs,
       count(*) filter (where l.status <> 'OPEN')                as closed_legs
from public.holdings h
left join public.legs l on l.ticker = h.ticker and l.trader_id = h.trader_id
where h.ticker <> 'CASH'
group by h.ticker, h.trader_id, h.current_weight
order by abs(h.current_weight - coalesce(sum(l.weight) filter (where l.status = 'OPEN'), 0)) desc nulls last,
         h.ticker;

-- ════ B) Per-leg scoreboard (set @t to a ticker, or leave NULL for all) ════
-- Shows the derived state of each leg + how many diary events back it.
select h.ticker,
       case when l.instrument_type = 'SHARES' then 'Shares'
            else '$' || l.option_strike || left(l.option_right,1) || ' ' || to_char(l.option_expiry,'Mon ''YY') end as leg,
       l.status, l.entry_price as entry, l.initial_weight as init, l.weight,
       l.exit_price as exit, l.realized_pnl_pct as realized,
       l.opened_at::date as opened, l.closed_at::date as closed,
       (select count(*) from public.leg_transactions lt where lt.leg_id = l.id) as events
from public.legs l
join public.holdings h on h.ticker = l.ticker and h.trader_id = l.trader_id
-- where h.ticker = 'ADEA'            -- ← uncomment to focus one ticker
order by h.ticker, l.instrument_type desc, l.option_expiry nulls first, l.option_strike;

-- ════ C) Diary for one leg's-worth of context — every event for a ticker, oldest first ════
-- The ledger the legs are derived from. Compare against B to confirm they agree.
select h.ticker,
       case when l.instrument_type = 'SHARES' then 'Shares'
            else '$' || l.option_strike || left(l.option_right,1) || ' ' || to_char(l.option_expiry,'Mon ''YY') end as leg,
       lt.executed_at::date as date, lt.action_label, lt.action_type, lt.price, lt.weight, lt.host_quote, lt.notes
from public.leg_transactions lt
join public.legs l     on l.id = lt.leg_id
join public.holdings h on h.ticker = l.ticker and h.trader_id = l.trader_id
where h.ticker = 'ADEA'              -- ← set the ticker you want to inspect
order by lt.executed_at, lt.id;
