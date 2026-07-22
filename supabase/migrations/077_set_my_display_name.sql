-- 077_set_my_display_name.sql
-- Let a user edit their own display name (first + last, stored as "First Last").
--
-- Same privilege-safe pattern as set_my_preferences (013): we do NOT add a broad
-- UPDATE policy on profiles — that would let a subscriber change their own
-- subscription_tier / status. Instead a SECURITY DEFINER function writes ONLY the
-- display_name column, ONLY for the caller's own row. Reads already work via the
-- existing "own_profile_read" policy. The value is trimmed and length-capped here so
-- a client can't store an unbounded blob.
CREATE OR REPLACE FUNCTION public.set_my_display_name(new_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET display_name = NULLIF(left(btrim(new_name), 120), '')
   WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_my_display_name(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_display_name(text) TO authenticated;
