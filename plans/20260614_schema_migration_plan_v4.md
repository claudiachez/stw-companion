# Schema Migration Plan v4 — Multi-Leg Trade Tracking
**Prepared for:** Claude Code handoff  
**Project:** STW Companion (`usmqbohcjcyszjxxvnqu.supabase.co`)  
**Current migration count:** 021  
**Branch target:** `claude/schema-multi-leg` branched from `staging`  
**Revision history:**  
- v1: initial plan  
- v2: addressed all 11 flags from live schema/data review  
- v3: addressed 2 new issues introduced by v2; signals as per-day history; holdings.status dropped; numbering cleaned up  
- v4: fixed 3 issues from the v3 review — (1) 031 weight-only carve-out so Friday weighting no longer clobbers `last_action`/`action_date`; (2) `trader_id` now required on all client-side inserts post-026; (3) 030 realized P&L restored to point-in-time average cost (correct under upsizing)

---

## Overview

This plan implements three workstreams in order:

1. **Database migrations (022–035)** — multi-trader infrastructure, structured per-leg position tracking replacing the `position_detail` text blob, conviction note cleanup, and benchmark table
2. **Routine updates (two phases)** — cutover-safe changes to all five skills
3. **UI restructure** — Ticker Detail conviction section unified into one chronological feed

---

## Critical: cutover strategy

**Do not apply migrations 025, 027, 028, or 031 to production individually.**
These four migrations break live writers or readers the moment they land:

| Migration | What breaks immediately |
|---|---|
| 025 | Routines upsert via `on_conflict=ticker` → fails on next cron run |
| 027 | Routine `run_log` write references dropped `channel` text column |
| 028 | Routine writes to `graddox` table and `signals` column → both renamed |
| 031 | Routines must simultaneously stop writing `last_action`/`action_date`/`current_weight` directly |

**Required approach — Supabase preview branch:**

1. Create a Supabase preview branch from production
2. Apply all migrations 022–035 on the preview branch
3. Update app code, admin proxy, and all routines — test against the preview branch
4. Pause the scheduled routines (cron tasks — a missed run is recoverable)
5. Cut over in a single coordinated window:
   - Merge the preview branch to production
   - Deploy updated app and admin proxy
   - Deploy Phase 1 routine updates
   - Resume routines
6. Verify all writes succeed on the first post-cutover cron run
7. Phase 2 routine updates and migrations 034–035 follow separately after `legs` backfill is confirmed

---

## What this plan does NOT touch

- `tiers`, `profiles` — auth concern, unchanged
- `user_positions` — subscriber IBKR pipeline, unchanged structurally (joins to `legs` at query time)
- The methodology analysis `.md` output from `stw-transcripts` — local file, unaffected

---

## Enum reference

All check constraints use these exact values. Do not deviate.

**`channels.routine_type`** — removed from `channels` (see migration 023)

**`legs.instrument_type`**  
`SHARES` · `OPTION`

**`legs.option_right`**  
`CALL` · `PUT`

**`legs.status`**  
`OPEN` · `CLOSED` · `EXPIRED_WORTHLESS` · `EXERCISED`

**`legs.mark_price_source`**  
`FINNHUB` · `IBKR`

**`leg_transactions.action_type`**  
`BUY` · `SELL` · `EXERCISED` · `EXPIRED`

**`close_reason`** (shared — used on both `legs` and `leg_transactions`)  
Full exit: `PROFIT_TARGET` · `STOP_HIT` · `THESIS_BROKEN` · `TRAIL_STOP` · `EXPIRED_WORTHLESS` · `EXERCISED`  
Trim only (on `leg_transactions` only): `PARTIAL_PROFIT` · `RISK_REDUCTION` · `REBALANCE`

**`holdings.last_action`**  
`New` · `Upsized` · `Trimmed` · `Hold` · `Closed`

**`conviction_comments.source`**  
`discord` · `streaming` · `manual`

**Note on `holdings.status`:** this column does not exist and is not being added.
Closed state is inferred from `last_action = 'Closed'` — this is the live behavior
and remains unchanged.

**Note on `'Hold'` as a weight-only signal:** a `holding_transactions` row with
`action = 'Hold'` means "weight changed, the underlying action did not" (the Friday
weighting run, or an intra-week weight nudge). Trigger 031 treats it specially — it
updates `current_weight` but leaves `last_action`/`action_date` intact. See migration 031.

---

## Derived fields — never store, always compute

