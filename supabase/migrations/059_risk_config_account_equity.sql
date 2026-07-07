-- 059: risk_config account equity — fixes a real bug in the limits engine (host
-- review of PR #67, 2026-07-07): the gross-exposure check's caller-supplied
-- `accountEquity` was derived as the sum of market value across the SAME
-- positions being evaluated (packages/shared/src/utils/limits.ts's own header
-- comment anticipated this exact gap: "there is no equity/cash column on
-- user_positions to derive it from... lets the caller decide the baseline —
-- e.g. IBKR NetLiquidation, or a configured value"). That made
-- grossExposureViolation's exposurePct always ~100% regardless of real
-- leverage, and left the drawdown ladder permanently dead (drawdownPct was
-- hardcoded null with nothing to derive it from).
--
-- Fix: let the user enter their own account equity (e.g. from their broker's
-- Net Liquidation Value) directly in RiskConfigForm. `equity_peak` is a
-- trigger-maintained high-water mark (same "scoreboard is a pure
-- trigger-derived projection" pattern as legs/leg_transactions, NOT the
-- "fail loud, never silently coalesce" pattern migration 054 uses for the
-- closed-weight invariant — this is a genuinely derived value, not a
-- data-integrity gate) — it only ever increases when a fresh account_equity
-- value is saved, giving the caller a real denominator for gross exposure and
-- a real peak for drawdown-from-peak.
--
-- Both columns are nullable — a user who hasn't entered their equity yet
-- falls back to the old self-referential approximation in the caller, with a
-- UI hint that it's approximate (see LimitsPanel.tsx / ViolationsSummary.tsx).

begin;

alter table public.risk_config
  add column if not exists account_equity numeric,
  add column if not exists equity_peak    numeric;

comment on column public.risk_config.account_equity is
  'User-entered account Net Liquidation Value (or equivalent) — the real denominator for gross/position/sector exposure checks. Null until the user first enters it; callers fall back to an approximate self-referential sum until then.';
comment on column public.risk_config.equity_peak is
  'Trigger-maintained high-water mark of account_equity, used to compute drawdown-from-peak for the ladder. Never decreases — see fn_risk_config_track_equity_peak.';

create or replace function public.fn_risk_config_track_equity_peak()
returns trigger language plpgsql as $$
declare
  prior_peak numeric;
begin
  if new.account_equity is not null then
    prior_peak := case when tg_op = 'UPDATE' then old.equity_peak else null end;
    new.equity_peak := greatest(coalesce(prior_peak, 0), coalesce(new.equity_peak, 0), new.account_equity);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_risk_config_track_equity_peak on public.risk_config;
create trigger trg_risk_config_track_equity_peak
  before insert or update on public.risk_config
  for each row execute function public.fn_risk_config_track_equity_peak();

commit;
