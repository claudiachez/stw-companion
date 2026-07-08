# Schema Migration Plan — Multi-Leg Trade Tracking
**Prepared for:** Claude Code handoff  
**Project:** STW Companion (`usmqbohcjcyszjxxvnqu.supabase.co`)  
**Current migration count:** 021  
**Branch target:** `claude/schema-multi-leg` branched from `staging`

---

## Context

This plan implements structured per-leg position tracking to replace the current
denormalized `position_detail` text blob on `holdings`. It also adds multi-trader
infrastructure so the system can support additional traders beyond STW in the future.

The apps mostly read Supabase — the primary writers are external scheduled routines
(cowork cron tasks) that live outside this repo. Schema changes here are a contract
change that affects both sides. Migrations must be authored by Claude Code and applied
manually by the user via the Supabase SQL editor. **Never apply migrations directly.**

Read `CLAUDE.md` fully before starting. Key rules that apply here:
- `supabase/migrations/` is the single source of truth — number sequentially from 022
- All timestamps store UTC; display in ET via `fmtDateTime` from `@stw/shared`
- RLS: `holdings`/`signals` writes restricted to `cc@claudiachez.com`; new tables
  follow the same pattern unless noted otherwise
- Never push to `main` without explicit approval

---

## What this plan does NOT touch

- `tiers`, `profiles` — auth concern, unchanged
- `user_positions` — subscriber IBKR pipeline, unchanged structurally
  (joins to `legs` at query time, no schema change needed)
- App UI code — schema migrations only in this plan; UI is a separate workstream
- The external routines — they will need updating separately once migrations are live

---

## Migration sequence

Execute in strict order. Each migration is a discrete SQL file.
Never combine migrations — one concern per file.

---

### Migration 022 — Create `traders` table

**File:** `supabase/migrations/022_create_traders.sql`

```sql
create table public.traders (
  id               uuid        not null default gen_random_uuid(),
  name             text        not null,
  discord_user_id  text,
  created_at       timestamptz not null default now(),
  constraint traders_pkey primary key (id)
);

-- RLS: readable by all authenticated users; writable only by cc@claudiachez.com
alter table public.traders enable row level security;

create policy "traders_select" on public.traders
  for select to authenticated using (true);

create policy "traders_insert_admin" on public.traders
  for insert to authenticated
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

create policy "traders_update_admin" on public.traders
  for update to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
```

**After applying:** Seed the STW trader row manually:
```sql
insert into public.traders (id, name, discord_user_id)
values (
  'your-chosen-uuid-here',  -- fix this to a real uuid, note it down — used in later migrations
  'STW',
  null  -- add discord user ID if known
);
```
Note the inserted UUID — it is referenced as `:stw_trader_id` in subsequent migrations.

---

### Migration 023 — Create `channels` table

**File:** `supabase/migrations/023_create_channels.sql`

```sql
create table public.channels (
  id                  uuid        not null default gen_random_uuid(),
  trader_id           uuid        not null,
  discord_channel_id  text        not null,
  channel_name        text        not null,
  routine_type        text        not null,
  created_at          timestamptz not null default now(),
  constraint channels_pkey primary key (id),
  constraint channels_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint channels_routine_type_check check (
    routine_type in (
      'stw-morning-run',
      'stw-afternoon-run',
      'stw-friday-weighting',
      'stw-transcripts'
    )
  )
);

alter table public.channels enable row level security;

create policy "channels_select" on public.channels
  for select to authenticated using (true);

create policy "channels_write_admin" on public.channels
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
```

**After applying:** Seed all four existing Discord channels:
```sql
insert into public.channels (trader_id, discord_channel_id, channel_name, routine_type)
values
  (:stw_trader_id, '1229546005788098580', 'live-notes-portfolio',    'stw-morning-run'),
  (:stw_trader_id, '1229546005788098580', 'live-notes-portfolio',    'stw-afternoon-run'),
  (:stw_trader_id, '1503874839599911073', 'updates-portfolio',       'stw-friday-weighting'),
  (:stw_trader_id, '1441560421822627860', 'stream-library-stw',      'stw-transcripts');
```

