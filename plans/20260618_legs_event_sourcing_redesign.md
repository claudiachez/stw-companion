# Legs / Transaction History — Event-Sourcing Redesign (spec for review)

**Status:** DRAFT for review (2026-06-18). No code written yet. Supersedes the half-event-sourced
editor + the `plans/20260618_leg_transactions_redate.sql` one-off (folded in here).

## Why (root cause)

The schema (029/030) was *designed* event-sourced — `leg_transactions` is the source of truth, `legs`
is a trigger-derived projection. The *implementation* contradicts it: `PositionEditor` + the leg API
write `legs` **directly** (full state) and only *also* append a transaction. Result: **two competing
sources of truth** that fight on save, drift silently (edit a leg's entry without a status change → the
BUY row keeps the old price), and stamp **synthetic dates** (`executed_at = ${date}T13:00:00`). That is
the "it's all messed up" — structural, not patchable.

## Decisions (locked with host 2026-06-18)

1. **Commit to event-sourcing.** The editor writes **only diary entries** (`leg_transactions`). `legs`
   is purely trigger-derived; never hand-written. Transaction History = the editable ledger. Edit a row
   (or an open leg) → trigger recomputes the scoreboard → the two can't disagree.
2. **Instrument model:** `Instrument {Shares / Call / Put}` + `Direction {Long / Short}`. The form drops
   the separate "Right" field (Call/Put folds into Instrument).
3. **Default weight splits** (used when the host states only a position weight):
   - equity : options = **90 : 10** (mixed positions)
   - within the options bucket, short : long expiry = **20 : 80** (two option legs)
   - Defaults live in a **Configuration page** (admin), applied **forward** (past entries keep their
     weights). A position can carry its own equity:options ratio (host states it per ticker, e.g. ADEA
     30:70); blank → Config default.
4. **Trims book realized P&L** on the slice sold (weightᵦₑբₒᵣₑ − weightₐբₜₑᵣ), so Closed P&L reflects
   trims, not only full closes.

## Diary vs scoreboard (the mental model) — ADEA

`leg_transactions` (diary, ~7 rows, append-only = the host's actions) →
`legs` (scoreboard, 4 rows, all fields computed by replaying the diary; Shares + $35C Sep are the 2
open legs the current-position views show). See chat transcript 2026-06-18 for the full ADEA table.

---

## Schema changes (one migration, 040)

### `leg_transactions` (the diary) — additive
| Column | Type | Purpose |
|---|---|---|
| `host_quote` | text | the host's verbatim words ("Position Change" column). `notes` stays = curator annotation. |
| `action_label` | text | display verb: `New / Upsized / Trimmed / Closed / Exercised / Expired`. Editable. Defaults from the mechanical type when null. |

- `action_label` ↔ `action_type` mapping the editor uses:
  `New`/`Upsized` → `BUY`; `Trimmed` → `SELL` (weight>0); `Closed` → `SELL` (weight 0);
  `Exercised` → `EXERCISED`; `Expired` → `EXPIRED`.
- **No `REWEIGHT` event type.** See the Weight Model section — weekly weight drift updates the
  *position* weight only; per-leg current weights re-derive. The diary records only real trades.

### `legs` (the scoreboard) — no new state columns
Stops being written directly. `weight_overridden` (039) is kept = "pin this leg's weight, don't
auto-derive." All other fields trigger-derived.

### `holdings` — additive
| Column | Type | Purpose |
|---|---|---|
| `equity_pct` | numeric (0–1, nullable) | the equity share of the equity:options split for THIS position (0.30 = ADEA 30:70). Null → Config default (0.90). |

### New table `app_config` (drives the Configuration page)
Key-value, single source for tunable defaults; read at **write** time (applied forward):
`equity_options_default` (0.90), `options_short_long_default` (0.20 = short share). Admin-write RLS
(same JWT-email policy as `holdings`).

### Trigger 030 — rewrite
- Fire on **INSERT, UPDATE, DELETE** (today: INSERT only) so editing/deleting a diary row recomputes
  the scoreboard. DELETE uses `OLD.leg_id`.
- Replay all of a leg's events in `(executed_at, id)` order and derive:
  - `entry_price` = price of first BUY; `opened_at` = first BUY time; `initial_weight` = first BUY lot.
  - `weight` = **Σ BUY lots − sells** (running total). A **BUY ADDS its lot** (so two buys of 0.6% +
    1.4% make the leg 2.0%); a **SELL's weight is the leg's remaining** amount (0 on a full close).
    The per-row weight is the lot/remaining as the host stated it — never a running total.
  - `status` = OPEN unless the latest event is a full close / expire / exercise.
  - **Realized (incl. trims), computed in the replay loop:** for each SELL/EXPIRED, slice weight =
    prior running weight − this event's weight, slice % = `(price − entry)/entry × sign` (EXPIRED = −100%
    long). `legs.realized_pnl_pct` = the slice-weighted avg across the leg's SELL/EXPIRED events. A
    trimmed-but-open leg therefore carries realized (from its trims) *and* unrealized (on the remainder).
    No per-event realized column / second trigger needed (avoids recursion). Position Closed P&L weights
    by `initial_weight` (Phase 3), since fully-closed legs have current weight 0.