| Metric | Formula |
|---|---|
| `legs.unrealized_pnl` | `(mark_price − avg_cost_basis) × current_size × multiplier` — compute in view or `@stw/shared`, never stored |
| Ticker total realized P&L | `SUM(realized_pnl) GROUP BY ticker, trader_id` |
| Ticker total unrealized P&L | Compute per leg, sum at query time |
| Win rate | `COUNT(legs WHERE realized_pnl > 0 AND status != 'OPEN') / COUNT(legs WHERE status != 'OPEN')` |
| SPY benchmark delta | Trader cumulative return vs `spy_daily` cumulative return from same start date |

---

## Trigger inventory (final state after all migrations)

| Trigger | Table | Direction | Purpose |
|---|---|---|---|
| `stw_log_holding_transaction` (existing 016, rewritten in 033) | `holdings` → `holding_transactions` | holdings change → log row | Audit log of every holdings write |
| `trg_holding_transactions_sync` (new — 031) | `holding_transactions` → `holdings` | log row → holdings sync | Derives `last_action`, `action_date`, `current_weight`, `initial_weight` |
| `trg_leg_transactions_sync` (new — 030) | `leg_transactions` → `legs` | transaction → leg state | Maintains all derived fields on `legs` |

**Loop safety — 031 and 016 interact. Read carefully before applying to production.**  
031 fires on `holding_transactions` INSERT and updates `holdings`. That `holdings` UPDATE
re-fires 016, which inserts back into `holding_transactions`. What prevents runaway:
- 016's dedupe guard on `(ticker, trader_id, action, event_date)` blocks the re-entrant insert
- 031's `pg_trigger_depth() > 1` guard blocks it from firing on re-entrant calls
- 031's `DISTINCT FROM` guards prevent no-op `holdings` updates from re-firing 016 at all

Verify this behavior on the preview branch before production. Test: insert a
`holding_transactions` row, confirm `holdings` updates exactly once, confirm no
duplicate `holding_transactions` rows are created. **Also test the weight-only path:**
insert a `holding_transactions` row with `action='Hold'` for a ticker whose last real
action was `'Upsized'`; confirm `current_weight` updates but `last_action`/`action_date`
are unchanged.

---

## Migration sequence

One concern per file. Apply in strict order on the preview branch first.

**Before running any migration:** apply 022 first, insert both trader rows using
`RETURNING id` to capture the UUIDs. Every subsequent migration resolves trader IDs
at runtime via:
```sql
(select id from public.traders where name = 'STW')
(select id from public.traders where name = 'Graddox')
```
Do not use psql variable binding — the Supabase SQL editor does not support it.

---

### Migration 022 — Create `traders` table

**File:** `supabase/migrations/022_create_traders.sql`

```sql
begin;

create table public.traders (
  id               uuid        not null default gen_random_uuid(),
  name             text        not null,
  discord_user_id  text,
  created_at       timestamptz not null default now(),
  constraint traders_pkey primary key (id)
);

alter table public.traders enable row level security;

create policy "traders_select" on public.traders
  for select to authenticated using (true);

create policy "traders_write_admin" on public.traders
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
```

**After applying — seed both traders and record the returned UUIDs:**
```sql
insert into public.traders (name, discord_user_id)
values ('STW', null)
returning id;

insert into public.traders (name, discord_user_id)
values ('Graddox', null)
returning id;
```
Record both UUIDs. Every subsequent migration resolves them via the subquery form above.

---

### Migration 023 — Create `channels` table

**File:** `supabase/migrations/023_create_channels.sql`

`routine_type` is not a column on `channels`. A Discord channel is a channel — one row
per Discord channel ID. The morning and afternoon routines both read `live-notes-portfolio`;
that is one channel, two routines. The routine identity already lives in `run_log.run_type`.
Making it part of channel identity caused a non-deterministic backfill in v1.

```sql
begin;

create table public.channels (
  id                  uuid        not null default gen_random_uuid(),
  trader_id           uuid        not null,
  discord_channel_id  text        not null,
  channel_name        text        not null,
  created_at          timestamptz not null default now(),
  constraint channels_pkey primary key (id),
  constraint channels_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint channels_discord_id_unique unique (discord_channel_id)
);

alter table public.channels enable row level security;

create policy "channels_select" on public.channels
  for select to authenticated using (true);

create policy "channels_write_admin" on public.channels
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
```

**After applying — seed all four channels:**
```sql
insert into public.channels (trader_id, discord_channel_id, channel_name)
values
  ((select id from public.traders where name = 'Graddox'),
   '1149448308293632110', 'graddox'),
  ((select id from public.traders where name = 'STW'),
   '1229546005788098580', 'live-notes-portfolio'),
  ((select id from public.traders where name = 'STW'),
   '1503874839599911073', 'updates-portfolio'),
  ((select id from public.traders where name = 'STW'),
   '1441560421822627860', 'stream-library-stw');
```