---

### Migration 024 — Create `categories` table

**File:** `supabase/migrations/024_create_categories.sql`

```sql
create table public.categories (
  id          uuid        not null default gen_random_uuid(),
  trader_id   uuid        not null,
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  constraint categories_pkey primary key (id),
  constraint categories_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint categories_trader_name_unique unique (trader_id, name)
);

alter table public.categories enable row level security;

create policy "categories_select" on public.categories
  for select to authenticated using (true);

create policy "categories_write_admin" on public.categories
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
```

**After applying:** Seed current baskets from `holdings.basket` as categories:
```sql
insert into public.categories (trader_id, name)
select distinct :stw_trader_id, basket
from public.holdings
where basket is not null;
```

---

### Migration 025 — Add `trader_id` and `category_id` to `holdings`; change PK

**File:** `supabase/migrations/025_holdings_add_trader_category.sql`

This is the most structurally significant migration. Read carefully before applying.

```sql
-- Step 1: add columns as nullable first (existing rows have no trader yet)
alter table public.holdings
  add column trader_id   uuid,
  add column category_id uuid;

-- Step 2: backfill trader_id for all existing rows
update public.holdings
set trader_id = :stw_trader_id;

-- Step 3: backfill category_id from basket column using the seeded categories
update public.holdings h
set category_id = c.id
from public.categories c
where c.trader_id = :stw_trader_id
  and c.name = h.basket;

-- Step 4: now enforce not null on trader_id
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
    foreign key (trader_id) references public.traders(id);

alter table public.holdings
  add constraint holdings_category_id_fkey
    foreign key (category_id) references public.categories(id);

-- Step 7: update RLS to scope by trader
-- (existing policy allows cc@ to write; reads are public to authenticated users)
-- No change needed to policy logic — trader_id scoping is handled at query layer
```

**Do not drop `basket`, `position_detail`, `last_price`, `last_price_at`, `last_pnl_pct`,
`last_pnl_at`, `ibkr_legs`, `exit_price`, `exit_pnl_pct` yet.** These are deprecated but
kept until `legs` is live and backfilled. They will be dropped in migration 031.

---

### Migration 026 — Add `trader_id` to `holding_transactions` and `conviction_comments`

**File:** `supabase/migrations/026_add_trader_id_to_log_tables.sql`

```sql
-- holding_transactions
alter table public.holding_transactions
  add column trader_id uuid;

update public.holding_transactions
set trader_id = :stw_trader_id;

alter table public.holding_transactions
  alter column trader_id set not null;

alter table public.holding_transactions
  add constraint holding_transactions_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- conviction_comments
alter table public.conviction_comments
  add column trader_id uuid;

update public.conviction_comments
set trader_id = :stw_trader_id;

alter table public.conviction_comments
  alter column trader_id set not null;

alter table public.conviction_comments
  add constraint conviction_comments_trader_id_fkey
    foreign key (trader_id) references public.traders(id);
```

---

### Migration 027 — Update `run_log.channel` from text to FK

**File:** `supabase/migrations/027_run_log_channel_fk.sql`

```sql
-- Step 1: add new FK column alongside old text column
alter table public.run_log
  add column channel_id uuid;

-- Step 2: backfill by matching channel name to channels table
update public.run_log rl
set channel_id = c.id
from public.channels c
where c.channel_name = rl.channel;

-- Step 3: add FK constraint (nullable for now — old rows may not match)
alter table public.run_log
  add constraint run_log_channel_id_fkey
    foreign key (channel_id) references public.channels(id);

-- Step 4: drop old text column
-- Only do this after confirming channel_id is populated for recent rows
alter table public.run_log
  drop column channel;
```

