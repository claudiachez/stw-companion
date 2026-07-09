-- Week-2 Item 0c — provenance record for the midnight-UTC timestamp stamping.
-- plans/20260709_integrity-guardrailsv2.md.
--
-- Context: the Week-1 integrity audit (Item 1) found 36 PROD / 37 sandbox
-- leg_transactions rows whose executed_at was an exact-midnight-UTC timestamp
-- (date-only precision, no intraday time). The host confirmed the CALENDAR DATES
-- were already correct; rather than a Discord-research pass, each such row was
-- stamped with an assumed 4:00pm ET market-close time on its existing date
-- (DST-adjusted). See plans/20260708_integrity-guardrails-report.md, deviation #4.
--
-- Item 0c requires that this stamping itself be provenanced: "an audit that fixes
-- provenance must not itself be unprovenanced." The per-row prior values were not
-- captured individually at stamping time; the best-available, honest artifact is
-- an aggregate ops_log 'data_correction' row describing the action, its prior
-- state (exact-midnight UTC / date-only), its new state (4:00pm ET assumed
-- close), and its authority (host confirmation, cited report).
--
-- IDEMPOTENT: the insert is guarded so re-running never duplicates. Safe to run
-- on PROD (usmqbohcjcyszjxxvnqu) and sandbox (uolabcgbnrkhzpwuvzlk).
--
-- ── STEP 1 — VERIFY current state (run first, inspect, then run STEP 2) ────────
-- (a) How many rows still carry an exact-midnight-UTC executed_at? (Should be ~0
--     if the stamping ran; a nonzero count means some rows were NOT stamped.)
--   select count(*) as midnight_utc_rows
--   from public.leg_transactions
--   where executed_at = date_trunc('day', executed_at at time zone 'UTC') at time zone 'UTC';
-- (b) Is the provenance record already present?
--   select * from public.ops_log
--   where event_type = 'data_correction' and affected_scope = 'leg_transactions.executed_at';

-- ── STEP 2 — write the provenance record (idempotent) ─────────────────────────
insert into public.ops_log (event_type, period_start, period_end, affected_scope, detail, resolved)
select
  'data_correction',
  '2026-07-08 00:00:00+00',
  '2026-07-08 23:59:59+00',
  'leg_transactions.executed_at',
  'Week-1 integrity audit (Item 1): leg_transactions rows carrying an exact-midnight-UTC '
  || 'executed_at (date-only precision, no intraday time) were stamped with an assumed '
  || '4:00pm ET market-close time on their existing (host-confirmed-correct) date, '
  || 'DST-adjusted. Scope: 36 rows on PROD, 37 on sandbox. Prior value: exact-midnight '
  || 'UTC. New value: 4:00pm ET close on the same calendar date. Authority: host '
  || 'confirmation the dates were correct; see plans/20260708_integrity-guardrails-report.md '
  || '(deviation #4). tradingDateET() special-cases exact-midnight timestamps to avoid a '
  || 'previous-day rollback. Per-row prior values were not individually captured at '
  || 'stamping time — this aggregate record is the provenance artifact.',
  true
where not exists (
  select 1 from public.ops_log
  where event_type = 'data_correction'
    and affected_scope = 'leg_transactions.executed_at'
);

-- ── STEP 3 — confirm ──────────────────────────────────────────────────────────
--   select id, event_type, affected_scope, left(detail, 80) as detail
--   from public.ops_log where affected_scope = 'leg_transactions.executed_at';
