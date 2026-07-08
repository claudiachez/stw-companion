-- 061: admin-configurable Market Regime sleeve weights.
--
-- The regime score is a weighted blend of the five sleeves (Trend / Volatility /
-- Credit / Rates+Dollar / GEX). The weights were a hardcoded constant
-- (SLEEVE_WEIGHTS in @stw/shared); this seeds them into app_config so the admin
-- Config page can tune them. Stored as PERCENT integers (30 = 30%) — the
-- environmentScore() scorer normalizes by the total, so the absolute scale is
-- cosmetic; percent just reads cleanest in the Config UI and the regime tooltip.
--
-- app_config is the existing key→numeric-value store (migration 040); no schema
-- change, just five idempotent seed rows. RLS already restricts writes to
-- cc@claudiachez.com and grants SELECT to all authenticated users.
insert into public.app_config (key, value) values
  ('regime_weight_trend', 30),
  ('regime_weight_volatility', 20),
  ('regime_weight_credit', 15),
  ('regime_weight_rates_dollar', 15),
  ('regime_weight_gex', 20)
on conflict (key) do nothing;
