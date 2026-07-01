-- Daily market recap table: one row per trading day per session (am / pm).
-- AM = pre-market note generated ~8am ET; PM = post-market recap ~4:30pm ET.
-- Written only by the Netlify scheduled functions via the service-role key;
-- subscribers read via the authenticated RLS grant below.

CREATE TABLE IF NOT EXISTS public.macro_daily_recaps (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  date          date        NOT NULL,
  session       text        NOT NULL CHECK (session IN ('am', 'pm')),
  recap         jsonb       NOT NULL,
  model         text,
  generated_at  timestamptz DEFAULT now(),
  UNIQUE (date, session)
);

-- Only authenticated users may read; no client writes (service-role only).
ALTER TABLE public.macro_daily_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read daily recaps"
  ON public.macro_daily_recaps
  FOR SELECT
  TO authenticated
  USING (true);
