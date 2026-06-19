-- FIX FIVN shares-leg weight: 3.5% → 2.5% (net-neutral with the closed $25C Oct).
--
-- On 6/11 the host replaced the FIVN $25C Oct (2.5%) with shares "net neutral, keeping the $22.5C in
-- full size." A contract→shares replacement's new shares leg must INHERIT the replaced leg's weight,
-- so the shares leg should be 2.5%, not 3.5%. At 3.5% the position is 3.5 (22.5C) + 3.5 (shares) =
-- 7.0%, which breaks the stated net-neutral 6.0%. The import set it to 3.5% (mirroring the 22.5C).
--
-- legs.weight is trigger-derived, so we edit the SHARES leg's opening BUY diary row; the 040 trigger
-- re-derives legs.initial_weight + legs.weight to 2.5%.
-- Env-agnostic (resolves the STW trader + FIVN shares leg by name/ticker, not a hardcoded UUID).
-- Idempotent.
--
-- Run in the Supabase SQL editor:
--   PROD:    https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--   SANDBOX: https://supabase.com/dashboard/project/uolabcgbnrkhzpwuvzlk/sql

update public.leg_transactions lt
   set weight = 2.5
  from public.legs lg
  join public.traders t on t.id = lg.trader_id and t.name = 'STW'
 where lt.leg_id = lg.id
   and lg.ticker = 'FIVN'
   and lg.instrument_type = 'SHARES'
   and lt.action_type = 'BUY'
   and lt.price = 20.48
   and lt.weight is distinct from 2.5;

-- Verify: the FIVN shares leg should now read initial_weight = weight = 2.5 (OPEN);
-- 22.5C stays 3.5; position cost-basis Σ open lots = 6.0.
select lg.instrument_type, lg.option_strike, lg.option_right, lg.status,
       lg.initial_weight, lg.weight
from public.legs lg
join public.traders t on t.id = lg.trader_id and t.name = 'STW'
where lg.ticker = 'FIVN'
order by lg.opened_at;