**Verify before dropping:** `select count(*) from run_log where channel_id is null;`
If count > 0 on recent rows, investigate before dropping the old column.

---

### Migration 028 — Rename `graddox` to `signals`; add `trader_id`

**File:** `supabase/migrations/028_rename_graddox_to_signals.sql`

```sql
-- Rename table
alter table public.graddox rename to signals;

-- Add trader_id
alter table public.signals
  add column trader_id uuid;

-- Backfill — the singleton row (id=1) belongs to STW trader
update public.signals
set trader_id = :stw_trader_id;

alter table public.signals
  alter column trader_id set not null;

alter table public.signals
  add constraint signals_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- Rename the signals jsonb column to avoid collision with table name
alter table public.signals
  rename column signals to signals_data;

-- Drop singleton constraint (id=1 default)
-- The id column stays as integer PK for now; future migration can convert to uuid
-- For now just remove the default that forces id=1
alter table public.signals
  alter column id drop default;

-- Update RLS policies (Supabase auto-carries them on rename, but verify names)
-- Existing policies on graddox are now named on signals — check in dashboard
```

**Important:** All app code referencing `graddox` table must be updated to `signals`
and `graddox.signals` column reference updated to `signals.signals_data`.
Search the codebase: `grep -r "graddox" packages/ apps/`

Also update `CLAUDE.md` tables list: replace `graddox`/`graddox_levels` with `signals`.

---

### Migration 029 — Create `legs` table

**File:** `supabase/migrations/029_create_legs.sql`

```sql
create table public.legs (
  id                uuid        not null default gen_random_uuid(),
  ticker            text        not null,
  trader_id         uuid        not null,
  parent_leg_id     uuid,                    -- self-ref: populated when exercise spawns shares leg
  instrument_type   text        not null,
  option_strike     numeric,                 -- null for shares
  option_expiry     date,                    -- null for shares
  option_right      text,                    -- 'CALL' | 'PUT' | null for shares
  status            text        not null default 'OPEN',
  avg_cost_basis    numeric     not null default 0,
  current_size      integer     not null default 0,
  multiplier        integer     not null default 1,   -- 1 for shares, 100 for options
  mark_price        numeric,
  mark_price_source text,                    -- 'FINNHUB' | 'IBKR'
  mark_price_at     timestamptz,
  realized_pnl      numeric     not null default 0,
  unrealized_pnl    numeric     not null default 0,
  opened_at         timestamptz,
  closed_at         timestamptz,
  close_reason      text,
  constraint legs_pkey primary key (id),
  constraint legs_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint legs_parent_leg_id_fkey
    foreign key (parent_leg_id) references public.legs(id),
  constraint legs_instrument_type_check check (
    instrument_type in ('SHARES', 'OPTION')
  ),
  constraint legs_option_right_check check (
    option_right in ('CALL', 'PUT') or option_right is null
  ),
  constraint legs_status_check check (
    status in ('OPEN', 'CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED')
  ),
  constraint legs_mark_price_source_check check (
    mark_price_source in ('FINNHUB', 'IBKR') or mark_price_source is null
  ),
  constraint legs_close_reason_check check (
    close_reason in (
      'PROFIT_TARGET', 'STOP_HIT', 'THESIS_BROKEN', 'TRAIL_STOP',
      'EXPIRED_WORTHLESS', 'EXERCISED'
    ) or close_reason is null
  ),
  -- options must have strike, expiry, right; shares must not
  constraint legs_option_fields_check check (
    (instrument_type = 'OPTION' and option_strike is not null
      and option_expiry is not null and option_right is not null)
    or
    (instrument_type = 'SHARES' and option_strike is null
      and option_expiry is null and option_right is null)
  )
);

-- FK to holdings composite PK
alter table public.legs
  add constraint legs_holding_fkey
    foreign key (ticker, trader_id) references public.holdings(ticker, trader_id);

-- RLS: authenticated users can read; only routines (service key) write
alter table public.legs enable row level security;

create policy "legs_select" on public.legs
  for select to authenticated using (true);

create policy "legs_write_admin" on public.legs
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
```