- **Edge case:** deleting a leg's only/opening event → forbid in the UI (delete the whole leg instead),
  or reset the leg to entry=null/OPEN. Decision: the editor's "delete leg" path deletes all tx + the leg
  (as today); single-row delete in the ledger is blocked when it's the leg's last remaining event.

---

## Weight model — initial vs current (no reweight noise)

Two stored, immutable INITIAL weights + a derived CURRENT weight at each grain. The weekly truth-up
never touches initial.

**Per-leg weight is the granular truth and the diary lots SUM to it; the position weight is their sum.**
The 90:10 / 20:80 split is the **default used to compute lot weights when the host states only a total** —
once lots are explicit (the rebuild case), the leg weight is just `Σ lots − sells`, no derivation.

> **CORRECTION 2026-06-18 (host-confirmed, shipped):** at the **position** grain the two displayed
> numbers are: **Initial = Σ the open legs' lots** (computed = `positionWeight().current`; tracks current
> lots, so it falls after a trim) and **Current = `holdings.current_weight`** — the live weight the
> routines restate weekly, **NOT** reconciled to Σ legs (they can legitimately differ — see the weekly
> truth-up open question). The old "Position Initial = `holdings.initial_weight` write-once / Current =
> Σ legs" row below is superseded. `holdings.initial_weight` is no longer displayed or written by the
> editor; the hand-typed Initial field was removed. The leg + diary rows are unchanged.

| | Initial weight | Current weight |
|---|---|---|
| **Position** (`holdings`) | ~~`initial_weight` write-once~~ → **Σ open legs' lots** (computed; see correction above). | ~~Σ open-leg weights~~ → **`holdings.current_weight`** (routine-written; see correction above). |
| **Leg** (`legs`) | `initial_weight` (037) = the **first BUY lot**. | `weight` = **Σ BUY lots − sells** (trigger 040). Trims reduce it; a full close → 0. |
| **Diary row** (`leg_transactions`) | — | `weight` = that event's **lot** (BUY) or **remaining** (SELL), as the host stated it. Immutable → the ledger's Weight column. |

Consequences:
- **Leg weight comes from the diary lots** (Σ BUY − sells); the position **Initial** = their sum. The
  position **Current** is the routines' live restatement and may differ from Σ legs (weekly truth-up Q).
- **Trims** are real trades (SELL with remaining>0): they reduce the leg and book the slice's realized.
- **The ledger's Weight column is per-event and immutable** — a `New` row keeps its lot forever; the
  detail view shows `initial → current` per leg from the stored initial + the summed current.
