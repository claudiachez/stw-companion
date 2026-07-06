-- Migration 050: run_log_latest — subscriber-safe view of the latest run per type.
-- run_log is admin-only (RLS: cc@claudiachez.com only). This view exposes ONLY
-- run_type + ran_at for the most-recent entry per type so the GEX Signals view can
-- show subscribers "Checked: Jun 29 · 9:02 AM ET" even when no new GEX report exists.
-- The view is owned by the migration role (bypasses run_log RLS) then locked to
-- authenticated users only — same pattern as recent_changes (migrations 008/010).

CREATE OR REPLACE VIEW public.run_log_latest AS
  SELECT DISTINCT ON (run_type) run_type, ran_at
  FROM public.run_log
  ORDER BY run_type, ran_at DESC;

COMMENT ON VIEW public.run_log_latest IS
  'One row per run_type with its latest ran_at. Subscriber-safe: exposes no operational fields from run_log.';

REVOKE ALL ON public.run_log_latest FROM anon;
REVOKE ALL ON public.run_log_latest FROM public;
GRANT  SELECT ON public.run_log_latest TO authenticated;
