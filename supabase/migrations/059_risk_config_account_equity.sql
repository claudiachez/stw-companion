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
-- account_equity defaults to a $100,000 placeholder (host decision,
-- 2026-07-07) rather than staying null — same "seed a placeholder, flag it,
-- let the user override" pattern as migration 055's threshold defaults
-- (is_placeholder=true). This applies to every new row (the DEFAULT below)
-- and is backfilled onto any row already missing it (the operator's own row,
-- seeded null-account_equity by this migration's own `add column` before this
-- edit). The old self-referential-sum fallback in the caller (LimitsPanel.tsx
-- / ViolationsSummary.tsx) still exists for defensive purposes but should
-- never actually trigger now that every row gets a real number.

begin;

alter table public.risk_config
  add column if not exists account_equity numeric not null default 100000,
  add column if not exists equity_peak    numeric;

update public.risk_config set account_equity = 100000 where account_equity is null;

comment on column public.risk_config.account_equity is
  'Account Net Liquidation Value (or equivalent) — the real denominator for gross/position/sector exposure checks. Defaults to a $100,000 placeholder (is_placeholder=true) until the user enters their real figure.';
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
