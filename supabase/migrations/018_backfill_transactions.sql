-- 018: backfill holding_transactions from existing holdings data.
--
-- WHY: the ledger (and per-ticker timeline) is empty for positions that predate the
-- migration-016 trigger. This seeds one transaction per holding from its CURRENT state —
-- the latest action on record (last_action / action_date / current_weight / last_price,
-- plus exit P&L for Closed). It's all that's reliably stored; holdings don't keep the
-- full entry→trim→exit history, so we don't fabricate one.
--
-- Idempotent: the NOT EXISTS guard matches the trigger's dedupe key
-- (ticker, leg, action, event_date), so re-running this — or running it after the
-- trigger has already logged a change — never duplicates a row. Positions whose
-- last_action is 'Hold' get no row (a hold is not a transaction event); their next real
-- action will be logged by the trigger.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

INSERT INTO holding_transactions
  (ticker, leg, action, event_date, weight, position_detail, price, pnl_pct, notes)
SELECT
  h.ticker,
  1 AS leg,
  h.last_action,
  COALESCE(h.action_date, CURRENT_DATE) AS event_date,
  h.current_weight,
  h.position_detail,
  h.last_price,
  CASE WHEN h.last_action = 'Closed' THEN h.exit_pnl_pct ELSE NULL END,
  NULL
FROM holdings h
WHERE h.ticker <> 'CASH'
  AND h.last_action IS NOT NULL
  AND h.last_action <> 'Hold'
  AND NOT EXISTS (
    SELECT 1 FROM holding_transactions t
    WHERE t.ticker = h.ticker
      AND t.leg = 1
      AND t.action = h.last_action
      AND t.event_date = COALESCE(h.action_date, CURRENT_DATE)
  );
