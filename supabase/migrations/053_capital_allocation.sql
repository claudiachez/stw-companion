-- Capital-allocation defaults for the admin IBKR order modal's quick-quantity
-- suggestion (see plans/macro_dashboard_spec.md's sibling UX roadmap plan —
-- "Capital-allocation quick-quantity calculator"). Same app_config pattern as
-- migrations 040/052: one numeric row per key, admin-write RLS already covers
-- the whole table.
insert into public.app_config (key, value) values
  ('total_capital', 0),
  ('default_shares_deploy_pct', 0.05),
  ('default_options_deploy_pct', 0.05)
on conflict (key) do nothing;
