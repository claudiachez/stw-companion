-- Shared US-equity (NYSE) trading calendar — the SINGLE source of truth for
-- "is this a trading day", read by BOTH the repo's scheduled writers
-- (macro-snapshot / regime-daily / gex-snapshot) AND the out-of-repo ingestion
-- routines (stw-morning/afternoon/friday), each via the is_trading_day() RPC over
-- REST. No surface computes market days from a private hardcoded list anymore.
--
-- Weekends are derived (dow); only full-day market closures are stored. Dates are
-- the OBSERVED closures, so weekend-shifted holidays (e.g. Jul 4 on a Saturday →
-- observed the preceding Friday) are already resolved to the day the market is shut.
-- Extend yearly (same maintenance model as the FOMC list). The client-side mirror
-- in packages/shared/src/utils/market-calendar.ts must be kept in sync with this seed.

CREATE TABLE IF NOT EXISTS public.market_holidays (
  holiday_date date PRIMARY KEY,
  name         text NOT NULL
);

INSERT INTO public.market_holidays (holiday_date, name) VALUES
  -- 2025
  ('2025-01-01', 'New Year''s Day'),
  ('2025-01-20', 'Martin Luther King Jr. Day'),
  ('2025-02-17', 'Presidents'' Day'),
  ('2025-04-18', 'Good Friday'),
  ('2025-05-26', 'Memorial Day'),
  ('2025-06-19', 'Juneteenth'),
  ('2025-07-04', 'Independence Day'),
  ('2025-09-01', 'Labor Day'),
  ('2025-11-27', 'Thanksgiving Day'),
  ('2025-12-25', 'Christmas Day'),
  -- 2026
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-19', 'Martin Luther King Jr. Day'),
  ('2026-02-16', 'Presidents'' Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-06-19', 'Juneteenth'),
  ('2026-07-03', 'Independence Day (observed)'),
  ('2026-09-07', 'Labor Day'),
  ('2026-11-26', 'Thanksgiving Day'),
  ('2026-12-25', 'Christmas Day'),
  -- 2027
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-18', 'Martin Luther King Jr. Day'),
  ('2027-02-15', 'Presidents'' Day'),
  ('2027-03-26', 'Good Friday'),
  ('2027-05-31', 'Memorial Day'),
  ('2027-06-18', 'Juneteenth (observed)'),
  ('2027-07-05', 'Independence Day (observed)'),
  ('2027-09-06', 'Labor Day'),
  ('2027-11-25', 'Thanksgiving Day'),
  ('2027-12-24', 'Christmas Day (observed)')
ON CONFLICT (holiday_date) DO NOTHING;

-- Trading day = a weekday that isn't a stored holiday. STABLE + SQL so it inlines.
CREATE OR REPLACE FUNCTION public.is_trading_day(d date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT extract(dow FROM d) NOT IN (0, 6)
     AND NOT EXISTS (SELECT 1 FROM public.market_holidays h WHERE h.holiday_date = d);
$$;

-- Read-only reference data: authenticated users may read the table; the RPC is
-- executable by anyone signed in. Service-role callers (the writers + routines)
-- bypass RLS entirely.
ALTER TABLE public.market_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_holidays readable by authenticated" ON public.market_holidays;
CREATE POLICY "market_holidays readable by authenticated"
  ON public.market_holidays
  FOR SELECT
  TO authenticated
  USING (true);

GRANT EXECUTE ON FUNCTION public.is_trading_day(date) TO anon, authenticated;
