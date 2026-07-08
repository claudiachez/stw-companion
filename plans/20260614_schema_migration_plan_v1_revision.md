# Schema Migration Plan — Revision 1 (Required Changes)

**Companion to:** `schema_migration_plan.md`
**Prepared by:** Claude Code review pass, 2026-06-12
**Status:** The plan's logical design is sound. The items below must be resolved
**before** the corresponding migrations are applied. Items 1, 4, and 5 are
correctness-breaking against the **live** schema/data — do not apply 025/027/033/034
until they're addressed.

All findings were verified against the live database (`usmqbohcjcyszjxxvnqu`) and the
shipped migration 016, not just read off the plan.

---

## 🔴 Critical — will break production

### 1. No cutover coordination — four migrations break live writers/readers on apply
The plan flags only **033/034** as having hard prerequisites (lines 826–827). That
understates the problem. Four earlier migrations break the live app and/or the external
routines **the moment they hit prod**, while the routines run on cron (9am/3pm wkdays,
5pm Fri) and the app is live:

| Migration | What breaks |
|---|---|
| **025** (holdings PK → `(ticker, trader_id)`) | Routines upsert via REST `on_conflict=ticker` → breaks on next run |
| **027** (drop `run_log.channel`) | Routine `run_log` write → breaks |
| **028** (`graddox`→`signals`, `signals`→`signals_data`) | Routine writes **and** the live app's Signals read (app reads `graddox` today) → break |
| **031** (write-direction inversion) | Routines must simultaneously stop writing `last_action`/`action_date`/`current_weight` to `holdings` |

**Fix — add an explicit cutover strategy.** Either:
- **(Preferred)** Apply and test the whole 022–031 chain on a **Supabase preview branch**
  (the Supabase MCP supports branch create/test/merge), then cut over DB + app + admin
  proxy + routines **together**; or
- Pause the scheduled routines, deploy app/proxy/routines in lockstep, and apply
  025/027/028/031 inside a maintenance window.

Either way: reclassify the "hard prerequisites" note — it is **not** limited to 033/034.

---

### 2. Migration 016 trigger references columns that 033 & 034 drop → `holdings` becomes unwritable
The plan never mentions the shipped 016 trigger (`stw_log_holding_transaction()`), which
is still active. It **reads** `NEW.position_detail`, `NEW.last_price`, `NEW.exit_pnl_pct`
and **inserts into** `holding_transactions(position_detail, price, pnl_pct, leg)`.

- **033** drops `holdings.position_detail`, `last_price`, `exit_pnl_pct` → every `holdings`
  write then throws `column does not exist`.
- **034** drops `holding_transactions.position_detail`, `price`, `pnl_pct`, `leg` → the
  016 INSERT throws, and its `leg`-based dedupe / re-entry logic is gone.

**Fix:** add a migration that **rewrites or retires 016 before 033/034**. As written, 033
silently bricks all position writes (admin Edit form *and* routines).

---

### 3. Migration 027 backfill is non-deterministic
`run_log.channel` stores only the channel **name**. Live data: `live-notes-portfolio` ×17,
`updates-portfolio` ×1, `stream-library-stw` ×1. But the 023 seed creates **two** `channels`
rows named `live-notes-portfolio` (morning + afternoon, differing only by `routine_type`).
So `... where c.channel_name = rl.channel` matches **both** rows → those 17 history rows
get an arbitrary morning-or-afternoon `channel_id`, and the routines' per-channel
high-water-mark logic breaks.

**Fix:** disambiguate the backfill using `run_log.run_type` ↔ `channels.routine_type`
(run_log already has `run_type`: morning/afternoon/friday/transcripts). Better, reconsider
the model — one Discord channel = two `channels` rows is the root cause; `routine_type`
arguably shouldn't be part of a channel's identity.

---

## 🟠 High — incorrect data / constraint violations

### 4. Migration 030 trigger mishandles expirations and exercises
- An `EXPIRED_WORTHLESS` option records `realized_pnl = 0` (the realized calc sums `SELL`
  rows only) — but expiring worthless is a **100% premium loss**. Realized P&L is silently
  overstated.
- `EXERCISED`/`EXPIRED` quantities aren't netted into `current_size` (only BUY/SELL are),
  so a terminal-status leg keeps a non-zero `current_size`.

**Fix:** realize the remaining cost basis as a loss on `EXPIRED`, and either net
EXERCISED/EXPIRED quantities into `current_size` or force `current_size = 0` when status is
terminal.

