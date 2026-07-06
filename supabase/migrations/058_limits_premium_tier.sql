-- 058: gate the subscriber-facing Limits engine behind the Premium tier.
--
-- Follow-up to plans/integrity-guardrails.md Item 2, extended (host decision,
-- 2026-07-06) to a self-service subscriber feature in apps/web Settings, next
-- to the existing IBKR Connection card. Subscribers edit their own thresholds
-- freely (RiskConfigForm) — same risk_config/user_positions RLS as the
-- admin-only version, just gated behind Premium via the existing
-- tiers.modules mechanism (useTierAccess('limits') in apps/web).

begin;

update public.tiers
  set modules = array_append(modules, 'limits')
  where id = 'premium' and not ('limits' = any(modules));

commit;
