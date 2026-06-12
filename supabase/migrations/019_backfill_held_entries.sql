-- 019: backfill a synthetic 'New' entry for positions currently in 'Hold' status.
--
-- WHY: migration 018 seeds one row per holding from its LATEST action, but a position
-- whose last_action is 'Hold' has no action event, so it got no row and stays blank in
-- the ledger. Per request, give every held position a 'New' entry representing its
-- original entry so it appears in the ledger/timeline.
--
-- CAVEAT — what's derivable: holdings don't store the original entry date or entry price.
-- We use the best available signals:
--   event_date = action_date (the only date on the row) or today as a fallback
--   weight     = initial_weight (entry weight) or current_weight
--   price      = NULL (no reliable historical entry price is stored)
-- So this 'New' is an approximate entry marker, not a precise fill record. Going forward
-- the migration-016 trigger logs real actions exactly.
--
-- Idempotent: only fires for 'Hold' positions that have NO existing 'New' row (any leg),
-- so re-running it — or running after a real 'New' is logged — never duplicates.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

INSERT INTO holding_transactions
  (ticker, leg, action, event_date, weight, position_detail, price, pnl_pct, notes)
SELECT
  h.ticker,
  1 AS leg,
  'New' AS action,
  COALESCE(h.action_date, CURRENT_DATE) AS event_date,
  COALESCE(h.initial_weight, h.current_weight) AS weight,
  h.position_detail,
  NULL AS price,
  NULL AS pnl_pct,
  NULL AS notes
FROM holdings h
WHERE h.ticker <> 'CASH'
  AND h.last_action = 'Hold'
  AND NOT EXISTS (
    SELECT 1 FROM holding_transactions t
    WHERE t.ticker = h.ticker
      AND t.action = 'New'
  );
