-- 080: allow 'option' as a risk_violation_acks.violation_type.
--
-- Options-cap breaches (a single underlying's option premium over the per-stock
-- option ladder / options cap) were the one breach class the Risk tab couldn't
-- acknowledge — CapRow gave them ackType null because the table's CHECK only
-- permitted 'position' | 'sector' | 'gross'. This widens the CHECK so an
-- options-cap breach persists an acknowledgment / glide-path exactly like the
-- single-stock and sector caps. Purely additive; existing rows are unaffected.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.risk_violation_acks
  drop constraint if exists risk_violation_acks_violation_type_check;

alter table public.risk_violation_acks
  add constraint risk_violation_acks_violation_type_check
  check (violation_type in ('position', 'sector', 'gross', 'option'));

commit;