---

### Migration 030 — Create `leg_transactions` table and trigger

**File:** `supabase/migrations/030_create_leg_transactions_and_trigger.sql`

```sql
-- Table
create table public.leg_transactions (
  id            uuid        not null default gen_random_uuid(),
  leg_id        uuid        not null,
  trader_id     uuid        not null,
  action_type   text        not null,
  quantity      integer     not null,
  price         numeric     not null,
  net_amount    numeric     not null,  -- negative for buys, positive for sells
  close_reason  text,                  -- populated on SELL and special close actions
  executed_at   timestamptz not null default now(),
  notes         text,
  constraint leg_transactions_pkey primary key (id),
  constraint leg_transactions_leg_id_fkey
    foreign key (leg_id) references public.legs(id),
  constraint leg_transactions_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint leg_transactions_action_type_check check (
    action_type in ('BUY', 'SELL', 'EXERCISED', 'EXPIRED')
  ),
  constraint leg_transactions_close_reason_check check (
    close_reason in (
      'PROFIT_TARGET', 'STOP_HIT', 'THESIS_BROKEN', 'TRAIL_STOP',
      'EXPIRED_WORTHLESS', 'EXERCISED',
      'PARTIAL_PROFIT', 'RISK_REDUCTION', 'REBALANCE'
    ) or close_reason is null
  )
);

alter table public.leg_transactions enable row level security;

create policy "leg_transactions_select" on public.leg_transactions
  for select to authenticated using (true);

create policy "leg_transactions_write_admin" on public.leg_transactions
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

-- ----------------------------------------------------------------
-- TRIGGER: trg_leg_transactions_sync
-- On every leg_transaction INSERT, recalculate all derived fields
-- on the parent legs row. The routine never writes these directly.
-- ----------------------------------------------------------------
create or replace function fn_sync_leg_from_transaction()
returns trigger language plpgsql as $$
declare
  v_total_cost    numeric;
  v_total_bought  integer;
  v_total_sold    integer;
  v_net_size      integer;
  v_realized      numeric;
  v_avg_cost      numeric;
  v_new_status    text;
begin
  -- Recalculate total bought (all BUY quantities for this leg)
  select
    coalesce(sum(case when action_type = 'BUY' then quantity else 0 end), 0),
    coalesce(sum(case when action_type = 'SELL' then quantity else 0 end), 0),
    coalesce(sum(case when action_type = 'BUY' then quantity * price else 0 end), 0)
  into v_total_bought, v_total_sold, v_total_cost
  from public.leg_transactions
  where leg_id = new.leg_id;

  v_net_size := v_total_bought - v_total_sold;

  -- Average cost basis: total cost of all buys / total bought quantity
  if v_total_bought > 0 then
    v_avg_cost := v_total_cost / v_total_bought;
  else
    v_avg_cost := 0;
  end if;

  -- Realized P&L: for each SELL, gain = (sell_price - avg_cost) * qty * multiplier
  select coalesce(sum(
    (lt.price - (
      select coalesce(sum(case when action_type = 'BUY' then quantity * price else 0 end), 0)
             / nullif(sum(case when action_type = 'BUY' then quantity else 0 end), 0)
      from public.leg_transactions lt2
      where lt2.leg_id = lt.leg_id
        and lt2.executed_at <= lt.executed_at
        and lt2.action_type = 'BUY'
    )) * lt.quantity * l.multiplier
  ), 0)
  into v_realized
  from public.leg_transactions lt
  join public.legs l on l.id = lt.leg_id
  where lt.leg_id = new.leg_id
    and lt.action_type = 'SELL';

  -- Determine new status
  if new.action_type = 'EXPIRED' then
    v_new_status := 'EXPIRED_WORTHLESS';
  elsif new.action_type = 'EXERCISED' then
    v_new_status := 'EXERCISED';
  elsif v_net_size <= 0 then
    v_new_status := 'CLOSED';
  else
    v_new_status := 'OPEN';
  end if;

  -- Update the legs row
  update public.legs set
    avg_cost_basis = v_avg_cost,
    current_size   = greatest(v_net_size, 0),
    realized_pnl   = v_realized,
    status         = v_new_status,
    -- Set opened_at on first transaction only
    opened_at      = case
                       when opened_at is null then new.executed_at
                       else opened_at
                     end,
    -- Set closed_at and close_reason when status flips to a closed state
    closed_at      = case
                       when v_new_status in ('CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED')
                       then new.executed_at
                       else closed_at
                     end,
    close_reason   = case
                       when v_new_status in ('CLOSED', 'EXPIRED_WORTHLESS', 'EXERCISED')
                         and new.close_reason is not null
                       then new.close_reason
                       else close_reason
                     end
  where id = new.leg_id;

  return new;
end;
$$;

create trigger trg_leg_transactions_sync
  after insert on public.leg_transactions
  for each row execute function fn_sync_leg_from_transaction();
```

