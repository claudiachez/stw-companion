-- 020: add a per-transaction trade direction (long / short).
--
-- WHY: the Trades view shows Long/Short per position, but holdings/holding_transactions
-- don't store direction. It's inferred from position_detail by default (inferDirection in
-- @stw/shared) and can be overridden here via the trade editor. Nullable — null means
-- "use the inferred value".
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

ALTER TABLE holding_transactions
  ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('long', 'short'));
