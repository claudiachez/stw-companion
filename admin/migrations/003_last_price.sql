-- Add last_price and last_price_at to holdings
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

ALTER TABLE holdings
  ADD COLUMN IF NOT EXISTS last_price    NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS last_price_at TIMESTAMPTZ;

COMMENT ON COLUMN holdings.last_price    IS 'Last known price, populated by admin when updating positions';
COMMENT ON COLUMN holdings.last_price_at IS 'Timestamp of when last_price was set';
