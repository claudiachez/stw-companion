-- 079_profile_avatar.sql
-- Profile avatar upload/edit. Stores a public URL on profiles.avatar_url, with the image
-- itself in a public "avatars" storage bucket. Same privilege-safe self-update pattern as
-- set_my_preferences/set_my_display_name — no broad UPDATE policy on profiles.

-- 1. Column: the public URL of the user's uploaded avatar (null = show initials fallback).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Self-update RPC (SECURITY DEFINER writes only avatar_url for the caller's own row).
CREATE OR REPLACE FUNCTION public.set_my_avatar_url(url text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET avatar_url = NULLIF(btrim(url), '') WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.set_my_avatar_url(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar_url(text) TO authenticated;

-- 3. Public "avatars" storage bucket (public read; writes gated by policy below).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS: anyone can read (public bucket); a user may write/replace/delete only
--    files under their own uid-prefixed folder, e.g. "<uid>/<file>".
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