- **OPEN QUESTION (weekly truth-up):** when the Friday snapshot restates a position total that no longer
  equals the sum of lots, do we (a) scale the open lots proportionally, (b) treat the delta as an
  implied add/trim lot, or (c) just flag the mismatch for manual edit? (The 90:10/20:80 split only
  applies when the host gives a total with no per-leg detail.) — resolve before Phase 5 (routines).

---

## Shared logic (`@stw/shared`)

### `deriveLegWeights` rewrite
Inputs: `positionWeight`, legs (`instrument_type`, `option_expiry`, `weight`, `weight_overridden`),
`equityPct` (holding or Config default), `shortShare` (Config default 0.20). Rules:
- shares-only → 100% to shares.
- options-only → split the options bucket by expiry. **Exactly 2 legs → short:long via `shortShare`**
  (sort by expiry; nearest = short). **>2 legs → even split** (see Open Question 1).
- mixed → `equityPct` to the shares bucket, `1−equityPct` to options; options bucket split as above.
- Pinned legs (`weight_overridden`) keep their stored weight, are excluded from their bucket, and the
  remainder splits across the non-pinned legs in that bucket (already implemented this way).

### New presentation helpers
- `closedPnlPct(legs)` — weight-weighted realized across closed/trimmed slices (Closed P&L).
- `txActionVerb(tx, ctx)` — derive `action_label` default when null.
- per-row ledger formatter (asset type, option details, price, weight).

---

## UI changes

