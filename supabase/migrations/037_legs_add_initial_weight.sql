-- 037: add `legs.initial_weight` — per-leg entry weight, alongside `weight` (current).
--
-- WHY: a leg carried a single `weight` (its CURRENT % of portfolio). The admin needs both the
-- entry weight and the current weight per leg (e.g. IRDM `22.5C Jul17` entered at 1.5%, trimmed to
-- 3.4%) — mirroring `holdings.initial_weight`/`current_weight` at the leg grain. `weight` stays the
-- CURRENT weight; `initial_weight` is the entry weight (set on open, never auto-changed by trims).
--
-- Additive + safe alongside the pending 034/035 (which only DROP deprecated `holdings`/
-- `holding_transactions` columns — they don't touch `legs`).
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

alter table public.legs
  add column initial_weight numeric;

-- Backfill: seed initial_weight = current weight for existing legs (best available default — the
-- rebuild derived leg weights from the weekly snapshot). Refine per-leg in the admin editor where
-- the true entry weight differs (e.g. IRDM 1.5%).
update public.legs
set initial_weight = weight
where initial_weight is null;

commit;
