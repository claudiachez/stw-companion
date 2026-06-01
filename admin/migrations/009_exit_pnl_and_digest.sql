-- 009_exit_pnl_and_digest.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- What this does:
--   1. holdings.exit_price / holdings.exit_pnl_pct — when a position is Closed,
--      the afternoon routine snapshots the underlying price at close (live-notes
--      rarely states an exit price) and computes the realized P&L vs the entry
--      cost basis. The dashboard relabels "Open P&L" -> "Close P&L" and shows the
--      realized number instead of blanking the card.
--   2. run_log.digest — a rich, human-readable changes summary (the same text the
--      routine posts in chat). The dashboard reads the newest digest and renders
--      it as "Latest Portfolio Changes" in the Portfolio Overview panel.
--
-- Identity: the scheduled skills authenticate with the service_role key (bypasses
--   RLS). Existing RLS policies on holdings/run_log are unchanged — new columns
--   inherit them. No policy changes needed.

ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS exit_price   NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_pnl_pct NUMERIC;

COMMENT ON COLUMN public.holdings.exit_price   IS 'Underlying price snapshotted when the position was Closed (realized-exit reference)';
COMMENT ON COLUMN public.holdings.exit_pnl_pct IS 'Realized P&L % at close, computed from entry cost basis vs exit_price (null if not computable)';

ALTER TABLE public.run_log
  ADD COLUMN IF NOT EXISTS digest TEXT;

COMMENT ON COLUMN public.run_log.digest IS 'Rich chat-style portfolio-changes summary for the dashboard Portfolio Overview panel';
