-- 034: drop deprecated columns from `holdings`.
--
-- ⚠️ PHASE 2 — HARD PREREQUISITES before applying:
--   - Migration 033 is live and verified
--   - `legs` table has been backfilled (see backfill script)
--   - App code no longer reads any deprecated column
--   - Admin IBKR proxy updated to write legs.mark_price instead of holdings columns
--   - Take a FRESH database dump immediately before applying
--
-- Verified safe: no view or materialized view depends on any of these columns in the live
-- schema — the drops will not be blocked.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.holdings
  drop column if exists position_detail,
  drop column if exists last_price,
  drop column if exists last_price_at,
  drop column if exists last_pnl_pct,
  drop column if exists last_pnl_at,
  drop column if exists ibkr_legs,
  drop column if exists exit_price,
  drop column if exists exit_pnl_pct,
  drop column if exists basket;

commit;
