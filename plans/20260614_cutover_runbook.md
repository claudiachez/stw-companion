# Cutover Runbook — Schema Migration v4

Operational sequence for the cutover **you trigger**. Companion to
[`schema_migration_plan_v4.md`](schema_migration_plan_v4.md) (§Critical: cutover strategy),
[`cutover_change_checklist.md`](cutover_change_checklist.md) (worklist), and
[`workstream2_routine_edits.md`](workstream2_routine_edits.md) (routine SKILL.md edits).

**State at time of writing (2026-06-14):** prod has **only 022** applied (`traders` + rows STW,
Graddox). Branch `claude/schema-multi-leg` holds migrations 023–036 + Phase-1 & Phase-2 app code,
all committed, **not pushed**. Sandbox validated 022–036. This runbook does **not** apply anything —
it is the ordered checklist to run in the window.

---

## Backfill of record — `supabase/stw_backfill_2026.sql` (decided 2026-06-14)

The authoritative backfill is now the **full-history SQL file** `supabase/stw_backfill_2026.sql`
(user-authored Dec 2025 → Jun 2026 event history; adapted 2026-06-14 to the size-less %-model).
It supersedes the snapshot script. **`scripts/backfill_legs.ts` and `scripts/_position_detail_parse.ts`
are RETIRED** (removed from the repo; recoverable from git history if ever needed). The earlier "P0
backfill-script fix" is therefore moot.

The adapted file: 4 sections — **0 holdings identity** (FK target; trigger 031 only UPDATEs) → **1
holding_transactions** → **2 legs shells** → **3 leg_transactions** (trigger 030 derives entry/
status/exit/realized %). Size-less: no quantities; per-leg `weight` is NULL where unstated (open
legs), `0` on close/expire/exercise, stated holding weight on the 4 trims. EXERCISE spawns a SHARES
leg (`parent_leg_id`, entry = strike + premium). AMRC option leg omitted (strike unknown). 44
tickers; ~90 holding events, 73 leg shells, ~119 leg events.

> ✅ **Validated on the sandbox (2026-06-14)** — ran clean end-to-end against the live 022–036
> schema. Section 0's `holdings` identity insert succeeded (NOT-NULL set was fine), every leg_id
> subquery resolved, and the triggers derived leg state without error. Made idempotent during
> validation: Section 1 uses `ON CONFLICT (ticker,trader_id,action,event_date) DO NOTHING`.
>
> Two gotchas seen while validating, for the prod run: (a) clear any pre-existing
> `legs`/`leg_transactions`/`holding_transactions` for STW first if re-loading, or the
> `holding_transactions` unique key collides (the `ON CONFLICT` now absorbs that); (b) Supabase's
> SQL-editor RLS linter **falsely** flags "creates a table shares" — click **Run without RLS**
> (the "Run and enable RLS" button appends an `ALTER TABLE shares … RLS` that fails, since the
> file creates no tables).

---

## Phase split

| Window | Steps |
|---|---|
| **Cutover window** | Pre-flight → resolve UUIDs → apply 023–032 + 036 (033 right after 026) + seeds → backfill `legs` on the real book → deploy app + Phase-1 routines → resume cron → verify |
| **After backfill confirmed** | ensure `category_id` coverage → apply 034 → apply 035 → deploy Phase-2 routines |

