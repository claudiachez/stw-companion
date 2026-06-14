# Cutover Change Checklist — Schema Migration v4

Companion to `schema_migration_plan_v4.md`. Concrete code/routine edits, grouped by the
plan's two phases. **Nothing here is applied yet** — this is the worklist for the
coordinated cutover window (Phase 1) and the post-backfill follow-up (Phase 2).

Trader UUIDs are captured at runtime when 022 is seeded — substitute `<STW uuid>` /
`<Graddox uuid>` from the `RETURNING id` output.

---

## Schema revision — legs weight/%-model + guard rails (2026-06-14)

Decided with the user and implemented + sandbox-validated:

- **Guard rail A — "+ Add Event" form:** Option A (the manual insert keeps firing trigger 031 →
  propagates to the live position). Added a **back-dating block** (`min=today` + `save()` refuses
  past dates) since a back-dated entry would rewind `last_action`/`action_date`. Historical
  events belong to the message-replay backfill.
- **Guard rail B — manual + routine dedupe:** migration **036** adds `unique (ticker, trader_id,
  action, event_date)` on `holding_transactions`; `insertHoldingTransaction` now **upserts** on
  that key. Manual entry + routine writing the same event collapse to one row (last write wins).
  Routine-side upsert flagged for Workstream 2. (0 violations on prod/sandbox; verified idempotent.)
- **legs are size-less, %-P&L, event-sourced (029/030 rewritten):** there are NO share/contract
  counts anywhere, only the host's published **weight**. So:
  - `legs` stores `entry_price`, per-leg **`weight`**, `mark_price`, `exit_price`,
    `realized_pnl_pct`. **Dropped** `current_size`, `multiplier`, `avg_cost_basis`(→`entry_price`),
    `realized_pnl`(dollars). P&L is %: `unrealized = (mark−entry)/entry×100`,
    `realized = (exit−entry)/entry×100` (× −1 for short).
  - per-leg `weight` comes from chat; when unstated the writer applies the **90/10 default**
    (mixed = 90% shares / 10% across options; options-only = even split; shares-only = 100%),
    admin-overridable.
  - `leg_transactions` kept as a **quantity-free event log** (`action_type`, `price`, `weight`,
    `executed_at`) feeding a replay-safe trigger; supports the future raw-message backfill.
  - **Exercise** (a common path): option leg → `status=EXERCISED`, `realized_pnl_pct=null`; writer
    spawns a SHARES leg at `entry = strike + premium` (`parent_leg_id` set) that carries the
    continuing %. Validated: open / partial-trim / full-close / expire / exercise all derive
    correctly via the trigger.
  - **Backfill rewritten** for this model — no more per-leg size gaps; weight from 90/10 default,
    month-only expiries → 3rd Friday. Dry-run + apply validated on the sandbox (ADEA → 4 legs).
- **`$100k` notional portfolio + SPY benchmark: deferred** (separate follow-up; legs don't depend
  on it). With per-leg weights it's now fully computable later.

---

## Sandbox validation findings (2026-06-13)

All of 022–035 were applied + tested on a throwaway Supabase project built from prod's
*actual* current schema and seeded with representative real data. Everything passed; the
notes below are the actionable takeaways.

