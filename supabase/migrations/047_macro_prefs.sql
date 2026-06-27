-- Migration 047: add macro_prefs JSONB column to profiles
-- Stores { "visibleIndicators": ["SPY","QQQ","VIX","US10Y"] }
-- Default empty object = show defaults only.
-- Only runs if the profiles table exists (guards against partial-migration envs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS macro_prefs JSONB DEFAULT '{}';

    -- Security-definer function so subscribers can write only macro_prefs (same pattern as set_my_preferences)
    -- Note: DROP first so we can redefine safely.
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_my_macro_prefs(prefs jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET macro_prefs = prefs WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_my_macro_prefs(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_macro_prefs(jsonb) TO authenticated;
