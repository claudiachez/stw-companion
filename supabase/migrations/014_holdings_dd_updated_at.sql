-- 014_holdings_dd_updated_at.sql
-- When a holding's DD / thesis / conviction commentary was last refreshed — set by the
-- morning & afternoon runs (live-notes DD) and the afternoon stream-conviction step.
-- Distinct from updated_at (any row change) and last_pnl_at (IBKR option pricing).
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS dd_updated_at timestamptz;
