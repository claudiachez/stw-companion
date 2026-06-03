-- 010_recent_changes_authenticated_only.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- recent_changes is a (SECURITY DEFINER) view exposing only the safe run_log columns
-- (id, ran_at, run_type, summary, digest) for the Portfolio Overview "Latest
-- Portfolio Changes" digest. It was readable by the `anon` role, so the publishable
-- key embedded in the apps could pull the digest publicly. Views can't carry RLS, so
-- access is controlled purely by GRANTs — lock it to authenticated users only
-- (the digest is shown only inside the signed-in app).

REVOKE ALL ON public.recent_changes FROM anon;
REVOKE ALL ON public.recent_changes FROM public;
GRANT  SELECT ON public.recent_changes TO authenticated;
