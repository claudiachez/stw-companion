-- 046_drop_latest_run_view.sql
-- Run in the Supabase SQL editor.
--
-- The `latest_run` view (044) backed a "Last checked" disclosure on the Portfolio Overview that was
-- removed (it belonged on the GEX/Signals page, not Portfolio — see 045 + PR #55). With its only
-- consumer gone, the view is unused. Drop it. Safe: degrades gracefully even if older deployed code
-- still queries it (the query just returns nothing and the (removed) disclosure doesn't render).

DROP VIEW IF EXISTS public.latest_run;
