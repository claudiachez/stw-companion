-- Admin-only real IBKR order placement (one-click execute/close from the
-- Transaction History ledger — see plans/macro_dashboard_spec.md's sibling UX
-- roadmap plan, "Phase 2"). This is an extension of the existing local-only
-- apps/admin/ibkr_proxy.py pricer, NOT a subscriber-facing feature — the
-- proxy only ever runs on the admin's own machine against their own IB
-- Gateway. Nothing here touches profiles.ibkr_flex_token/ibkr_query_id
-- (the separate, read-only subscriber Flex Query pipeline).

-- (a) Kill switch: same app_config pattern as the 040 split defaults —
-- one numeric-flag row the admin can flip off without a deploy.
insert into public.app_config (key, value) values
  ('ibkr_live_trading_enabled', 0)
on conflict (key) do nothing;

-- (b) Idempotency + fill tracking on the diary. A leg_transactions row that
-- already has a broker_order_id can't be double-fired from the UI, and the
-- confirmed fill (never the originally-typed price) is what gets patched
-- back — see the "never book $0 or a guessed price" rule already governing
-- this table.
alter table public.leg_transactions
  add column if not exists broker_order_id   text,
  add column if not exists broker_status     text,
  add column if not exists broker_fill_price numeric;