---

### Migration 024 — Create `categories` table

**File:** `supabase/migrations/024_create_categories.sql`

```sql
begin;

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
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
```

**After applying — seed from existing `holdings.basket` values:**
```sql
insert into public.categories (trader_id, name)
select distinct
  (select id from public.traders where name = 'STW'),
  basket
from public.holdings
where basket is not null
on conflict do nothing;
```

---

### Migration 025 — Add `trader_id` and `category_id` to `holdings`; change PK

**File:** `supabase/migrations/025_holdings_add_trader_category.sql`

Fully wrapped in a transaction. `holdings.status` is NOT added — closed state continues
to be inferred from `last_action = 'Closed'`, which is the live behavior today.

Verified safe: no FK references `holdings(ticker)` in the live schema — dropping and
recreating the PK will not be blocked.

```sql
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
```

**Verify before moving on:**
```sql
select count(*) from public.holdings where trader_id is null;
-- must return 0
```

**Do not drop `basket`, `position_detail`, `last_price`, `last_price_at`, `last_pnl_pct`,
`last_pnl_at`, `ibkr_legs`, `exit_price`, `exit_pnl_pct` yet.**
These deprecated columns stay until migration 034.

---

### Migration 026 — Add `trader_id` to `holding_transactions` and `conviction_comments`; fix source enum

**File:** `supabase/migrations/026_add_trader_id_to_log_tables.sql`

Note: `direction` lives on `holding_transactions` today and moves to `legs` in 029.
It is not added here — 026 only adds `trader_id` to both log tables and corrects
the `conviction_comments.source` check constraint.

**⚠️ App-code consequence:** after this migration, `trader_id` is `NOT NULL` on both
`holding_transactions` and `conviction_comments`. **Every client-side insert into these
tables must include `trader_id`** — specifically the admin "+ Add Event" form
(`holding_transactions`) and the "+ Add Note" form (`conviction_comments`). These inserts
ship as part of the Phase 1 app deploy at cutover. See Workstream 3.

```sql
begin;

-- holding_transactions: add trader_id
alter table public.holding_transactions
  add column trader_id uuid;

update public.holding_transactions
set trader_id = (select id from public.traders where name = 'STW');

alter table public.holding_transactions
  alter column trader_id set not null;

alter table public.holding_transactions
  add constraint holding_transactions_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- conviction_comments: add trader_id
alter table public.conviction_comments
  add column trader_id uuid;

update public.conviction_comments
set trader_id = (select id from public.traders where name = 'STW');

alter table public.conviction_comments
  alter column trader_id set not null;

alter table public.conviction_comments
  add constraint conviction_comments_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- Fix conviction_comments.source constraint
-- Live constraint allows: discord, streaming, manual
-- v1 plan incorrectly listed 'user' — corrected here
alter table public.conviction_comments
  drop constraint if exists conviction_comments_source_check;

alter table public.conviction_comments
  add constraint conviction_comments_source_check
    check (source in ('discord', 'streaming', 'manual'));

commit;
```

---

### Migration 027 — Promote `run_log.channel` to FK

**File:** `supabase/migrations/027_run_log_channel_fk.sql`

Backfill uses `discord_channel_id` matching, not channel name, to avoid ambiguity.
`live-notes-portfolio` maps to exactly one `channels` row (morning and afternoon runs
both read the same channel — the routine identity lives in `run_log.run_type`).

```sql
begin;

-- Step 1: add new FK column alongside old text column
alter table public.run_log
  add column channel_id uuid;

-- Step 2: deterministic backfill using discord_channel_id
update public.run_log rl
set channel_id = c.id
from public.channels c
where c.discord_channel_id = case rl.channel
  when 'live-notes-portfolio' then '1229546005788098580'
  when 'updates-portfolio'    then '1503874839599911073'
  when 'stream-library-stw'  then '1441560421822627860'
  when 'graddox'         then '1149448308293632110'
  else null
end;

-- Step 3: add FK constraint (nullable — old unmatched rows stay null, not an error)
alter table public.run_log
  add constraint run_log_channel_id_fkey
    foreign key (channel_id) references public.channels(id);

-- Step 4: manual verification — run this before Step 5
-- select count(*) from run_log
-- where channel_id is null and ran_at > now() - interval '90 days';
-- Must return 0 before dropping the old column.

-- Step 5: drop old text column
alter table public.run_log
  drop column channel;

commit;
```

---

### Migration 028 — Rename `graddox` → `signals`; add `trader_id`; convert to per-day history

