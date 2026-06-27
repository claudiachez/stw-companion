-- Migration 047: add macro_prefs JSONB column to profiles
-- Stores { "visibleIndicators": ["SPY","QQQ","VIX","US10Y"] }
-- Default empty object = show defaults only.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS macro_prefs JSONB DEFAULT '{}';

-- Security-definer writer so subscribers can update only macro_prefs
-- (same pattern as set_my_preferences from migration 013).
CREATE OR REPLACE FUNCTION public.set_my_macro_prefs(prefs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET macro_prefs = prefs WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_macro_prefs(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_macro_prefs(jsonb) TO authenticated;
