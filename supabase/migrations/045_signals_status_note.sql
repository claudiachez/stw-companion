-- 045_signals_status_note.sql
-- Run in the Supabase SQL editor.
--
-- The Signals (GEX) view shows the latest `signals` row as if it were today's read. When the host
-- is on a break (no morning prep), the latest read goes stale and there's no way to disclose "no
-- new report today / prep resumes <date>". This adds an optional free-text status note the Signals
-- view shows when the latest read is stale, e.g. "Morning prep resumes 7/7". The morning/Graddox
-- routine sets it on a break announcement and clears it when prep resumes.

alter table public.signals
  add column if not exists status_note text;

comment on column public.signals.status_note is
  'Optional status message shown on the Signals view when the latest GEX read is stale (e.g. "Morning prep resumes 7/7" during a host break). Set/cleared by the morning routine.';
