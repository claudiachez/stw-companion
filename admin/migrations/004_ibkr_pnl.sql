-- Add IBKR-computed P&L columns to holdings
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS last_pnl_pct  NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS last_pnl_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ibkr_legs     JSONB;

COMMENT ON COLUMN holdings.last_pnl_pct IS 'Average options P&L % computed by IBKR proxy (avg across legs)';
COMMENT ON COLUMN holdings.last_pnl_at  IS 'Timestamp of last IBKR P&L sync';
COMMENT ON COLUMN holdings.ibkr_legs    IS 'Array of option leg objects: [{symbol,strike,right,expiry,entry,price,pnl_pct}]';
