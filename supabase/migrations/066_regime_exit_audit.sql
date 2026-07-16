-- 066: REGIME_EXIT change-audit trail — Week-2 Item 0b
-- (plans/20260709_integrity-guardrailsv2.md).
--
-- When REGIME_EXIT went per-user (migration 063), it dropped the original
-- operator-only governance ("version bump required, no change mid-drawdown").
-- The Settings field is now the exact mechanism by which a drawdown could
-- quietly edit the de-risk rule, and the operator has edit access today. This
-- restores the *intent* cheaply: every change to regime_trim_to_pct /
-- regime_stop_pct / regime_doublered_gross_pct writes an audit row (old values,
-- new values, timestamp, actor). No blocking, no approval flow — VISIBILITY
-- ONLY. Advisory / display-only, consistent with the whole regime surface.
--
-- Trigger-derived, same "the audit table is a pure projection of the write"
-- shape as the holding_transactions auto-log (migration 016). A row is written
-- only when at least one of the three tracked columns actually changes value.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

begin;

create table if not exists public.regime_exit_audit (
  id                             bigserial   primary key,
  user_id                        uuid        not null references auth.users(id) on delete cascade,
  changed_by                     uuid,       -- auth.uid() of the actor; null for service-role writes
  old_regime_trim_to_pct         numeric,
  new_regime_trim_to_pct         numeric,
  old_regime_stop_pct            numeric,
  new_regime_stop_pct            numeric,
  old_regime_doublered_gross_pct numeric,
  new_regime_doublered_gross_pct numeric,
  changed_at                     timestamptz not null default now()
);

comment on table public.regime_exit_audit is
  'Append-only audit trail of REGIME_EXIT rule changes on risk_config (Week-2 Item 0b). Visibility only — no blocking/approval. Restores the intent of the governance dropped when REGIME_EXIT went per-user (migration 063).';

alter table public.regime_exit_audit enable row level security;

-- Owner reads their own audit rows; the operator reads all (parity with ops_log).
drop policy if exists "own_regime_exit_audit_select" on public.regime_exit_audit;
create policy "own_regime_exit_audit_select" on public.regime_exit_audit
  for select to authenticated
  using (auth.uid() = user_id or auth.jwt() ->> 'email' = 'cc@claudiachez.com');

-- No INSERT policy: rows are written only by the SECURITY DEFINER trigger below,
-- never directly by a client. (The trigger bypasses RLS as definer.)

create or replace function public.fn_log_regime_exit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
       new.regime_trim_to_pct         is distinct from old.regime_trim_to_pct
    or new.regime_stop_pct            is distinct from old.regime_stop_pct
    or new.regime_doublered_gross_pct is distinct from old.regime_doublered_gross_pct
  ) then
    insert into public.regime_exit_audit (
      user_id, changed_by,
      old_regime_trim_to_pct,         new_regime_trim_to_pct,
      old_regime_stop_pct,            new_regime_stop_pct,
      old_regime_doublered_gross_pct, new_regime_doublered_gross_pct
    ) values (
      new.user_id, auth.uid(),
      old.regime_trim_to_pct,         new.regime_trim_to_pct,
      old.regime_stop_pct,            new.regime_stop_pct,
      old.regime_doublered_gross_pct, new.regime_doublered_gross_pct
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_regime_exit_change on public.risk_config;
create trigger trg_log_regime_exit_change
  after update on public.risk_config
  for each row execute function public.fn_log_regime_exit_change();

commit;