### Configuration page (admin, new)
Minimal admin route: edit `equity_options_default` + `options_short_long_default`. (Seeds the broader
"Manage" area deferred in CLAUDE.md Next Steps #5 — kept narrow for now.)

> **Decision (2026-06-18):** leg add/edit/trim/close lives ONLY in the ledger (one edit surface).
> The modal shows open legs read-only. The inline 2-line leg-edit form in the modal is **deferred** to
> a future feature (revisit only if day-to-day use proves it's needed — it reopens the multi-lot
> "set current weight" ambiguity, which the per-lot ledger avoids).

### PositionEditor (rewrite — events-only)
- Shows position fields + **open legs only**.
- Per-leg form, 2 lines:
  - Line 1: `Instrument {Shares/Call/Put}` · `Strike` · `Direction {Long/Short}` · `Expiry`
    (Strike/Expiry hidden for Shares).
  - Line 2: `Entry` · `Status` · `Current Weight %` · `Exit` (Exit only when Status = Closed).
- Save **writes diary entries, never `legs`**: new leg → BUY event; weight change on an open leg →
  REWEIGHT event(s) (re-derived from the position weight unless pinned); close/expire/exercise → the
  matching close event. The trigger derives the scoreboard.
- Per-position `equity_pct` field (blank = Config default).

### Transaction History (LegTimeline → editable ledger)
- Columns: `Date · Action · Asset Type · Option Details · Entry/Exit · Weight · Position Change (his
  words) · Notes`, with an **edit + delete icon per row**.
- Edit opens the same diary-row form (action, price, weight, date, host_quote, notes); save fires the
  trigger. Delete removes the event (blocked if it's the leg's last event — see trigger edge case).
- **Mobile:** an 8-column table won't fit ≤390px → stacked card per row on mobile, table on desktop
  (CLAUDE.md mobile-first rule).
- Sort: newest-first by default (see Open Question 2).

### HoldingDetail (detail view)
- **Open P&L + Closed P&L** both shown; Closed P&L appears whenever any leg is closed **or trimmed**
  (driven by `closedPnlPct`).
- **Entry / Current Weight:** one leg per line, **open legs only** (no 0% closed-leg noise).
- **P&L Breakdown:** **open legs only** (filter `optionLegs`/`shareLegs` to open).

---

## Routines (out-of-repo `~/Documents/Claude/Scheduled/*`) — follow-on
Extend the weight-model edits already made: write `host_quote` + `action_label`; use `REWEIGHT` for the
Friday weekly weighting truth-up (per-leg reweight events) instead of relying on direct weight writes;
read `app_config` + `holdings.equity_pct` for the split. Keep `weight_overridden` respected.

## Data reset + clean import (host is rebuilding all OPEN positions from Excel)

The host is reconstructing every open position as an Excel ledger (the ADEA-sample format). So instead
of migrating the rebuilt-but-messy `leg_transactions`, we **wipe and re-import cleanly**:

- **Wipe:** delete **all `leg_transactions`**; delete all **OPEN** legs (they're re-imported fresh).
- **Closed positions are kept** but lose their evolution detail (host's explicit choice). To stay
  uniformly event-sourced, synthesize a **minimal 2-event diary per closed leg** from its stored state —
  a `BUY` @ `entry_price`/`opened_at` + a close (`SELL`/`EXPIRED`) @ `exit_price`/`closed_at` — so the
  rewritten trigger reproduces their final state. (Alternative: leave closed legs frozen with an empty
  diary. Recommended: synthesize, for model uniformity.)
- **Import** (one row per host action, grouped into legs by ticker + contract):
  | Excel column | → |
  |---|---|
  | Date/Time | `executed_at` (true date) |
  | Ticker | leg `ticker` (+ resolve/insert the holding) |
  | Action | `action_label` (+ mechanical `action_type`) |
  | Asset Type (Shares/Call/Put) | `instrument_type` + `option_right` |
  | Option Details ("$30C for June") | `option_strike` + `option_expiry` (parse; resolve month → 3rd Fri) |
  | Entry/Exit Price | `price` |
  | Position Weight | the leg's `weight` snapshot for that diary row |
  | Position Change | `host_quote` |
  | Notes | `notes` |

  Insert `legs` (structural) + `leg_transactions` (diary); the trigger derives entry/exit/status/
  realized. Unstated per-leg weights fall back to `deriveLegWeights`.

- **Import mechanism — TBD when the Excel arrives** (not blocking Phase 1): either (a) I parse the
  Excel and generate a one-time seed SQL the host applies, or (b) a reusable admin CSV-import tool. Lean
  (a) for the one-time rebuild unless the host wants to re-import repeatedly.
- This **supersedes** `plans/20260618_leg_transactions_redate.sql` for open positions (re-imported with true
  dates); closed legs get true dates from their synthesized diary.

## Migration / rollout sequencing
1. **Phase 1:** migration 040 (schema + trigger 030 rewrite) + `deriveLegWeights` rewrite + shared
   helpers + unit tests, on `claude/legs-event-sourcing` off `staging`. Reviewable before any UI.
2. Keep 038 (RLS fix) + 039 (weight_overridden) — still valid; apply alongside 040.
3. **Data reset + clean import** (above) — after 040 is applied and the host's Excel is ready.
4. Phase 2 (editor + ledger), Phase 3 (detail view), Phase 4 (Config page + per-position `equity_pct`).
5. Phase 5 — routines updated to the new fields.
6. 034/035 (drop deprecated holdings cols) — still independent; sequence after, unchanged.

> **Current weight is derived at read time** (`deriveLegWeights(holdings.current_weight, …)`), honoring
> pins; `legs.weight` stores only pinned overrides. Trigger 030 derives structure/entry/exit/status/
> realized/`initial_weight` — **not** current weight. So the weekly truth-up touches only the position
> weight and every leg's current weight follows, with no leg writes and no ledger rows.

## Resolved (host, 2026-06-18)
1. **>2 option legs** → **even split** across the options bucket; pin individual legs for specifics.
2. **Ledger sort** → **newest-first**.
3. **Config page scope** → **just the two ratios** now; defer categories/traders.
4. **Weekly reweights** → **no reweight rows.** Position weight updates; per-leg currents re-derive;
   initial weight is preserved write-once. The ledger shows only real trades (see Weight Model).
