-- 004_holdings_admin_write.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- RLS is enabled on holdings but the base schema only granted reads. The admin app
-- writes last_price / last_pnl_* / ibkr_legs (UPDATE) and upserts positions
-- (INSERT ... ON CONFLICT). Without both policies PostgREST silently returns
-- 204/0-rows on update and 403 on upsert. Web never writes holdings, so these
-- policies are admin-only. Ported from admin lineage 005 + 006.

DROP POLICY IF EXISTS "admin_can_update_holdings" ON public.holdings;
CREATE POLICY "admin_can_update_holdings" ON public.holdings
  FOR UPDATE TO authenticated
  USING  (auth.email() = 'cc@claudiachez.com')
  WITH CHECK (auth.email() = 'cc@claudiachez.com');

DROP POLICY IF EXISTS "admin_can_insert_holdings" ON public.holdings;
CREATE POLICY "admin_can_insert_holdings" ON public.holdings
  FOR INSERT TO authenticated
  WITH CHECK (auth.email() = 'cc@claudiachez.com');
