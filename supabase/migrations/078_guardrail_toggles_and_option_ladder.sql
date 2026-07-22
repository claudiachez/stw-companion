-- 078_guardrail_toggles_and_option_ladder.sql
-- Settings redesign (2026-07-20): each guardrail group can be turned on/off per user, and
-- the per-position stop ladder splits into a stock ladder (existing per_stock_ladder) and a
-- separate OPTION ladder. Enabled flags default TRUE so existing rows keep evaluating exactly
-- as they do today — the flags are honored by the Risk-tab evaluators + alert cron as those
-- surfaces are migrated (stored/edited first, per the redesign plan).
ALTER TABLE public.risk_config
  ADD COLUMN IF NOT EXISTS caps_enabled            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS per_stock_enabled       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS regime_enabled          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS per_stock_option_ladder jsonb   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.risk_config.caps_enabled IS 'Guardrail toggle: position/option/sector/gross size caps (Settings redesign).';
COMMENT ON COLUMN public.risk_config.ladder_enabled IS 'Guardrail toggle: account drawdown ladder (safety net).';
COMMENT ON COLUMN public.risk_config.per_stock_enabled IS 'Guardrail toggle: per-position stop ladders (stocks + options).';
COMMENT ON COLUMN public.risk_config.regime_enabled IS 'Guardrail toggle: red-market (regime) playbook.';
COMMENT ON COLUMN public.risk_config.per_stock_option_ladder IS 'Per-OPTION drawdown-from-entry stop ladder [{drawdownPct,holdFractionPct}] — sibling to per_stock_ladder for share positions.';