**File:** `supabase/migrations/028_rename_graddox_to_signals.sql`

`signals` becomes a proper multi-row table: one row per trader per day. History
accumulates across days. The app always reads the latest row by `date` for a given
`trader_id` — a one-line query change but explicitly in scope here.

The unique constraint on `(trader_id, date)` is what the routine's
`on_conflict=trader_id,date` upsert targets. Without it PostgREST rejects the call.
**The routine must always set `date`** — a NULL `date` never conflicts and would silently
insert duplicate rows.

```sql
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
```

**After applying — verify RLS policies survived the rename:**
```sql
select policyname, cmd, qual
from pg_policies
where tablename = 'signals';
```
Confirm at minimum a SELECT policy for `authenticated` exists. If missing, add:
```sql
create policy "signals_select" on public.signals
  for select to authenticated using (true);
```

**After applying — search and update all app code referencing `graddox`:**
```bash
grep -r "graddox" packages/ apps/
```
All references must be updated:
- Table: `graddox` → `signals`
- Column: `.signals` → `.signals_data`
- App signals read: change from single-row fetch to
  `SELECT * FROM signals WHERE trader_id = :graddox_id ORDER BY date DESC LIMIT 1`

**Update CLAUDE.md:** replace `graddox` with `signals` in the tables list.
Remove any mention of `graddox_levels` — this table does not exist in the live schema.

---

### Migration 029 — Create `legs` table

**File:** `supabase/migrations/029_create_legs.sql`

`unrealized_pnl` is NOT a stored column — it is always computed at query time:
`(mark_price - avg_cost_basis) × current_size × multiplier`.
Add it to a Supabase view or compute in `@stw/shared`. Storing it would produce a
guaranteed-stale value between price updates.

`direction` (`long`/`short`) moves here from `holding_transactions`.

```sql
begin;

create table public.legs (
  id                uuid        not null default gen_random_uuid(),
  ticker            text        not null,
  trader_id         uuid        not null,
  parent_leg_id     uuid,
  instrument_type   text        not null,
  option_strike     numeric,
  option_expiry     date,
  option_right      text,
  direction         text        not null default 'long',
  status            text        not null default 'OPEN',
  avg_cost_basis    numeric     not null default 0,
  current_size      integer     not null default 0,
  multiplier        integer     not null default 1,
  mark_price        numeric,
  mark_price_source text,
  mark_price_at     timestamptz,
  realized_pnl      numeric     not null default 0,
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
  constraint legs_direction_check check (
    direction in ('long', 'short')
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
  constraint legs_option_fields_check check (
    (instrument_type = 'OPTION'
      and option_strike is not null
      and option_expiry is not null
      and option_right is not null)
    or
    (instrument_type = 'SHARES'
      and option_strike is null
      and option_expiry is null
      and option_right is null)
  )
);

-- FK to holdings composite PK
alter table public.legs
  add constraint legs_holding_fkey
    foreign key (ticker, trader_id) references public.holdings(ticker, trader_id);

alter table public.legs enable row level security;

create policy "legs_select" on public.legs
  for select to authenticated using (true);

create policy "legs_write_admin" on public.legs
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
```

---

### Migration 030 — Create `leg_transactions` table and trigger

**File:** `supabase/migrations/030_create_leg_transactions_and_trigger.sql`

The trigger handles all leg state derivation. The routine never writes
`avg_cost_basis`, `current_size`, `realized_pnl`, `status`, `close_reason`,
`opened_at`, or `closed_at` directly to `legs` — it only inserts `leg_transaction` rows.

**Realized P&L uses point-in-time average cost (AVCO).** Each SELL realizes
`(sell_price − avg_cost_of_buys_up_to_that_sell) × qty × multiplier`. This is correct
even when a leg is **added to after a partial sell** (STW upsizes positions), unlike a
single final-average computation. The correlated subquery is O(n²) in transactions per
leg, which is irrelevant at this data scale.

**Expiration:** `EXPIRED_WORTHLESS` crystallizes the loss on whatever is still held —
prior partial sells keep their realized P&L, and the remaining unsold contracts lose
their full premium: `realized = realized_from_sells − (avg_cost_basis × remaining_size × multiplier)`.
Size hits 0.

**Exercise:** the option leg closes carrying only its already-realized P&L from any
prior sells; the exercised remainder transfers cost basis to the spawned shares leg
(no P&L booked on the option leg). Size hits 0. The routine is responsible for opening
the new shares leg with cost basis = `strike + premium_paid`.

