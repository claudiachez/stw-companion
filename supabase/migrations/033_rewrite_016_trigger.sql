-- 033: rewrite the `stw_log_holding_transaction` trigger (originally migration 016).
--
-- ⚠️ MUST be applied before 034 and 035.
--
-- WHY: the existing 016 trigger reads NEW.position_detail / NEW.last_price /
-- NEW.exit_pnl_pct from holdings and inserts position_detail / price / pnl_pct / leg into
-- holding_transactions. All of those columns are dropped in 034/035. Without this rewrite,
-- every holdings write after 034 throws "column does not exist", bricking the admin edit
-- form and all routines.
--
-- The rewritten trigger narrows holding_transactions to its correct responsibility:
-- weight + action audit log only. `direction` is nullable (confirmed live) so it is safely
-- omitted; `leg` is NOT NULL DEFAULT 1 so the default applies until 035 drops the column.
--
-- The dedupe guard on (ticker, trader_id, action, event_date) is what breaks the 031 ↔ 033
-- re-entrant loop (see migration 031).
--
-- Requires 026 applied.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create or replace function stw_log_holding_transaction()
returns trigger language plpgsql as $$
declare
  v_action text;
begin
  v_action := new.last_action;

  if v_action = 'Hold' or v_action is null then
    return new;
  end if;

  if exists (
    select 1 from public.holding_transactions
    where ticker     = new.ticker
      and trader_id  = new.trader_id
      and action     = v_action
      and event_date = coalesce(new.action_date, current_date)
  ) then
    return new;
  end if;

  insert into public.holding_transactions (
    ticker,
    trader_id,
    action,
    event_date,
    weight,
    notes,
    created_at
  ) values (
    new.ticker,
    new.trader_id,
    v_action,
    coalesce(new.action_date, current_date),
    new.current_weight,
    null,
    now()
  );

  return new;
end;
$$;

commit;
