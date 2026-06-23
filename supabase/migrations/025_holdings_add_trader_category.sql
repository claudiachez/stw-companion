-- 025: add `trader_id` + `category_id` to `holdings`; change PK to (ticker, trader_id).
--
-- ⚠️ BREAKING — do NOT apply to production individually. Routines upsert via
-- `on_conflict=ticker`, which fails on the next cron run once the composite PK lands.
-- Cut over in the coordinated window only (see plan "Critical: cutover strategy").
--
-- `holdings.status` is NOT added — closed state continues to be inferred from
-- `last_action = 'Closed'`, the live behavior. No FK references holdings(ticker) in the
-- live schema, so dropping/recreating the PK is not blocked.
--
-- Requires 022–024 applied + traders/categories seeded.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- Step 1: add new columns as nullable
alter table public.holdings
  add column trader_id   uuid,
  add column category_id uuid;

-- Step 2: backfill trader_id for all existing rows
update public.holdings
set trader_id = (select id from public.traders where name = 'STW');

-- Step 3: backfill category_id from basket
update public.holdings h
set category_id = c.id
from public.categories c
where c.trader_id = (select id from public.traders where name = 'STW')
  and c.name = h.basket;

-- Step 4: enforce not null on trader_id
alter table public.holdings
  alter column trader_id set not null;

-- Step 5: drop old PK, add composite PK
alter table public.holdings
  drop constraint holdings_pkey;

alter table public.holdings
  add constraint holdings_pkey primary key (ticker, trader_id);

-- Step 6: add FK constraints
alter table public.holdings
  add constraint holdings_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  add constraint holdings_category_id_fkey
    foreign key (category_id) references public.categories(id);

commit;

-- ============================================================================
-- VERIFY before moving on — must return 0:
--   select count(*) from public.holdings where trader_id is null;
--
-- Do NOT drop `basket`, `position_detail`, `last_price`, `last_price_at`,
-- `last_pnl_pct`, `last_pnl_at`, `ibkr_legs`, `exit_price`, `exit_pnl_pct` yet —
-- those deprecated columns stay until migration 034.
-- ============================================================================
