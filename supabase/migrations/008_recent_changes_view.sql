-- 008_recent_changes_view.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- The Portfolio Overview panel ("Latest Portfolio Changes") reads run_log.digest.
-- run_log itself is admin-only (005 RLS restricts SELECT to cc@claudiachez.com) and
-- carries Discord operational internals (channel names, message ids, high-water
-- marks) that subscribers must not see.
--
-- This view exposes ONLY the subscriber-safe columns (ran_at, run_type, summary,
-- digest) for runs that produced a digest. The view is owned by the migration role
-- (a table owner of run_log), so it reads run_log with the owner's rights and the
-- underlying admin-only RLS does not block authenticated subscribers reading the
-- view. We then grant SELECT on the view to authenticated users.

CREATE OR REPLACE VIEW public.recent_changes AS
  SELECT id, ran_at, run_type, summary, digest
  FROM public.run_log
  WHERE digest IS NOT NULL
  ORDER BY ran_at DESC;

COMMENT ON VIEW public.recent_changes IS
  'Subscriber-safe projection of run_log: latest portfolio-change digests for the dashboard Overview panel. Hides Discord operational columns.';

-- Authenticated subscribers (and admin) may read the digest feed.
GRANT SELECT ON public.recent_changes TO authenticated;
