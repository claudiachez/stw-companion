-- 065: risk_config vol-target sizing config — Week-2 Item 3
-- (plans/20260709_integrity-guardrailsv2.md).
--
-- Per-user config for the DISPLAY-ONLY vol-targeted sizing scalar
-- (volTargetScalar in @stw/shared). Same additive "seed a placeholder default,
-- let the user override" pattern as migrations 055/059/060/063 — NOT NULL
-- DEFAULT with the shared default values (target 15% annualized vol · cap 1.5 ·
-- floor 0.3, matching DEFAULT_VOL_TARGET_CONFIG). Units are annualized PERCENT
-- to match regime_daily.rv20_annualized.
--
-- Advisory / display-only, exactly like every other value in this table —
-- nothing here places, blocks, or adjusts a trade. The scalar renders in the
-- admin Risk panel beside the regime light as a candidate; whether it ever
-- drives sizing is a Phase-B decision made on backtest evidence, not here.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

alter table public.risk_config
  add column if not exists vol_target_pct   numeric not null default 15,
  add column if not exists vol_target_cap   numeric not null default 1.5,
  add column if not exists vol_target_floor numeric not null default 0.3;

comment on column public.risk_config.vol_target_pct is
  'Vol-targeted sizing (advisory): target annualized realized volatility in percent. scalar = vol_target_pct / rv20_annualized, clamped. Display-only, never enforced.';
comment on column public.risk_config.vol_target_cap is
  'Vol-targeted sizing (advisory): maximum sizing scalar — never lever a low-vol name past this. Display-only, never enforced.';
comment on column public.risk_config.vol_target_floor is
  'Vol-targeted sizing (advisory): minimum sizing scalar — never shrink a high-vol name below this. Display-only, never enforced.';
