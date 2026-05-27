-- Fix: Allow authenticated admin to update holdings rows
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Root cause: RLS is enabled on the holdings table but no UPDATE policy existed.
-- All admin writes (last_price, last_pnl_pct, last_pnl_at, ibkr_legs) silently
-- returned 204 with 0 rows affected — PostgREST's behavior for RLS-blocked writes.
-- Column-level grants were confirmed fine; the missing piece was a row-level policy.
--
-- OPTIONAL: Run this first to confirm the issue before applying the fix:
-- SELECT pc.relrowsecurity AS rls_enabled, pp.policyname, pp.cmd, pp.roles
-- FROM pg_class pc
-- LEFT JOIN pg_policies pp ON pp.tablename = pc.relname AND pp.schemaname = 'public'
-- WHERE pc.relname = 'holdings' AND pc.relnamespace = 'public'::regnamespace;

CREATE POLICY "admin_can_update_holdings" ON public.holdings
  FOR UPDATE TO authenticated
  USING  (auth.email() = 'cc@claudiachez.com')
  WITH CHECK (auth.email() = 'cc@claudiachez.com');
