-- 039: add `legs.weight_overridden` — sticky flag for a manually-set per-leg weight.
--
-- WHY: per-leg weight is normally DERIVED from the position (holding) weight via the 90/10 rule
-- (mixed = 90% shares / 10% across options; options-only = even; shares-only = 100%). When an admin
-- overrides a specific leg's weight by hand, that leg must be **pinned**: the 90/10 redistribution
-- (and the next portfolio routine run) skip it and split the remaining position weight across the
-- other, non-overridden legs. Without the flag, the next weekly run would clobber the manual edit.
--
-- Additive + safe alongside the pending 034/035 (which only drop deprecated holdings/
-- holding_transactions columns — they don't touch `legs`).
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.legs
  add column weight_overridden boolean not null default false;

commit;