1. **Apply 033 immediately after 026 (not after 032, as the plan's table lists it).**
   Proven on the sandbox: after 026 makes `trader_id` NOT NULL, the *old* 016 trigger throws
   `null value in column "trader_id"` on every holdings write until 033 replaces it. Sequence
   at cutover: …025 → 026 → **033** → 027 → 028 → 029 → 030 → 031 → 032.

2. **Migration 021 (`holdings.direction`) was never applied to prod** — prod `holdings` has
   no `direction` column (only `holding_transactions.direction`, from 020, exists). The repo
   migration files imply 021 is live; it isn't. Action: decide whether to apply 021 or drop
   the file. The backfill script + app default direction via `inferDirection(position_detail)`,
   so this is not a blocker — but `apps/.../api.ts` `Holding.direction` and `TradeEditForm`
   reference it; confirm they degrade gracefully (they read it as nullable).

3. **Backfill reality — contract SIZE is a manual override for EVERY leg.** Neither
   `position_detail` nor `ibkr_legs` carries a share/contract count (`ibkr_legs` is price-only:
   `{entry, price, right, expiry, strike, …}` — no `quantity`, and the mark is `price`, not
   `mark_price`). The script was corrected for this shape. Month-only expiries (STW quotes
   monthlies as `MON 'YY`, no day) now auto-resolve to the **3rd Friday**; only size needs
   per-leg entry in the overrides file.

4. **Pre-cutover data nit — ticker `P`** is `Closed` with `action_date = NULL` and no matching
   `holding_transactions` row (37/38 holdings are clean). If a weight-only `Hold` were ever
   written for it, trigger 033 would manufacture a phantom `Closed` audit row dated today.
   Closed positions don't get Friday weight nudges, so risk is low; optionally backfill P's
   audit row or leave it.

5. **Verified safe (no action):** 033 dropping `SECURITY DEFINER` is fine — only the admin
   (`ht_admin_write [ALL]`) and service-role routines write `holdings`. No view/matview depends
   on any column 034/035 drops. The 016→033 CASH-guard removal is moot (CASH `last_action` is
   null → 033 returns early).

---

## Phase 1 — at cutover (with migrations 022–033)

### Workstream 2 — Routines (out-of-repo: `~/Documents/Claude/Scheduled/<id>/SKILL.md`)

> **FLAG — not in this repo. These are the five cron skills. They must all change
> simultaneously at cutover or the first post-cutover run fails.** I cannot edit them from
> here; this is the spec to apply to each SKILL.md.

**All routines that upsert `holdings`** (`stw-morning-run`, `stw-afternoon-run`,
`stw-friday-weighting`, `stw-transcripts`):
- [ ] Add `"trader_id": "<STW uuid>"` to every `holdings` payload
- [ ] Change conflict target `on_conflict=ticker` → `on_conflict=ticker,trader_id`

**All routines that insert `conviction_comments`:**
- [ ] Add `"trader_id": "<STW uuid>"` to every payload

**All routines that write `run_log`:**
- [ ] Replace `"channel": "<name>"` with `"channel_id": "<channel uuid>"`
- [ ] High-water-mark read: `channel=eq.<name>` → `channel_id=eq.<channel uuid>`

**`graddox-daily-summary` skill** (writes the signals table):
- [ ] Endpoint `/rest/v1/graddox` → `/rest/v1/signals`
- [ ] Remove `"id": 1` from the payload entirely (id is now uuid default)
- [ ] Add `"trader_id": "<Graddox uuid>"`
- [ ] Rename payload key `"signals": [...]` → `"signals_data": [...]`
- [ ] **Always set `"date"`** — it is half the conflict key; a NULL date never conflicts
      and silently duplicates
- [ ] Upsert conflict target `on_conflict=trader_id,date` (backed by `signals_trader_date_unique`)

**`stw-morning-run` Graddox-step `run_log` write:**
- [ ] Use `channel_id` for the `graddox-vip` channel UUID

### Workstream 3 — App code (this repo, `@stw/ui` + `@stw/shared`)

> **IMPLEMENTED 2026-06-13** on `claude/schema-multi-leg` (typecheck green; data paths
> validated against the sandbox). `trader_id` is stamped in the **API layer**
> (`insertHoldingTransaction` / `insertConvictionComment` resolve STW via a new
> `features/traders/api.ts` `getTraderId(name)`, memoized) rather than in each form — the
> "app writes are STW" rule lives in one place and resolves by name (works on any environment
> without a hardcoded UUID).
>
> **⚠️ CORRECTION — the "+ Add Event" form DOES fire trigger 031.** My earlier note was wrong:
> 031 is `after insert on holding_transactions`, so the manual form now propagates to
> `holdings`. A weight-only `Hold` is benign (carve-out preserves `last_action`/`action_date`),
> but a real action — or a **back-dated historical** entry — via that form will overwrite the
> holding's live `last_action`/`action_date`/`current_weight`. **Open decision:** keep it (form
> = "record a real event", consistent with the new write-path model) or exempt the manual form
> from 031 (needs a guard column). Flagged for your call.