### 5. Enum reference drifts from the live CHECK constraints
The agent will write values the DB rejects, or chase a non-existent column:
- **`conviction_comments.source`** — live constraint is `{discord, streaming, manual}`.
  Plan line 721 says `discord · streaming · **user**`. `user` violates the constraint; the
  correct third value is **`manual`**.
- **`holdings.status`** (plan line 717, `ACTIVE/CLOSED/WATCHLIST`) **does not exist**.
  Holdings has no `status` column — closed state is `last_action = 'Closed'`. Remove it
  from the enum reference or add the column deliberately.
- **`holding_transactions.direction`** (`long/short`, shipped in 020/021) exists on the
  live table but the plan never accounts for it — 034 doesn't address it and the new
  `legs`/`leg_transactions` model has no `direction` equivalent. Decide where direction
  lives post-migration.

### 6. `legs.unrealized_pnl` is a stored column that nothing maintains
029 creates `unrealized_pnl` as a stored column (line 361), the 030 trigger never updates
it, yet line 731 lists unrealized P&L as "**never store, always compute**." As written it's
a guaranteed-stale `0`. **Fix:** drop the column from 029, or document it as query-time
only (computed in a view/RPC).

### 7. The 031 loop-safety rationale is factually wrong
Lines 592–598 claim no loop "because the new trigger writes to `holdings` without touching
`holding_transactions` again." False — the `holdings` UPDATE from 031 **re-fires the 016
trigger**, which writes back to `holding_transactions`. What actually prevents a runaway is
016's **dedupe guard + "action/date changed" guard**, not the stated reason. It terminates,
but on the re-entry path (`New` after `Closed`) 016 recomputes `v_leg = MAX(leg)+1`; if that
disagrees with the leg the routine inserted, you get a **duplicate** transaction row, not a
clean no-op.

**Fix:** correct the rationale, and harden 031 — only write columns when `DISTINCT FROM`
the current value (suppress no-op echoes) and/or gate on `pg_trigger_depth()`; confirm
leg-numbering agreement between the routine insert and 016.

---

## 🟡 Medium — operational robustness

### 8. `:stw_trader_id` is not executable in the Supabase SQL editor
There's no `psql` variable binding in the editor, so 023–031 won't run as-pasted, and 022
still carries the `'your-chosen-uuid-here'` placeholder. **Fix:** let 022 use the
`gen_random_uuid()` default and `RETURNING id`, then substitute that literal UUID into every
later file. Call this out boldly so the agent doesn't run the files verbatim.

### 9. Wrap multi-step migrations in `BEGIN/COMMIT`
Especially **025**: if step 5 (drop PK / add composite PK) fails after steps 1–4, `holdings`
is left with new nullable columns and **no primary key**. Transaction-wrapping makes each
migration atomic and safely re-runnable.

### 10. `graddox` singleton relies on `id DEFAULT 1`
028 drops that default; after the rename the routine must supply `id` explicitly on its
upsert or inserts fail. (Confirmed: no CHECK enforces the singleton — only the default + PK.)

---

## Minor / housekeeping

- **`graddox_levels` does not exist** in the live DB. The plan's CLAUDE.md edit
  instructions (lines 335, 802) say "replace `graddox`/`graddox_levels`" — drop the
  `graddox_levels` mention; there's nothing to replace.
- **Re-snapshot the DB before 033/034.** The pre-redesign backup
  (`backups/stw_db_backup_2026-06-12_pre-redesign.json`) is point-in-time; the destructive
  column drops happen weeks later after routine writes have drifted. Take a fresh dump
  immediately before applying 033 and 034.

---

## Summary checklist for the executing agent

| # | Severity | Item | Blocks |
|---|---|---|---|
| 1 | 🔴 | Add cutover lockstep / Supabase-branch strategy | 025, 027, 028, 031 |
| 2 | 🔴 | Rewrite/retire 016 trigger first | 033, 034 |
| 3 | 🔴 | Disambiguate 027 backfill via `run_type` | 027 |
| 4 | 🟠 | Fix 030 expiration/exercise P&L + size | 030 |
| 5 | 🟠 | Fix enum drift (`manual` not `user`; no `holdings.status`; handle `direction`) | 024/026/034 + reference |
| 6 | 🟠 | Resolve `legs.unrealized_pnl` stored-vs-computed contradiction | 029 |
| 7 | 🟠 | Correct + harden 031 loop reasoning | 031 |
| 8 | 🟡 | Replace `:stw_trader_id` placeholders with literal UUID | 022–031 |
| 9 | 🟡 | Wrap multi-step migrations in transactions | 025 (esp.) |
| 10 | 🟡 | `graddox` singleton needs explicit `id` after default drop | 028 |
