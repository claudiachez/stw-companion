-- 044_latest_run_view.sql
-- Run in the Supabase SQL editor.
--
-- The Overview "Latest Portfolio Changes" / "Conviction Changes" blocks date themselves from the
-- last run that PRODUCED a change — `recent_changes` (008) filters `digest IS NOT NULL`. So when a
-- routine runs but finds no new signal, that run is invisible and the dashboard looks stale even
-- though the system just checked. This view exposes the newest run timestamp across ALL runs
-- (regardless of digest) so the app can disclose "last checked" — i.e. the data is current, there's
-- simply no fresher signal.
--
-- Subscriber-safe: only `ran_at` + `run_type`, none of run_log's admin-only operational columns.
-- Owner-rights view (like `recent_changes`/008) so run_log's admin-only RLS (005) doesn't block it.

CREATE OR REPLACE VIEW public.latest_run AS
  SELECT ran_at, run_type
  FROM public.run_log
  ORDER BY ran_at DESC
  LIMIT 1;

COMMENT ON VIEW public.latest_run IS
  'Subscriber-safe newest run_log timestamp (any run, incl. no-change runs) for the dashboard "last checked" freshness disclosure.';

GRANT SELECT ON public.latest_run TO authenticated;
