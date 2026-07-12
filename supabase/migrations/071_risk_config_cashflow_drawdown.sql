-- 071: cash-flow-adjusted drawdown ladder (host-agreed rebuild, 2026-07-12).
--
-- THE BUG this replaces: the drawdown ladder fired on a phantom −60% drawdown.
-- Migration 059's fn_risk_config_track_equity_peak ratcheted `equity_peak` off
-- `account_equity`, which defaults to the $100,000 placeholder. The operator's
-- real live equity is ~$40k (ibkr_nlv), so ViolationsSummary computed
-- (40k − 100k)/100k = −60% and lit up every ladder rung against a peak that was
-- never a real observed balance.
--
-- Why "peak = high-water mark of ibkr_nlv" ALONE is still wrong: the operator's
-- NAV history has a ~$60k WITHDRAWAL on 2026-02-17. A raw NLV high-water mark
-- would read that withdrawal as a −60% loss. Drawdown has to be measured NET OF
-- EXTERNAL CASH FLOWS — a deposit/withdrawal moves NLV without being a gain/loss.
--
-- THE MODEL (cash-flow-adjusted, incremental high-water mark — no NLV time series
-- is stored, so the peak is maintained observation-by-observation going forward):
--   * equity_peak          — the RAW ibkr_nlv at the flow-adjusted high (dollars).
--   * equity_peak_cashflow — cumulative_cashflow AS OF that high, so we can count
--                            only the cash flow that happened SINCE the peak.
--   * cumulative_cashflow  — running net external cash flow (deposits +, withdraw −).
--   A new observation sets a new high when its flow-adjusted value
--   (ibkr_nlv − cumulative_cashflow) exceeds the stored peak's
--   (equity_peak − equity_peak_cashflow). Read-side drawdown re-bases the peak to
--   "now" by the flows since it was set:
--     peakAdjustedToNow = equity_peak + (cumulative_cashflow − equity_peak_cashflow)
--     drawdownPct       = (ibkr_nlv − peakAdjustedToNow) / peakAdjustedToNow
--   This is baseline-invariant (only flow SINCE the peak matters, so a historical
--   withdrawal that predates our first NLV observation never counts as drawdown),
--   and a deposit correctly RAISES the high-water mark rather than reading as a gain.
--   It is a first-order (additive) adjustment, not full time-weighted return — good
--   enough for an advisory de-risk trigger and consistent with the flag-only engine.
--   See packages/shared/src/utils/limits.ts `cashflowAdjustedDrawdownPct` (+ tests).
--
-- WHERE THE DATA COMES FROM (apps/web/netlify/_lib/flex-core.ts):
--   * ibkr_nlv           — every sync (EquitySummaryInBase). Drives the peak here.
--   * cumulative_cashflow — the one-time XML IMPORT only (ChangeInNAV
--     depositsWithdrawals over the full-history window = the authoritative net flow).
--     The daily "Last 7 Days" sync does NOT write it: a rolling window's period
--     aggregate can't be summed across overlapping runs without double-counting.
--     Limitation (documented, acceptable for the single-operator advisory use): a
--     NEW deposit/withdrawal made after the last import isn't flow-adjusted until the
--     user re-imports — the same "repair my history" path they already use.
--
-- "Render nothing until real data exists": a new row has null ibkr_nlv + null
-- equity_peak, so the trigger no-ops and the ladder stays silent (drawdownPct null)
-- rather than showing a phantom number — exactly the desired behavior.

begin;

alter table public.risk_config
  add column if not exists cumulative_cashflow    numeric,
  add column if not exists cumulative_cashflow_at  timestamptz,
  add column if not exists equity_peak_cashflow    numeric;

comment on column public.risk_config.cumulative_cashflow is
  'Running net external cash flow (deposits +, withdrawals −) from the IBKR Flex ChangeInNAV section, written by the one-time full-history XML import (ibkr-import.ts). Null until an import lands. Used to measure drawdown net of cash flows.';
comment on column public.risk_config.cumulative_cashflow_at is
  'When cumulative_cashflow was last written.';
comment on column public.risk_config.equity_peak_cashflow is
  'cumulative_cashflow as of when equity_peak was set — lets the read side count only the cash flow SINCE the peak (see fn_risk_config_track_equity_peak).';

-- Redefine equity_peak's meaning + comment: it is now the RAW ibkr_nlv at the
-- flow-adjusted high, driven by the broker's live equity, NOT the manual
-- account_equity placeholder.
comment on column public.risk_config.equity_peak is
  'RAW ibkr_nlv at the cash-flow-adjusted high-water mark (dollars), driven by the live broker equity — NOT account_equity. Paired with equity_peak_cashflow. Null until the first real NLV sync. See fn_risk_config_track_equity_peak.';

-- New peak maintenance: track the broker's live equity (ibkr_nlv), net of external
-- cash flows — no longer account_equity (which pinned the peak at $100k).
create or replace function public.fn_risk_config_track_equity_peak()
returns trigger language plpgsql as $$
declare
  new_adj  numeric;
  peak_adj numeric;
begin
  -- Only a real broker equity reading moves the peak. A row with no ibkr_nlv keeps a
  -- null peak → the ladder stays silent (no phantom drawdown from the placeholder).
  if new.ibkr_nlv is not null then
    new_adj := new.ibkr_nlv - coalesce(new.cumulative_cashflow, 0);
    if new.equity_peak is null then
      new.equity_peak          := new.ibkr_nlv;
      new.equity_peak_cashflow := coalesce(new.cumulative_cashflow, 0);
    else
      peak_adj := new.equity_peak - coalesce(new.equity_peak_cashflow, 0);
      -- New flow-adjusted high → ratchet the peak up and re-anchor its cash-flow context.
      if new_adj > peak_adj then
        new.equity_peak          := new.ibkr_nlv;
        new.equity_peak_cashflow := coalesce(new.cumulative_cashflow, 0);
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- The trigger definition itself is unchanged (still BEFORE INSERT OR UPDATE from 059),
-- so no drop/recreate of the trigger is needed — CREATE OR REPLACE FUNCTION above swaps
-- the body in place.

-- Clear every existing equity_peak: they were all seeded from the $100k account_equity
-- placeholder (059's old trigger + persistFlexResult's own max()), so every one is a
-- phantom. Setting them null fires the (now-rewritten) BEFORE-UPDATE trigger per row,
-- which immediately rebuilds a CORRECT peak for any row that already carries a real
-- ibkr_nlv, and leaves null (ladder silent) for rows that don't.
update public.risk_config set equity_peak = null, equity_peak_cashflow = null;

commit;
