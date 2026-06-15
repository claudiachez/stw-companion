-- 035: drop deprecated columns from `holding_transactions`.
--
-- ⚠️ PHASE 2 — HARD PREREQUISITES before applying:
--   - Migration 033 is live and verified
--   - `leg_transactions` is live and populated
--   - Routines Phase 2 updates deployed
--   - App code no longer reads position_detail / price / pnl_pct from this table
--   - Take a FRESH database dump immediately before applying
--
-- `direction` is NOT dropped here — it stays on holding_transactions until routines are
-- confirmed to write it to legs instead. Drop it in a subsequent migration after that
-- confirmation.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.holding_transactions
  drop column if exists position_detail,
  drop column if exists price,
  drop column if exists pnl_pct,
  drop column if exists leg;

commit;
