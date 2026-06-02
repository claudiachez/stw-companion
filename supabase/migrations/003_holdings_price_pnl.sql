-- 003_holdings_price_pnl.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Adds the price + IBKR-computed P&L columns both apps read on the holding detail
-- pane. Populated by the admin app (and its IBKR proxy writer); read by web.
-- Ported from admin lineage migrations 003_last_price + 004_ibkr_pnl.

ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS last_price    NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS last_price_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_pnl_pct  NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS last_pnl_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ibkr_legs     JSONB;

COMMENT ON COLUMN public.holdings.last_price    IS 'Last known underlying price, set by admin when updating positions';
COMMENT ON COLUMN public.holdings.last_price_at IS 'Timestamp of when last_price was set';
COMMENT ON COLUMN public.holdings.last_pnl_pct  IS 'Average options P&L % computed by the IBKR proxy (avg across legs)';
COMMENT ON COLUMN public.holdings.last_pnl_at   IS 'Timestamp of last IBKR P&L sync';
COMMENT ON COLUMN public.holdings.ibkr_legs     IS 'Array of option leg objects: [{symbol,strike,right,expiry,entry,price,pnl_pct}]';