```sql
begin;

create table public.leg_transactions (
  id            uuid        not null default gen_random_uuid(),
  leg_id        uuid        not null,
  trader_id     uuid        not null,
  action_type   text        not null,
  quantity      integer     not null,
  price         numeric     not null,
  net_amount    numeric     not null,
  close_reason  text,
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
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

create or replace function fn_sync_leg_from_transaction()
returns trigger language plpgsql as $$
declare
  v_total_cost     numeric;
  v_total_bought   integer;
  v_total_sold     integer;
  v_net_size       integer;
  v_realized_sells numeric;
  v_realized       numeric;
  v_avg_cost       numeric;
  v_new_status     text;
  v_multiplier     integer;
begin
  select multiplier into v_multiplier
  from public.legs where id = new.leg_id;

  select
    coalesce(sum(case when action_type = 'BUY'  then quantity else 0 end), 0),
    coalesce(sum(case when action_type = 'SELL' then quantity else 0 end), 0),
    coalesce(sum(case when action_type = 'BUY'  then quantity * price else 0 end), 0)
  into v_total_bought, v_total_sold, v_total_cost
  from public.leg_transactions
  where leg_id = new.leg_id;

  v_net_size := greatest(v_total_bought - v_total_sold, 0);

  -- Final average cost (used for unsold-basis valuation on expiry, and stored as the
  -- leg's avg_cost_basis for unrealized P&L display).
  if v_total_bought > 0 then
    v_avg_cost := v_total_cost / v_total_bought;
  else
    v_avg_cost := 0;
  end if;

  -- Realized P&L from SELLs, point-in-time: each SELL valued against the average cost
  -- of all BUYs that occurred at or before that SELL. Correct under upsizing.
  select coalesce(sum(
    (lt.price - (
       select sum(b.quantity * b.price)::numeric / nullif(sum(b.quantity), 0)
       from public.leg_transactions b
       where b.leg_id = lt.leg_id
         and b.action_type = 'BUY'
         and b.executed_at <= lt.executed_at
    )) * lt.quantity * v_multiplier
  ), 0)
  into v_realized_sells
  from public.leg_transactions lt
  where lt.leg_id = new.leg_id
    and lt.action_type = 'SELL';

  if new.action_type = 'EXPIRED' then
    -- Prior sells keep their realized P&L; remaining unsold contracts lose full premium.
    v_realized   := v_realized_sells - (v_avg_cost * v_net_size * v_multiplier);
    v_net_size   := 0;
    v_new_status := 'EXPIRED_WORTHLESS';

  elsif new.action_type = 'EXERCISED' then
    -- Only prior-sell P&L is booked here; remaining basis transfers to the shares leg.
    v_realized   := v_realized_sells;
    v_net_size   := 0;
    v_new_status := 'EXERCISED';

  elsif v_net_size = 0 then
    v_realized   := v_realized_sells;
    v_new_status := 'CLOSED';

  else
    v_realized   := v_realized_sells;
    v_new_status := 'OPEN';
  end if;

  update public.legs set
    avg_cost_basis = v_avg_cost,
    current_size   = v_net_size,
    realized_pnl   = v_realized,
    status         = v_new_status,
    opened_at      = case
                       when opened_at is null then new.executed_at
                       else opened_at
                     end,
    closed_at      = case
                       when v_new_status in ('CLOSED','EXPIRED_WORTHLESS','EXERCISED')
                       then new.executed_at
                       else closed_at
                     end,
    close_reason   = case
                       when v_new_status in ('CLOSED','EXPIRED_WORTHLESS','EXERCISED')
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

commit;
```

---

### Migration 031 — Add trigger: `holding_transactions` → `holdings` sync

**File:** `supabase/migrations/031_holding_transactions_sync_trigger.sql`

After this trigger is live, routines must stop writing `last_action`, `action_date`,
`current_weight`, and `initial_weight` directly to `holdings`. Write a
`holding_transactions` row instead — the trigger propagates upward.

**Weight-only carve-out:** a row with `action = 'Hold'` means "weight changed, action did
not" (the Friday weighting run, intra-week weight nudges). For these, the trigger updates
`current_weight` (and write-once `initial_weight`) but **leaves `last_action`/`action_date`
intact** — otherwise a Friday weight refresh would overwrite a real `Upsized`/`Trimmed`
action with `Hold` and reset its date. This matches the live 016 behavior, which
deliberately ignored weight-only Friday runs.

`initial_weight` is write-once: the trigger sets it only when currently null.

