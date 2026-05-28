-- 007_profiles_and_tiers.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- What this does:
--   1. Adds email column to profiles (populated by trigger + web app upsert)
--   2. Creates trigger on auth.users INSERT → auto-creates profile with status='pending'
--   3. Seeds the tiers table (free/basic/premium) if rows are missing
--   4. Adds RLS policies so admin can manage all profiles, users read their own

-- ── 1. Add email to profiles ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 2. Auto-create profile on signup ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, status, subscription_tier)
  VALUES (
    NEW.id,
    NEW.email,
    'pending',
    'free'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 3. Tiers table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tiers (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  modules      TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed tiers (idempotent)
INSERT INTO public.tiers (id, label, modules) VALUES
  ('free',    'Free',    ARRAY[]::TEXT[]),
  ('basic',   'Basic',   ARRAY['picks']),
  ('premium', 'Premium', ARRAY['picks', 'signals'])
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on tiers
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read tiers
DROP POLICY IF EXISTS "all_read_tiers" ON public.tiers;
CREATE POLICY "all_read_tiers" ON public.tiers
  FOR SELECT TO authenticated USING (true);

-- ── 4. RLS policies on profiles ─────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own display_name / avatar_url
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can insert their own profile (needed by web-app upsert on first login)
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admin can read ALL profiles
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
CREATE POLICY "admin_read_all_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.email() = 'cc@claudiachez.com');

-- Admin can update ALL profiles (approve/reject, change tier)
DROP POLICY IF EXISTS "admin_update_all_profiles" ON public.profiles;
CREATE POLICY "admin_update_all_profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING  (auth.email() = 'cc@claudiachez.com')
  WITH CHECK (auth.email() = 'cc@claudiachez.com');