---

### Migration 031 — Add trigger: `holding_transactions` → `holdings` sync

**File:** `supabase/migrations/031_holding_transactions_sync_trigger.sql`

This inverts the write direction for `last_action`, `action_date`, `current_weight`,
and `initial_weight`. After this trigger exists, the routines must stop writing
these four fields directly to `holdings`.

```sql
create or replace function fn_sync_holdings_from_transaction()
returns trigger language plpgsql as $$
begin
  update public.holdings set
    last_action    = new.action,
    action_date    = new.event_date,
    current_weight = new.weight,
    -- initial_weight: write-once — only set if currently null
    initial_weight = case
                       when initial_weight is null then new.weight
                       else initial_weight
                     end
  where ticker    = new.ticker
    and trader_id = new.trader_id;

  return new;
end;
$$;

create trigger trg_holding_transactions_sync
  after insert on public.holding_transactions
  for each row execute function fn_sync_holdings_from_transaction();
```

**Note on the existing trigger `stw_log_holding_transaction` (migration 016):**
That trigger fires on `holdings` UPDATE and writes TO `holding_transactions`. This new
trigger fires on `holding_transactions` INSERT and writes BACK to `holdings`. Together
they form a two-direction sync. There is no infinite loop risk because the new trigger
fires on `holding_transactions` and writes to `holdings` without touching
`holding_transactions` again, and the existing trigger fires on `holdings` but only
writes to `holding_transactions`. Verify this carefully before applying.

---

### Migration 032 — Create `spy_daily` table

**File:** `supabase/migrations/032_create_spy_daily.sql`

```sql
create table public.spy_daily (
  id               uuid        not null default gen_random_uuid(),
  price_date       date        not null,
  close_price      numeric     not null,
  daily_return_pct numeric,
  constraint spy_daily_pkey primary key (id),
  constraint spy_daily_price_date_unique unique (price_date)
);

alter table public.spy_daily enable row level security;

create policy "spy_daily_select" on public.spy_daily
  for select to authenticated using (true);

create policy "spy_daily_write_admin" on public.spy_daily
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');
```

**Population:** A lightweight daily cron (or manual upsert) after market close fetches
SPY close from Finnhub and upserts here. `daily_return_pct` is computed as
`(today_close - yesterday_close) / yesterday_close * 100`. This is the benchmark table
for trader performance comparison. Do not implement the population routine as part of
this migration scope — just create the table.

---

### Migration 033 — Drop deprecated columns from `holdings`

**File:** `supabase/migrations/033_holdings_drop_deprecated_columns.sql`

**Only apply after:**
- Migrations 029–031 are live
- `legs` has been backfilled from `holdings.position_detail` / `ibkr_legs`
- App code no longer reads the deprecated columns
- Admin IBKR proxy has been updated to write `legs.mark_price` instead of
  `holdings.last_pnl_pct` / `holdings.ibkr_legs`