```sql
begin;

create or replace function fn_sync_holdings_from_transaction()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.holdings set
    -- Weight-only ('Hold') rows must not clobber the real last action / date
    last_action    = case when new.action = 'Hold' then last_action else new.action     end,
    action_date    = case when new.action = 'Hold' then action_date else new.event_date end,
    current_weight = new.weight,
    initial_weight = case
                       when initial_weight is null then new.weight
                       else initial_weight
                     end
  where ticker    = new.ticker
    and trader_id = new.trader_id
    and (
      -- include weight so a 'Hold' weight-only change is not skipped by the guard
      current_weight is distinct from new.weight  or
      (new.action <> 'Hold' and (
        last_action is distinct from new.action     or
        action_date is distinct from new.event_date
      ))
    );

  return new;
end;
$$;

create trigger trg_holding_transactions_sync
  after insert on public.holding_transactions
  for each row execute function fn_sync_holdings_from_transaction();

commit;
```

**Verify on the preview branch before production:**
1. Insert a real-action row (`action='Upsized'`) → `holdings` updates `last_action`,
   `action_date`, `current_weight` exactly once; no duplicate `holding_transactions` row.
2. Insert a weight-only row (`action='Hold'`) for a ticker last `Upsized` → `current_weight`
   updates, `last_action`/`action_date` unchanged.

---

### Migration 032 — Create `spy_daily` table

**File:** `supabase/migrations/032_create_spy_daily.sql`

```sql
begin;

create table public.spy_daily (
  id               uuid    not null default gen_random_uuid(),
  price_date       date    not null,
  close_price      numeric not null,
  daily_return_pct numeric,
  constraint spy_daily_pkey primary key (id),
  constraint spy_daily_price_date_unique unique (price_date)
);

alter table public.spy_daily enable row level security;

create policy "spy_daily_select" on public.spy_daily
  for select to authenticated using (true);

create policy "spy_daily_write_admin" on public.spy_daily
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
```

Population: a lightweight daily cron after market close fetches SPY close from Finnhub
and upserts here. `daily_return_pct = (today_close − yesterday_close) / yesterday_close × 100`.
Implement the population routine separately — just create the table in this scope.

---

### Migration 033 — Rewrite `stw_log_holding_transaction` trigger (016)

**File:** `supabase/migrations/033_rewrite_016_trigger.sql`

**This migration must be applied before 034 and 035.**

The existing 016 trigger reads `NEW.position_detail`, `NEW.last_price`,
`NEW.exit_pnl_pct` from `holdings` and inserts `position_detail`, `price`,
`pnl_pct`, `leg` into `holding_transactions`. All of these columns are dropped in
034/035. Without this rewrite, every `holdings` write after 034 throws
`column does not exist`, bricking the admin edit form and all routines.

The rewritten trigger narrows `holding_transactions` to its correct responsibility:
weight and action audit log only. `direction` is nullable (confirmed on live schema)
so it is safely omitted; `leg` is `NOT NULL DEFAULT 1` so the default applies until
035 drops the column.

```sql
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
```

---

### Migration 034 — Drop deprecated columns from `holdings`

**File:** `supabase/migrations/034_holdings_drop_deprecated_columns.sql`

**Hard prerequisites before applying:**
- Migration 033 is live and verified
- `legs` table has been backfilled (see backfill section below)
- App code no longer reads any deprecated columns
- Admin IBKR proxy updated to write `legs.mark_price` instead of `holdings` columns
- **Take a fresh database dump immediately before applying**

Verified safe: no view or materialized view depends on any of these columns in the live
schema — the drops will not be blocked.

```sql
begin;

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

commit;
```

---

### Migration 035 — Drop deprecated columns from `holding_transactions`

**File:** `supabase/migrations/035_holding_transactions_drop_deprecated.sql`

**Hard prerequisites before applying:**
- Migration 033 is live and verified
- `leg_transactions` is live and populated
- Routines Phase 2 updates deployed
- App code no longer reads `position_detail`, `price`, `pnl_pct` from this table
- **Take a fresh database dump immediately before applying**

`direction` is not dropped here — it stays on `holding_transactions` until routines
are confirmed to write it to `legs` instead. Drop it in a subsequent migration after
that confirmation.

```sql
begin;

alter table public.holding_transactions
  drop column if exists position_detail,
  drop column if exists price,
  drop column if exists pnl_pct,
  drop column if exists leg;

commit;
```

---

## `position_detail` backfill — populating `legs`

The canonical format in `holdings.position_detail`:
```
Common @ $30.10 + $30C Jun '26 @ $1.50 + $30C Sep '26 @ $3.58 + $35C Sep '26 @ $2.74
```

**Parse rules per segment (split on ` + `):**
- No `C`/`P` after `$` → `SHARES`, price after `@` = `avg_cost_basis`, `multiplier = 1`
- Matches `$<strike>[C|P] <Mon> '<YY>` → `OPTION`, extract `option_strike`,
  `option_right` (C=CALL / P=PUT), `option_expiry`, `multiplier = 100`

