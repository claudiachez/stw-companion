-- 021: add trade direction (long / short) to holdings.
--
-- WHY: the Trades view shows Long/Short per position. It's inferred from position_detail
-- by default (inferDirection in @stw/shared) and overridable by the admin via the trade
-- editor. Stored on holdings (one direction per position); nullable = use the inferred value.
-- (Supersedes the unused holding_transactions.direction column from migration 020.)
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('long', 'short'));