> 034/035 are **held** out of the window (CLAUDE.md Next Steps #3): they drop the columns the
> backfill reads (`position_detail`/`ibkr_legs`) and that Phase-1 routines still write. Drop them
> only once `legs` is confirmed complete and Phase-2 routines are ready.

---

## Step 0 — Pre-flight (read-only, run against PROD before the window)

Surface blockers while there's still time to fix them. All read-only.

**a. `category_id` coverage (gates 034).** 025 backfills `category_id` from `basket`; any holding
whose `basket` is null or doesn't match a seeded category ends up null and relies on the app's
`'Other'` fallback. List them:
```sql
select ticker, basket from public.holdings
where category_id is null;   -- run AFTER 024/025; before the window, check basket nulls:
-- select ticker from public.holdings where basket is null;
```

**b. Ticker `P` data nit (sandbox finding #4).** `P` is `Closed` with `action_date = NULL` and no
matching `holding_transactions` row. A weight-only `Hold` on it post-cutover would make trigger 033
manufacture a phantom `Closed` audit row dated today. Low risk (closed positions get no Friday
nudge). Optionally backfill its audit row or leave it:
```sql
select ticker, last_action, action_date from public.holdings where ticker = 'P';
```

**c. Dedupe-constraint prerequisite (036).** Must be 0 (verified 0 already; re-confirm on the
cutover target):
```sql
select ticker, action, event_date, count(*)
from public.holding_transactions
group by ticker, action, event_date having count(*) > 1;
```

**d. Migration 021 — DROPPED (2026-06-14).** `021_holding_direction.sql` (would add
`holdings.direction`) was never applied to prod and is **superseded by `legs.direction`** (029, the
going-forward source). The file has been removed from the repo, so repo = prod for this column (it
simply doesn't exist on `holdings`). The app reads `Holding.direction` as nullable and `select('*')`
just omits the absent column — no error. **No action in the window.**

**e. Baseline counts** (for post-cutover diffing):
```sql
select count(*) as holdings, count(*) filter (where last_action='Closed') as closed from public.holdings;
select count(*) from public.holding_transactions;
select count(*) from public.conviction_comments;
```

---

## Step 1 — Resolve UUIDs

022 is already applied to prod, so `traders` rows exist. On the **cutover target** (preview branch
or prod, per your Supabase workflow), capture:
```sql
select name, id from public.traders;                              -- STW, Graddox (after 022)
select channel_name, discord_channel_id, id from public.channels; -- after 023 seed
```
Fill the placeholder table in [`workstream2_routine_edits.md`](workstream2_routine_edits.md) §0 —
those `<…>` values feed the Phase-1 routine edits.

---

## Step 2 — Apply migrations (strict order; 033 right after 026)

Apply on the **preview branch first**, validate, then merge to prod. **022 is already on prod** — do
not re-apply. Each file has its seed/verify inline as commented blocks; run the seed **separately**
after the migration commits.

| # | File | Seed / verify after applying |
|---|---|---|
| 023 | `023_create_channels.sql` | run the 4-channel seed block (graddox / live-notes-portfolio / updates-portfolio / stream-library-stw) |
| 024 | `024_create_categories.sql` | run the seed from distinct `holdings.basket` |
| 025 | `025_holdings_add_trader_category.sql` | `select count(*) from holdings where trader_id is null;` **must be 0** |
| 026 | `026_add_trader_id_to_log_tables.sql` | — |
| **033** | `033_rewrite_016_trigger.sql` | **APPLY HERE** — 026 makes `trader_id` NOT NULL; the old 016 trigger throws on every holdings write until 033 replaces it (sandbox finding #1) |
| 027 | `027_run_log_channel_fk.sql` | before its Step 5 drop: `select count(*) from run_log where channel_id is null and ran_at > now() - interval '90 days';` must be 0 |
| 028 | `028_rename_graddox_to_signals.sql` | verify a SELECT policy survived the rename (query in-file) |
| 029 | `029_create_legs.sql` | — |
| 030 | `030_create_leg_transactions_and_trigger.sql` | — |
| 031 | `031_holding_transactions_sync_trigger.sql` | **verify loop + weight-only path** (in-file): insert an `Upsized` row → holdings updates once, no dup; insert a `Hold` row for a last-`Upsized` ticker → weight updates, last_action/date unchanged |
| 032 | `032_create_spy_daily.sql` | — (table only; population deferred) |
| 036 | `036_holding_transactions_dedupe_constraint.sql` | adds the unique key the app/routine upserts target (`on_conflict=ticker,trader_id,action,event_date`); requires Step 0c = 0 |

Resulting order: `(022 done) → 023 → 024 → 025 → 026 → 033 → 027 → 028 → 029 → 030 → 031 → 032 → 036`.
(Migration 021 is dropped — see Step 0d.)

---

## Step 3 — Backfill `legs` on the real book

> Run `supabase/stw_backfill_2026.sql` in the Supabase **SQL editor**. Confirm 023–032 + 036 are
> applied first (legs/leg_transactions/triggers exist); 034 must NOT be applied yet (the file's
> source data was parsed from the legacy text, but the file itself only writes the new tables).

Execute the four sections **in order** (0 holdings → 1 holding_transactions → 2 legs → 3
leg_transactions). The triggers do the rest (031 drives holdings; 030 derives leg state). After it
runs, spot-check a few holdings in the app (ADEA mixed, CXDO long history, BLDP closed, an exercise
like VIAV/AMKR with its spawned share lot).

- **Validate on the sandbox/preview FIRST** (see the ⚠️ above) — fix any NOT-NULL / leg_id-subquery
  errors there before prod.
- **Per-leg weights are NULL** for open legs (decided) → holdings' weighted-avg P&L is incomplete
  until you fill them; per-leg P&L still shows. Holding-level weight is set (Section 1 → trigger 031).
- **AMRC** option leg is omitted (unknown strike) — add a real strike and uncomment to include it.
- **Data-transfer caveat:** a Supabase branch **merge applies migrations to prod, it does not copy
  data rows.** If you run the backfill on the preview branch, those `legs`/`holding_transactions`
  rows do **not** travel to prod on merge — re-run the file against prod after merge. Decide where
  the authoritative run happens (see Decisions).

---

## Step 4 — Deploy app + Phase-1 routines, resume cron

- **Deploy app** (both Netlify sites) from the cutover branch. ⚠️ The Phase-2 reader selects
  `*, legs(*), category:categories(name)` **unconditionally** (no feature flag) — so `legs` must be
  populated (Step 3) **before** the app deploy, or the dashboard shows holdings with no legs / no
  P&L. Sequence Step 3 → Step 4 accordingly.
- **Apply Phase-1 routine edits** to the five SKILL.md files
  ([`workstream2_routine_edits.md`](workstream2_routine_edits.md) §Phase 1) — only now, in the
  window. Applying earlier breaks every cron write against the un-migrated prod.
- **Resume cron.** Verify the first post-cutover morning/afternoon/graddox run returns non-empty
  `return=representation` bodies, `signals` lands with `trader_id`+`date`, `run_log` carries
  `channel_id`, holdings upserts hit the composite PK.

> **Transition gap (flag):** Phase-1 routines still write `position_detail`/`last_action`/
> `current_weight` and do **not** write `legs`/`leg_transactions`. So any **new** position the
> routines add between cutover and Phase-2-routine deploy gets a `holdings` row but **no legs** →
> shows empty in the (legs-reading) app until Phase-2 routines ship or it's manually backfilled.
> Keep the window between Step 4 and Phase 2 short, or hold new-position entry. See Decisions.

---

## Step 5 — Finish (after backfill confirmed complete)

1. Re-run Step 0a — every holding has a `category_id` (or accept the `'Other'` fallback).
2. **Take a fresh DB dump.**
3. Apply `034_holdings_drop_deprecated_columns.sql` (drops `position_detail`/`last_*`/`ibkr_legs`/
   `exit_*`/`basket`).
4. Apply `035_holding_transactions_drop_deprecated.sql` (drops `position_detail`/`price`/`pnl_pct`/
   `leg`).
5. Deploy **Phase-2 routine edits** ([`workstream2_routine_edits.md`](workstream2_routine_edits.md)
   §Phase 2): routines stop writing the dropped columns and start writing `legs`/`leg_transactions`
   + `holding_transactions` rows; `basket`→`category_id` (routine creates categories).

---

## Rollback / safety

- **Per-migration:** each file is wrapped in `begin; … commit;` — a failure rolls that file back
  cleanly. Apply one at a time; stop on the first error.
- **Preview branch first:** the whole 023–036 sequence + backfill + app + routines is validated on
  the preview branch before any prod merge (sandbox already proved the SQL applies clean).
- **Fresh dump before 034/035** (the only destructive, column-dropping step) — non-negotiable.
- **Cron is pausable:** a missed scheduled run is recoverable (high-water mark makes the next run
  catch up). Pause cron before Step 2, resume at Step 4.

---

## Decisions to lock before the window

_Resolved 2026-06-14: P0 backfill fix (done), migration 021 (dropped). Remaining:_

1. **Backfill target** — run the authoritative real-book backfill on the **preview branch then
   re-run on prod post-merge**, or run it **directly on prod** after the migrations merge? (Branch
   merges don't carry data rows.)
2. **Transition gap** — accept the brief "new positions have no legs until Phase-2 routines" window,
   or compress Step 4 → Step 5 so Phase-1 and Phase-2 routine edits ship together (skipping the
   Phase-1-only routine state entirely)?