```sql
alter table public.holdings
  drop column if exists position_detail,
  drop column if exists last_price,
  drop column if exists last_price_at,
  drop column if exists last_pnl_pct,
  drop column if exists last_pnl_at,
  drop column if exists ibkr_legs,
  drop column if exists exit_price,
  drop column if exists exit_pnl_pct,
  drop column if exists basket;
```

---

### Migration 034 — Drop deprecated columns from `holding_transactions`

**File:** `supabase/migrations/034_holding_transactions_drop_deprecated.sql`

**Only apply after:**
- `leg_transactions` is live and populated
- Routines have been updated to write `leg_transactions` instead
- App code no longer reads `position_detail`, `price`, `pnl_pct` from this table

```sql
alter table public.holding_transactions
  drop column if exists position_detail,
  drop column if exists price,
  drop column if exists pnl_pct,
  drop column if exists leg;
```

---

## Trigger inventory after all migrations

| Trigger name | Table | Direction | Purpose |
|---|---|---|---|
| `stw_log_holding_transaction` (existing, 016) | `holdings` → `holding_transactions` | holdings change → log row | Audit log of every holdings write |
| `trg_holding_transactions_sync` (new, 031) | `holding_transactions` → `holdings` | log row → holdings sync | Keeps `last_action`, `action_date`, `current_weight`, `initial_weight` current |
| `trg_leg_transactions_sync` (new, 030) | `leg_transactions` → `legs` | transaction → leg state | Maintains all derived fields on `legs` |

---

## Enum reference

### `channels.routine_type`
`stw-morning-run` · `stw-afternoon-run` · `stw-friday-weighting` · `stw-transcripts`

### `legs.instrument_type`
`SHARES` · `OPTION`

### `legs.option_right`
`CALL` · `PUT`

### `legs.status`
`OPEN` · `CLOSED` · `EXPIRED_WORTHLESS` · `EXERCISED`

### `legs.mark_price_source`
`FINNHUB` · `IBKR`

### `leg_transactions.action_type`
`BUY` · `SELL` · `EXERCISED` · `EXPIRED`

### `close_reason` (shared — used on both `legs` and `leg_transactions`)
**Full exit:** `PROFIT_TARGET` · `STOP_HIT` · `THESIS_BROKEN` · `TRAIL_STOP` · `EXPIRED_WORTHLESS` · `EXERCISED`  
**Trim only (leg_transactions only):** `PARTIAL_PROFIT` · `RISK_REDUCTION` · `REBALANCE`

### `holdings.last_action`
`New` · `Upsized` · `Trimmed` · `Hold` · `Closed`

### `holdings.status`
`ACTIVE` · `CLOSED` · `WATCHLIST`

### `conviction_comments.source`
`discord` · `streaming` · `user`

---

## Derived fields — never store, always compute

These are query-time calculations, not stored columns:

| Metric | Formula |
|---|---|
| `legs.unrealized_pnl` | `(mark_price - avg_cost_basis) × current_size × multiplier` |
| Ticker total realized P&L | `SUM(realized_pnl) GROUP BY ticker, trader_id` |
| Ticker total unrealized P&L | `SUM(unrealized_pnl) GROUP BY ticker, trader_id` |
| Win rate | `COUNT(legs WHERE realized_pnl > 0 AND status != 'OPEN') / COUNT(legs WHERE status != 'OPEN')` |
| SPY benchmark delta | Trader cumulative return vs `spy_daily` cumulative return from same start date |

---

## `position_detail` parsing — backfilling `legs`

The current canonical format stored in `holdings.position_detail` is:
```
Common @ $30.10 + $30C Jun '26 @ $1.50 + $30C Sep '26 @ $3.58 + $35C Sep '26 @ $2.74
```

