-- Live account equity from the broker (host decision 2026-07-11). The gross/
-- position/sector/option limits divide by "account equity"; using the manual
-- account_equity (a fixed deposit figure) went stale the moment the account moved
-- (the 114% gross-exposure artifact). ibkr_nlv is the account's Net Liquidation
-- Value pulled live from the IBKR Flex NAV section on each sync — the limits engine
-- prefers it, falling back to account_equity only until the first NAV sync lands.
--
-- Kept as a SEPARATE column (not overwriting account_equity) so the manual
-- placeholder + is_placeholder path stays intact as the fallback.

ALTER TABLE public.risk_config
  ADD COLUMN IF NOT EXISTS ibkr_nlv    numeric,
  ADD COLUMN IF NOT EXISTS ibkr_nlv_at timestamptz;

COMMENT ON COLUMN public.risk_config.ibkr_nlv IS
  'Net Liquidation Value (live account equity, incl. margin) from the IBKR Flex NAV section, written by ibkr-flex.ts on each sync. Preferred over account_equity as the limits denominator.';
