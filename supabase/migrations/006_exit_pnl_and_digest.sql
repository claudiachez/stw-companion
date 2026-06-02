-- 006_exit_pnl_and_digest.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- 1. holdings.exit_price / exit_pnl_pct — when a position is Closed, the afternoon
--    routine snapshots the underlying price at close and computes realized P&L vs
--    entry cost basis. The detail pane relabels "Open P&L" -> "Close P&L".
-- 2. run_log.digest — rich chat-style portfolio-changes summary the dashboard reads
--    as "Latest Portfolio Changes" in the Portfolio Overview panel.
--
-- New columns inherit existing RLS on holdings/run_log; no policy changes needed.
-- Ported from admin lineage 009.

ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS exit_price   NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_pnl_pct NUMERIC;

COMMENT ON COLUMN public.holdings.exit_price   IS 'Underlying price snapshotted when the position was Closed (realized-exit reference)';
COMMENT ON COLUMN public.holdings.exit_pnl_pct IS 'Realized P&L % at close, computed from entry cost basis vs exit_price (null if not computable)';

ALTER TABLE public.run_log
  ADD COLUMN IF NOT EXISTS digest TEXT;

COMMENT ON COLUMN public.run_log.digest IS 'Rich chat-style portfolio-changes summary for the dashboard Portfolio Overview panel';
