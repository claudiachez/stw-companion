-- 009_graddox_rls.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Fixes the Supabase advisor "rls_disabled_in_public" (CRITICAL): the `graddox`
-- table shipped with Row-Level Security DISABLED, so anyone with the project URL +
-- the publishable (anon) key — which is embedded in both apps — could read, edit, or
-- delete every row. This brings it in line with `holdings`:
--   • signed-in users may READ (GEX Signals sits behind auth in web + admin)
--   • only the admin (cc@claudiachez.com) may WRITE
-- The Gradoxx morning skill writes graddox via the service_role key, which BYPASSES
-- RLS, so it is unaffected by these policies.

ALTER TABLE public.graddox ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user.
DROP POLICY IF EXISTS "graddox_read_authenticated" ON public.graddox;
CREATE POLICY "graddox_read_authenticated" ON public.graddox
  FOR SELECT TO authenticated
  USING (true);

-- Write: admin only (graddox is upserted on id=1, so both INSERT and UPDATE).
DROP POLICY IF EXISTS "admin_can_insert_graddox" ON public.graddox;
CREATE POLICY "admin_can_insert_graddox" ON public.graddox
  FOR INSERT TO authenticated
  WITH CHECK (auth.email() = 'cc@claudiachez.com');

DROP POLICY IF EXISTS "admin_can_update_graddox" ON public.graddox;
CREATE POLICY "admin_can_update_graddox" ON public.graddox
  FOR UPDATE TO authenticated
  USING (auth.email() = 'cc@claudiachez.com')
  WITH CHECK (auth.email() = 'cc@claudiachez.com');
