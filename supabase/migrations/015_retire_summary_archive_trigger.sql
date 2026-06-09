-- 015: retire the overwrite-archive plumbing for holdings.summary.
--
-- WHY: the conviction area is being split into three role-based blocks —
--   • Thesis        = holdings.summary (+ bullets), the durable "why he's in it"
--   • Latest Comment = the newest conviction_comments row (host note)
--   • History        = every other conviction_comments row
--
-- Conviction history is now fed by EXPLICIT, append-only inserts from the routines
-- (each Discord argument / stream remark inserts its own conviction_comments row with
-- the correct source + event_date). The old model — update holdings.summary via the
-- update_holding_summary() RPC and let a BEFORE-UPDATE trigger archive the OLD summary —
-- is retired because it (a) double-logs against explicit inserts and (b) mis-stamped the
-- archived row with the REPLACING run's source and CURRENT_DATE.
--
-- conviction_comments (migrations 011/012) is unchanged and remains the single source of
-- truth for the Latest Comment + History blocks.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

-- Trigger first (depends on the function).
DROP TRIGGER IF EXISTS trg_archive_holding_summary ON holdings;

-- Archive trigger function (migration 013).
DROP FUNCTION IF EXISTS stw_archive_holding_summary();

-- Session-source helper (migration 013) — only ever used to feed the archive trigger.
DROP FUNCTION IF EXISTS set_run_source(TEXT);

-- Summary-writer RPC (migration 014) — routines now write holdings.summary directly and
-- insert conviction_comments explicitly, so this wrapper is no longer needed.
DROP FUNCTION IF EXISTS update_holding_summary(TEXT, TEXT, JSONB, TEXT);