Each `+`-separated segment is one leg. Parse rules:
- Segment contains no `C`/`P` after `$` → `SHARES`, price is the number after `@`
- Segment matches `$<strike>[C|P] <Mon> '<YY>` → `OPTION`, extract strike, right (C/P), expiry
- Price after final `@` is `avg_cost_basis`
- `current_size` and `multiplier` are not in this string — require manual entry or
  derive from `ibkr_legs` JSONB where available

**Note:** The `ibkr_legs` JSONB column on `holdings` contains structured option leg data
written by the admin IBKR proxy. Cross-reference it when backfilling `legs` for option
rows — it has `strike`, `expiry`, `put_call`, `quantity`, `avg_cost`, `mark_price`.

Do not auto-backfill legs in a migration. This is a manual data task that requires
review per ticker. Create a backfill script separately and run it with human oversight.

---

## App code changes required (separate workstream)

These are flagged here for awareness but are not part of the migration scope.

**`packages/shared`:**
- Add types: `Trader`, `Channel`, `Category`, `Leg`, `LegTransaction`
- Add P&L computation functions for legs (unrealized, realized, ticker rollup)
- Update `legPriceReason()` to reference `legs.mark_price_source` instead of
  `holdings.ibkr_legs` leg objects

**`packages/ui`:**
- Update all queries that read `holdings.position_detail`, `ibkr_legs`, `last_pnl_pct`,
  `last_price` to read from `legs` instead
- Add `useLegs(ticker, traderId)` hook
- Add `useLegTransactions(legId)` hook
- Update Portfolio Overview to aggregate P&L from `legs` grouped by ticker
- Update Ticker Detail to render individual leg cards from `legs` rows

**`apps/admin`:**
- Update `ibkr_proxy.py` to write `legs.mark_price` + `legs.mark_price_at` +
  `legs.mark_price_source = 'IBKR'` instead of `holdings.last_pnl_pct` / `ibkr_legs`

**`apps/web`:**
- No structural changes — reads through `@stw/ui` hooks

**External routines (outside this repo):**
- Stop writing `last_action`, `action_date`, `current_weight` directly to `holdings`
  (the new trigger handles this from `holding_transactions`)
- Start writing `legs` rows and `leg_transactions` rows for every position action
- Update `run_log` write to use `channel_id` uuid instead of `channel` text
- Update `graddox` table reference to `signals`; update `signals` column to `signals_data`

---

## CLAUDE.md updates required

After migrations are applied, update `CLAUDE.md`:

1. Migration count: 021 → 034
2. Tables list: add `traders`, `channels`, `categories`, `legs`, `leg_transactions`,
   `spy_daily`; replace `graddox`/`graddox_levels` with `signals`
3. Writers table: add `legs` and `leg_transactions` rows
4. Data sources section: note trigger direction inversion for `holding_transactions`

---

## Application order summary

| # | Migration | Blocker |
|---|---|---|
| 022 | Create `traders` | None — apply first |
| 023 | Create `channels` | Requires 022 |
| 024 | Create `categories` | Requires 022 |
| 025 | `holdings` PK + trader/category | Requires 022, 023, 024 + seeded data |
| 026 | `trader_id` on log tables | Requires 022, 025 |
| 027 | `run_log.channel` → FK | Requires 023 + channel rows seeded |
| 028 | Rename `graddox` → `signals` | Requires 022 + app code search done |
| 029 | Create `legs` | Requires 025 |
| 030 | Create `leg_transactions` + trigger | Requires 029 |
| 031 | `holding_transactions` sync trigger | Requires 026 — verify no loop |
| 032 | Create `spy_daily` | None — independent |
| 033 | Drop deprecated `holdings` columns | Requires backfill confirmed + app updated |
| 034 | Drop deprecated `holding_transactions` columns | Requires routines updated |

**Migrations 033 and 034 are the only ones with hard prerequisites in app code.
Do not apply them until the admin IBKR proxy and routines are updated.**
