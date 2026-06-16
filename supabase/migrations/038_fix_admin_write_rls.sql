-- 038: fix the admin-write RLS on `holding_transactions` + `conviction_comments`.
--
-- BUG: migration 011 wrote these policies as
--   (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
-- The `authenticated` role cannot SELECT from `auth.users`, so the subquery raises
-- "permission denied for table users" — which surfaces as a hard error on any app-side
-- INSERT/UPDATE/DELETE (e.g. deleting a transaction in the admin UI failed with
-- "Delete failed: [object Object]"). The routines never hit this because they write with the
-- service-role key (bypasses RLS).
--
-- FIX: use the JWT email claim directly (`auth.jwt() ->> 'email'`) — the same pattern the
-- `holdings`/`legs`/`leg_transactions` policies already use successfully.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

drop policy if exists "ht_admin_write" on public.holding_transactions;
create policy "ht_admin_write" on public.holding_transactions
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

drop policy if exists "cc_admin_write" on public.conviction_comments;
create policy "cc_admin_write" on public.conviction_comments
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
