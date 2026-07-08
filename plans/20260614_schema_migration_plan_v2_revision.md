# Schema Migration Plan v2 — Revision (Required Changes)

**Companion to:** `schema_migration_plan_v2.md`
**Prepared by:** Claude Code review pass, 2026-06-12
**Verified against:** live database `usmqbohcjcyszjxxvnqu` (schema + data + constraints)

v2 fully absorbs all 11 flags from the v1 review. This revision covers **two new issues
introduced by v2's own changes** (one a hard blocker), plus items now confirmed safe and a
few minor fixes. Resolve issues 1 and 2 before cutover.

---

## 🔴 1. Migration 028 breaks the Gradoxx upsert — no unique constraint for the documented conflict key

**Blocks:** 028 + the `gradoxx-daily-summary` routine (Phase 1).

028 converts `graddox.id` to a `gen_random_uuid()` default (lines 466–470) and the routine
spec says to "remove `id:1` — upsert now resolves on `(trader_id, date)`" (line 1026). But
**028 creates no unique constraint on `(trader_id, date)`** — verified: the table has no
unique/exclusion constraint at all. PostgREST `on_conflict=trader_id,date` fails hard
without one:

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

So the gradoxx write dies on the **first post-cutover run**.

### Second-order problem
`graddox` is a **singleton** today (one row, `id=1`, overwritten daily — confirmed:
1 live row). A uuid default + per-day conflict key silently turns it into a **multi-row,
one-per-day** table. The app's single-row read and the `gradoxx-daily-summary` skill both
assume a singleton. That semantic cutover is captured in **neither** the routine nor the UI
workstream.

### Fix — choose one and document it explicitly
- **Keep singleton (smallest change):** add `unique (trader_id)` to `signals`; the routine
  upserts on `trader_id`. App read is unchanged (still one row per trader).
- **Move to per-day history:** add the constraint **and** update the app + skill:
  ```sql
  alter table public.signals
    add constraint signals_trader_date_unique unique (trader_id, date);
  ```
  Then change the app's signals read from "the row" to "latest row by `date` for the
  trader," and document that `signals` now retains daily history. This is likely what the
  uuid change was reaching for, but it is more work and must be scoped here.

Either way: **028 must create the unique constraint that the routine's `on_conflict`
targets.** Do not ship 028 without it.

---

## 🟠 2. `holdings.status` is added in 025 but has no writer after cutover

**Blocks:** correctness of any query that filters on `status`.

v2 added `holdings.status` (`ACTIVE`/`CLOSED`/`WATCHLIST`, lines 284–299) and backfills it
once from `last_action`. But **nothing maintains it going forward:**
- The 031 trigger writes only `last_action`, `action_date`, `current_weight`,
  `initial_weight` — not `status`.
- The Phase 2 routine changes never set `status`.

So when a position closes (`last_action → 'Closed'` via 031), `status` stays `'ACTIVE'` —
stale immediately. This is the same stored-column-with-no-writer bug class that v1 flagged
for `unrealized_pnl`.

### Fix — choose one
- **Derive it in the trigger:** have 031 (and the 032a rewrite) set
  `status = case when new.action = 'Closed' then 'CLOSED' else 'ACTIVE' end` whenever it
  touches the row. Keeps the explicit column consistent.
- **Drop the column:** don't add `status` at all; keep inferring closed-state from
  `last_action = 'Closed'`, which is what the app does today. Simplest, removes the
  maintenance burden.

Do not ship a stored `status` column with no writer.

---

## ✅ Confirmed safe — v2 assumed these and they hold (verified on live DB)

No action needed; recorded so the executing agent doesn't have to re-check.

| Assumption | Result |
|---|---|
| No FK references `holdings(ticker)` | **Confirmed none** — dropping `holdings_pkey` in 025 won't be blocked |
| No view/matview depends on the columns 033/034 drop | **Confirmed none** — drops won't be blocked by dependencies |
| `holding_transactions.leg` is `NOT NULL DEFAULT 1` | **Confirmed** — 032a omitting `leg` is fine (default applies) until 034 drops it |
| `holdings.CASH.last_action` is null | **Confirmed** — backfills to `status = 'ACTIVE'`, harmless |
| `holdings_pkey` / `graddox_pkey` constraint names | **Confirmed exact** — the 025/028 `drop constraint` lines are valid |

---

## 🟡 Minor / documentation

- **Line 351 (Migration 026):** the comment claims 026 "adds `direction` column to `legs`."
  It does not — 029 adds `direction` to `legs`. Fix or remove the comment.
- **`032a` numbering:** since nothing is applied yet, prefer whole sequential numbers —
  rename `032a` → `033` and shift the column drops to `034`/`035`. Keeps the
  "number sequentially" rule clean. Cosmetic only.
- **028 RLS:** it relies on policies auto-carrying through the table rename and adds none
  explicitly (unlike every other new table in the plan). Verify a `select` policy for
  `authenticated` still exists on `signals` post-rename so the app can read it.

---

## Updated pre-cutover checklist

| # | Severity | Item | Blocks |
|---|---|---|---|
| 1 | 🔴 | Add the unique constraint backing the gradoxx `on_conflict`; decide singleton vs. per-day and update app/skill accordingly | 028 + gradoxx routine |
| 2 | 🟠 | Give `holdings.status` a writer (derive in trigger) or drop the column | 025 + status queries |
| 3 | 🟡 | Fix the 026 `direction`-on-legs comment | docs |
| 4 | 🟡 | Renumber `032a` to a whole number | convention |
| 5 | 🟡 | Verify `signals` SELECT RLS policy survives the rename | 028 |
