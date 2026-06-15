-- 031: add the holding_transactions → holdings sync trigger (weight-only carve-out).
--
-- ⚠️ BREAKING — do NOT apply to production individually. Once live, routines must
-- simultaneously STOP writing last_action / action_date / current_weight / initial_weight
-- directly to holdings, and write a holding_transactions row instead — the trigger
-- propagates upward. Cut over in the coordinated window only.
--
-- WEIGHT-ONLY CARVE-OUT: a row with action = 'Hold' means "weight changed, action did not"
-- (Friday weighting run, intra-week weight nudges). The trigger updates current_weight
-- (and write-once initial_weight) but LEAVES last_action / action_date intact — otherwise a
-- Friday weight refresh would overwrite a real Upsized/Trimmed action with Hold and reset
-- its date. Matches the live 016 behavior, which ignored weight-only Friday runs.
--
-- LOOP SAFETY (031 ↔ 016/033): 031 fires on holding_transactions INSERT and updates
-- holdings; that holdings UPDATE re-fires 033, which inserts back into holding_transactions.
-- Runaway is prevented by: (a) 033's dedupe guard on (ticker, trader_id, action,
-- event_date) blocking the re-entrant insert; (b) 031's pg_trigger_depth() > 1 guard
-- blocking re-entrant firing; (c) 031's DISTINCT FROM guards preventing no-op holdings
-- updates from re-firing 033 at all.
--
-- Requires 026 applied. VERIFY the loop + weight-only path on the preview branch first.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create or replace function fn_sync_holdings_from_transaction()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.holdings set
    -- Weight-only ('Hold') rows must not clobber the real last action / date
    last_action    = case when new.action = 'Hold' then last_action else new.action     end,
    action_date    = case when new.action = 'Hold' then action_date else new.event_date end,
    current_weight = new.weight,
    initial_weight = case
                       when initial_weight is null then new.weight
                       else initial_weight
                     end
  where ticker    = new.ticker
    and trader_id = new.trader_id
    and (
      -- include weight so a 'Hold' weight-only change is not skipped by the guard
      current_weight is distinct from new.weight  or
      (new.action <> 'Hold' and (
        last_action is distinct from new.action     or
        action_date is distinct from new.event_date
      ))
    );

  return new;
end;
$$;

create trigger trg_holding_transactions_sync
  after insert on public.holding_transactions
  for each row execute function fn_sync_holdings_from_transaction();

commit;

-- ============================================================================
-- VERIFY on the preview branch before production:
-- 1. Insert a real-action row (action='Upsized') → holdings updates last_action,
--    action_date, current_weight exactly once; no duplicate holding_transactions row.
-- 2. Insert a weight-only row (action='Hold') for a ticker last 'Upsized' → current_weight
--    updates, last_action/action_date unchanged.
-- ============================================================================
