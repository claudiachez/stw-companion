-- is_last_trading_day_of_week(date) — true when `d` is a trading day AND no later
-- trading day exists in its Mon–Fri week. Powers the "end-of-week weighting" run:
-- normally that's Friday, but when Friday is an NYSE holiday it's Thursday (or the
-- last open weekday). Builds on the market calendar from migration 068.
--
-- date_trunc('week', d) is the Monday of d's week (Postgres weeks start Monday);
-- + 4 days = that week's Friday. We check for any trading day strictly after d
-- through Friday — if there is none, d is the week's final trading day.

CREATE OR REPLACE FUNCTION public.is_last_trading_day_of_week(d date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_trading_day(d)
     AND NOT EXISTS (
       SELECT 1
       FROM generate_series(d + 1, (date_trunc('week', d)::date + 4), interval '1 day') AS g(day)
       WHERE public.is_trading_day(g.day::date)
     );
$$;

GRANT EXECUTE ON FUNCTION public.is_last_trading_day_of_week(date) TO anon, authenticated;