**Cross-reference `ibkr_legs` JSONB** on each `holdings` row — it contains `strike`,
`expiry`, `put_call`, `quantity`, `avg_cost`, `mark_price` structured by the admin
IBKR proxy. Use it to populate `current_size` and `mark_price` for option legs.

**Seed each leg's history, not just its end state.** Because the 030 trigger derives
`avg_cost_basis`/`current_size`/`realized_pnl` from `leg_transactions`, the backfill
should insert an opening `BUY` `leg_transaction` per leg (and any known sells) rather
than writing derived fields onto `legs` directly. If only the end state is known, insert
a single opening `BUY` at the parsed `avg_cost_basis` and `current_size`.

**Do not automate this backfill in a migration.** It requires human review per ticker.
Write a standalone backfill script and run it with oversight. Only apply migration 034
after backfill is confirmed complete.

---

## Workstream 2 — Routine updates

### Phase 1 — Apply at cutover with migrations 022–032

All five skills need these changes simultaneously at cutover.

**All routines — `holdings` upsert:**
- Add `"trader_id": "<STW uuid>"` to every payload
- Change conflict target: `on_conflict=ticker` → `on_conflict=ticker,trader_id`

**All routines — `conviction_comments` insert:**
- Add `"trader_id": "<STW uuid>"` to every payload

**All routines — `run_log` write:**
- Replace `"channel": "channel-name"` with `"channel_id": "<channel uuid>"`

**All routines — high-water mark queries:**
- Replace `channel=eq.channel-name` with `channel_id=eq.<channel uuid>`

**`graddox-daily-summary` skill specifically:**
- Endpoint: `/rest/v1/graddox` → `/rest/v1/signals`
- Remove `"id": 1` from payload entirely
- Add `"trader_id": "<Graddox uuid>"` to payload
- Rename `"signals": [...]` → `"signals_data": [...]` in payload
- **Always set `"date"`** — it is half of the conflict key
- Upsert conflict target: `on_conflict=trader_id,date`
  (unique constraint added in 028 backs this)

**`stw-morning-run` — Graddox step `run_log` write:**
- Use `channel_id` pointing to the `graddox-vip` channel UUID

### Phase 2 — Apply after `legs` backfill confirmed (with migrations 034–035)

**`stw-morning-run` and `stw-afternoon-run`:**
- Stop writing `position_detail` to `holdings`
- Stop writing `exit_price` / `exit_pnl_pct` to `holdings` — write to closed `legs` row instead
- Stop writing `last_action`, `action_date`, `current_weight` directly to `holdings` —
  write a `holding_transactions` row instead; trigger 031 propagates upward
- Add `legs` row creation for every new position
- Add `leg_transactions` row for every BUY / SELL / TRIM / EXERCISE / EXPIRE action

**`stw-friday-weighting`:**
- Stop writing `current_weight` directly to `holdings`
- Write a `holding_transactions` row with `action = 'Hold'` and the new `weight` — trigger
  031 updates `holdings.current_weight` **and preserves `last_action`/`action_date`** (the
  weight-only carve-out). Do not use a real action verb for a weight-only refresh.
- `initial_weight` write-once logic is handled by the trigger — the routine may pass it
  unconditionally; the trigger protects it

**Admin IBKR proxy (`ibkr_proxy.py`):**
- Stop writing `last_pnl_pct` / `last_pnl_at` / `ibkr_legs` to `holdings`
- Write `legs.mark_price`, `legs.mark_price_at`, `legs.mark_price_source = 'IBKR'` instead
- Update `legPriceReason()` in `@stw/shared` to reference `legs.mark_price_source`
  instead of `holdings.ibkr_legs` leg objects

---

## Workstream 3 — UI restructure: Ticker Detail conviction section

### Problem

The current Ticker Detail layout splits conviction commentary into two sections
with Transaction History sandwiched between them:

```
CONVICTION BAR
THESIS (summary + bullets)
LATEST COMMENTS          ← newest conviction_comments row
TRANSACTION HISTORY      ← interrupts the narrative
CONVICTION NOTES         ← older conviction_comments rows
+ Add Note
```

`Latest Comments` and `Conviction Notes` are the same data — `conviction_comments`
rows — distinguished only by recency. Splitting them implies different data types.
Transaction History belongs at the bottom.

### Solution

```
CONVICTION BAR
THESIS (summary + bullets)
COMMENTARY               ← all conviction_comments rows, newest first, unified
  [C2 WANING] Jun 11 · Discord
  [C4 HIGH]   May 5  · Stream
  [C3 MOD]    Apr 12 · Discord
+ Add Note
TRANSACTION HISTORY      ← moved to bottom
  [events in reverse chronological order]
+ Add Event
```

