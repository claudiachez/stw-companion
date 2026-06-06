-- 013_profile_preferences.sql
-- Per-user UI preferences (theme + Stock Picks filters), persisted across devices.

-- 1. Storage: a single jsonb blob on the user's profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Secure self-update.
-- We do NOT add a broad UPDATE policy on profiles — that would let a subscriber change
-- their own subscription_tier / status (privilege escalation). Instead, a SECURITY
-- DEFINER function writes ONLY the preferences column, ONLY for the caller's own row.
-- Reads already work via the existing "own_profile_read" policy.
CREATE OR REPLACE FUNCTION public.set_my_preferences(prefs jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET preferences = prefs WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_my_preferences(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_preferences(jsonb) TO authenticated;