**1. `trader_id` on the two client inserts** (NOT NULL after migration 026):
- [x] `packages/shared/src/types/history.ts` — added `trader_id: string` to both
      `HoldingTransaction` and `ConvictionComment`.
- [x] `features/traders/api.ts` (new) — `getTraderId(name)` + `STW`/`GRADDOX` constants.
- [x] `picks/api.ts` — both inserts stamp `trader_id` (params now `Omit<…, 'trader_id'>`);
      forms unchanged. `source` still resolves in the form (`canEdit ? source : 'manual'`).

**2. graddox → signals read change** (`packages/ui/src/features/signals/api.ts`):
- [x] `fetchGraddox` — `.from('graddox')` → `.from('signals')`, `.eq('trader_id', getTraderId(GRADDOX))`,
      map `row.signals_data` → `GraddoxData.signals`. `GraddoxData.id` → `string` (uuid PK now).
- [ ] Optional cleanup (deferred): rename `fetchGraddox`/`useGraddox`/`GraddoxData` to
      signals-based names. The code spelling is already correct ("graddox"); names left as-is
      to keep this change contained — cosmetic only.

**3. CommentaryHistory merge** (`HoldingDetail.tsx`) — DONE:
- [x] Removed the standalone **Latest Comments** block and the separate **Conviction Notes**
      section; render one **Commentary** `HistorySection` (reuses `ConvictionTimeline` with the
      `excludeId` exclusion removed → shows all `conviction_comments` newest-first, with
      `+ Add Note`). `CommentRow` already shows conviction + date + source badges.
- [x] Moved **Transaction History** below Commentary (now the last section).
- [x] `fetchConvictionComments` → `.order('created_at', desc)`.
- [x] Removed `useLatestComment` (now orphaned → file deleted), `latestComment`, `excludeId`,
      and the unused `handleDeleteComment`/`CommentRow`/`useAuthStore`/`useQueryClient` in
      `HoldingDetail`.
- [x] **Browser-verified against the sandbox (2026-06-13):** logged into the admin app pointed
      at the sandbox — Commentary renders above Transaction History on the ADEA detail
      (conviction + date + source badges, `+ Add Note`), Transaction History moved to the
      bottom, no Latest/Notes split. Holds at 390px. Signals page reads `signals` correctly
      (bias "Bullish-revised", latest-by-date).

---

## Phase 2 — after `legs` backfill confirmed (with migrations 034–035)

### ✅ DONE 2026-06-14 — app reader rework (was the biggest, implied app change)

Implemented on `claude/schema-multi-leg`; typecheck + 30 unit tests green; both apps build;
**browser-verified against the sandbox** (ADEA mixed, CXDO long+short, BLDP closed+exercised+
spawned shares). Weighted-average %-P&L rollup confirmed (decided with the user); leg editing =
per-leg weight override only (no full leg CRUD).
- [x] **New `@stw/shared/utils/legs.ts`** — `Leg`/`LegTransaction` types + the %-model math:
      `legMark`, `legUnrealizedPnlPct`, `legPnlPct`, `holdingPnlPct` (**weight-weighted avg**),
      `holdingType`, `legMarkReason`, `fmtLegInstrument`, `fmtOptionExpiry`, `legIsOpen` (+ tests).
      **Deleted** `options.ts`/`pnl.ts` (+ their tests; the failing `mergeLegs` test is gone) and
      the three `position_detail` fns in `positions.ts` (kept the `Direction`/`PositionType` types).
- [x] **`picks/api.ts`** — `fetchHoldings` now `select('*, legs(*)')` (PostgREST nested embed, so
      legs travel with each holding); `Holding` interface trimmed of all dropped columns + `legs`
      added; `fetchHoldingTransactions` drops `.order('leg')`; `fetchMaxLeg` removed;
      `updateLegWeight` added.
- [x] **Trades tab / detail / dashboard / row / filters** re-sourced from `h.legs`
      (`TradesTable`, `HoldingDetail`, `PortfolioDashboard`, `HoldingRow`, `PicksView`,
      `filters.ts` type filter via `holdingType`). `TradeEditForm` → **per-leg weight editor**;
      `HoldingEditForm`/`TransactionEventForm` stripped of `position_detail`/`last_price`/leg fields;
      `TransactionTimeline` flat (no leg grouping / position columns).