### Implementation — `@stw/ui`

**Remove:**
- `LatestComments` block as a standalone section
- `ConvictionNotes` block as a standalone section

**Add:**
- One `CommentaryHistory` component that fetches all `conviction_comments` rows for
  `(ticker, trader_id)` ordered by `created_at DESC` and renders them as a flat list
- Each row shows: date, source badge (`DISCORD` / `STREAM` / `MANUAL`), conviction
  badge, comment text
- `+ Add Note` at the bottom of the list

**Move:**
- Transaction History section below `CommentaryHistory`
- `+ Add Event` stays at the bottom of Transaction History

**⚠️ Required insert changes (post-026 — both columns are now `NOT NULL`):**
- The **"+ Add Note"** insert into `conviction_comments` must include
  `trader_id` (STW's UUID) and a valid `source` (`'manual'` for these user/admin notes).
- The **"+ Add Event"** insert into `holding_transactions` must include `trader_id`
  (STW's UUID). Note this is a *direct* insert that does not touch `holdings`, so it does
  not fire trigger 031 — it stands alone as a manual audit entry, exactly as today.

**No new database changes required for the layout itself.** `conviction_comments` already
holds all rows in one place; the merge is a rendering change. The only DB-driven change is
adding `trader_id`/`source` to the two insert payloads above.

### Conviction notes — corrected documentation for all three routine skills

Replace the contradictory language currently in `stw-transcripts` STEP 5 and apply
consistently across morning run, afternoon run, and transcripts skill:

> Conviction notes are written explicitly via curl — one `conviction_comments` INSERT
> per ticker (now including `trader_id`). There is no database trigger involved in this
> flow and no server-side RPC. The `CommentaryHistory` section in the dashboard renders
> all `conviction_comments` rows for the ticker ordered by date, newest first. No
> archiving happens — all rows stay in `conviction_comments` permanently. The thesis
> (`holdings.summary` + `bullets`) is a separate explicit write, made only when the
> durable reason for holding the position actually changed.

---

## Application order summary

| # | Migration | Blocker | Phase |
|---|---|---|---|
| 022 | Create `traders` + seed | None — apply first | Cutover |
| 023 | Create `channels` + seed | Requires 022 | Cutover |
| 024 | Create `categories` + seed | Requires 022 | Cutover |
| 025 | `holdings` composite PK + trader/category | Requires 022–024 + seeded data | Cutover |
| 026 | `trader_id` on log tables + fix source enum | Requires 022, 025 | Cutover |
| 027 | `run_log.channel` → FK | Requires 023 + channels seeded | Cutover |
| 028 | Rename `graddox` → `signals` + per-day unique constraint | Requires 022 + app code searched | Cutover |
| 029 | Create `legs` | Requires 025 | Cutover |
| 030 | Create `leg_transactions` + trigger | Requires 029 | Cutover |
| 031 | `holding_transactions` sync trigger (weight-only carve-out) | Requires 026 — verify loop + weight path on preview branch | Cutover |
| 032 | Create `spy_daily` | None — independent | Cutover |
| 033 | Rewrite 016 trigger | Requires 026 | Before 034/035 |
| — | Backfill `legs` from `position_detail` / `ibkr_legs` | Manual — human review per ticker | Before 034 |
| 034 | Drop deprecated `holdings` columns | Requires 033 + backfill confirmed + app updated | Phase 2 |
| 035 | Drop deprecated `holding_transactions` columns | Requires 033 + routines Phase 2 updated | Phase 2 |

---

## CLAUDE.md updates required after cutover

1. Migration count: 021 → 035
2. Tables list: add `traders`, `channels`, `categories`, `legs`, `leg_transactions`,
   `spy_daily`; replace `graddox` with `signals`; remove `graddox_levels` (never existed)
3. Writers table: add `legs` and `leg_transactions` (written by routines Phase 2);
   document trigger inversion — `holding_transactions` now drives `holdings.last_action`,
   `action_date`, `current_weight`, `initial_weight` via trigger 031 (with the `'Hold'`
   weight-only carve-out)
4. Remove references to `holdings.position_detail`, `ibkr_legs`, `last_pnl_pct` — deprecated
5. Update admin IBKR proxy description: writes `legs.mark_price` not `holdings` columns
6. Note that `signals` retains one row per trader per day — app always reads latest by date
7. Note that all client-side inserts into `holding_transactions` / `conviction_comments`
   must supply `trader_id`
