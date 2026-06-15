-- 036: dedupe guard on holding_transactions — manual entry + routine must not duplicate.
--
-- WHY: under the trigger-inversion model, BOTH the admin (the "+ Add Event" form, and the
-- Edit form via trigger 033) and the routines write `holding_transactions` rows. If an admin
-- manually records an event and the routine later processes the same Discord message, we'd get
-- two rows for the same (ticker, trader_id, action, event_date). A unique constraint on that
-- key — combined with idempotent upserts on every writer — collapses them to one row
-- (last write wins on weight/notes). This matches the long-standing 016/033 dedupe assumption
-- (one action per ticker per day) and is what the 033 trigger's EXISTS guard already enforces.
--
-- Prerequisite: no existing duplicate (ticker, trader_id, action, event_date) rows. Verified 0
-- on prod and the sandbox before adding. Requires 026 (trader_id) applied.
--
-- ⚠️ Writer change (ships with this): every direct insert into holding_transactions must use
--   ON CONFLICT (ticker, trader_id, action, event_date) DO UPDATE SET weight=…, notes=…
--   - app: insertHoldingTransaction upserts on this key (done in picks/api.ts)
--   - routines (Phase 2): PostgREST upsert with on_conflict=ticker,trader_id,action,event_date
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.holding_transactions
  add constraint holding_transactions_event_unique
    unique (ticker, trader_id, action, event_date);

commit;