- [x] **`HoldingTransaction` type** trimmed (`leg`/`position_detail`/`price`/`pnl_pct`/`direction`).
- [x] **`apps/web/.../useDataStatus.ts`** (was reading the to-be-dropped `holdings.last_pnl_at`)
      re-sourced to newest `legs.mark_price_at`.

> **✅ RESOLVED 2026-06-14 — `basket` → category read-swap done.** `fetchHoldings` now embeds
> `category:categories(name)` and sources the `Holding.basket` field from it (kept the field name —
> it's the UI vocabulary; `bColor`/filters/sector dist key off the same strings the categories were
> seeded from). Uncategorized rows fall back to `'Other'`. Verified on the sandbox: sector
> distribution, the basket filter (Defense → IRDM), and ARKK→'Other' all work. **034 may now drop
> `holdings.basket`.** Remaining data caveat: ensure every holding has a `category_id` before
> cutover (sandbox ARKK had a null `category_id` → relies on the 'Other' fallback). No in-app
> writer sets `basket`/`category_id` (the routines do, out of repo).

### Workstream 2 — Routines Phase 2

**`stw-morning-run` + `stw-afternoon-run`:**
- [ ] Stop writing `position_detail` to `holdings`
- [ ] Stop writing `exit_price` / `exit_pnl_pct` to `holdings` — write to the closed `legs` row
- [ ] Stop writing `last_action` / `action_date` / `current_weight` directly to `holdings` —
      insert a `holding_transactions` row instead; trigger 031 propagates upward
- [ ] Create a `legs` row for every new position
- [ ] Insert a `leg_transactions` row for every BUY / SELL / TRIM / EXERCISE / EXPIRE

**`stw-friday-weighting`:**
- [ ] Stop writing `current_weight` directly to `holdings`
- [ ] Write a `holding_transactions` row with `action='Hold'` + new `weight` — trigger 031
      updates `current_weight` and **preserves** `last_action`/`action_date` (weight-only
      carve-out). Do **not** use a real action verb for a weight-only refresh.
- [ ] May pass `initial_weight` unconditionally — the trigger protects it (write-once)

**Admin IBKR proxy — ✅ DONE 2026-06-14:**
- [x] The Supabase **writer is `IbkrBadge.tsx`** (the proxy is a pure pricer and never touched
      Supabase). `IbkrBadge` now collects OPTION legs from `h.legs` (carrying `leg_id`), and writes
      `legs.mark_price` / `mark_price_at` / `mark_price_source='IBKR'` per leg — no more
      `holdings.last_pnl_pct`/`last_pnl_at`/`ibkr_legs`. `ibkr_proxy.py` echoes `leg_id` back
      (docstring updated); `parseOptionLegs(position_detail)` removed from the badge.

### Routine docs (all three skills)
- [ ] Replace the contradictory conviction-notes language in `stw-transcripts` STEP 5 (and
      apply consistently to morning/afternoon) with the corrected paragraph in plan
      Workstream 3 (explicit curl INSERT incl. `trader_id`, no trigger/RPC, no archiving).

---

## CLAUDE.md updates (after cutover — plan §"CLAUDE.md updates required")
- [ ] Migration count 021 → 035
- [ ] Tables list: add `traders`, `channels`, `categories`, `legs`, `leg_transactions`,
      `spy_daily`; replace `graddox` with `signals`; remove `graddox_levels` (never existed)
- [ ] Writers table: add `legs` / `leg_transactions`; document the trigger inversion —
      `holding_transactions` now drives `holdings.last_action`/`action_date`/`current_weight`/
      `initial_weight` via trigger 031 (with the `'Hold'` weight-only carve-out)
- [ ] Remove references to `holdings.position_detail`, `ibkr_legs`, `last_pnl_pct`
- [ ] Admin IBKR proxy: writes `legs.mark_price`, not `holdings` columns
- [ ] Note `signals` keeps one row per trader per day; app reads latest by date
- [ ] Note all client inserts to `holding_transactions`/`conviction_comments` supply `trader_id`
