-- 028: rename `graddox` → `signals`; add `trader_id`; convert to per-day history.
--
-- ⚠️ BREAKING — do NOT apply to production individually. The routine writes to the
-- `graddox` table and `signals` column — both renamed here. Cut over in the coordinated
-- window only.
--
-- `signals` becomes a proper multi-row table: one row per trader per day, history
-- accumulating across days. The app always reads the latest row by `date` for a given
-- trader_id. The unique constraint on (trader_id, date) backs the routine's
-- on_conflict=trader_id,date upsert — the routine MUST always set `date` (a NULL date
-- never conflicts and would silently insert duplicate rows).
--
-- Requires 022 applied + app code searched for `graddox` references.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- Step 1: rename table
alter table public.graddox rename to signals;

-- Step 2: convert id from integer singleton to uuid
-- graddox_pkey confirmed as the constraint name in the live schema
alter table public.signals drop constraint graddox_pkey;
alter table public.signals drop column id;

alter table public.signals
  add column id uuid not null default gen_random_uuid();

alter table public.signals
  add constraint signals_pkey primary key (id);

-- Step 3: add trader_id
alter table public.signals
  add column trader_id uuid;

update public.signals
set trader_id = (select id from public.traders where name = 'Graddox');

alter table public.signals
  alter column trader_id set not null;

alter table public.signals
  add constraint signals_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- Step 4: add unique constraint backing the on_conflict upsert
-- Without this, the routine's on_conflict=trader_id,date fails hard
alter table public.signals
  add constraint signals_trader_date_unique unique (trader_id, date);

-- Step 5: rename signals jsonb column to avoid collision with table name
alter table public.signals
  rename column signals to signals_data;

commit;

-- ============================================================================
-- POST-APPLY — verify RLS policies survived the rename:
--   select policyname, cmd, qual from pg_policies where tablename = 'signals';
-- Confirm at minimum a SELECT policy for `authenticated` exists. If missing:
--   create policy "signals_select" on public.signals
--     for select to authenticated using (true);
--
-- Then search + update all app code referencing `graddox`:
--   grep -r "graddox" packages/ apps/
--   - Table:  graddox  → signals
--   - Column: .signals → .signals_data
--   - App read: single-row fetch → latest by date:
--       SELECT * FROM signals WHERE trader_id = :graddox_id ORDER BY date DESC LIMIT 1
-- Also update CLAUDE.md (graddox → signals; remove graddox_levels, never existed).
-- ============================================================================
