-- 041: drop the deferred `direction` column from `holding_transactions`.
--
-- Migration 035 intentionally KEPT `direction` "until routines are confirmed to write it to
-- legs instead." That confirmation is now done.
--
-- ✅ CONFIRMED (2026-06-23) — safe to drop:
--   - All four STW routines (morning / afternoon / friday-weighting / transcripts) write
--     direction onto `legs` (the event-sourced home) and NEVER write `holding_transactions`
--     (that path is retired in their SKILLs).
--   - The live 033 audit trigger inserts only ticker / trader_id / action / event_date /
--     weight / notes / created_at — it never writes `direction`.
--   - No app code reads `holding_transactions` at all.
--   - Verified on PROD: 0 `holding_transactions` rows carry a non-null `direction`.
--   - No view/materialized view depends on the column.
--
-- ⚠️ Same gate as 034/035: apply only after the routines are confirmed clean on a live run
--   and a FRESH database dump has been taken. Apply alongside / right after 035 (sandbox
--   first, verify, then PROD).
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.holding_transactions
  drop column if exists direction;

commit;
