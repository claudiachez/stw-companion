# Workstream 2 — Routine SKILL.md Edits (DRAFT)

Companion to `cutover_change_checklist.md` (§Workstream 2) and `schema_migration_plan_v4.md`
(§Workstream 2). **Nothing in here is applied** — the five cron skills live **out of this repo**
at `~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/`
just delegate to those). This is the exact, line-level worklist; the user confirms before any
SKILL.md is touched.

The five skills:

| Skill | File |
|---|---|
| `graddox-daily-summary` | `~/Documents/Claude/Scheduled/graddox-daily-summary/SKILL.md` |
| `stw-morning-run` | `~/Documents/Claude/Scheduled/stw-morning-run/SKILL.md` |
| `stw-afternoon-run` | `~/Documents/Claude/Scheduled/stw-afternoon-run/SKILL.md` |
| `stw-friday-weighting` | `~/Documents/Claude/Scheduled/stw-friday-weighting/SKILL.md` |
| `stw-transcripts` | `~/Documents/Claude/Scheduled/stw-transcripts/SKILL.md` |

**Two phases, applied at different times:**
- **Phase 1** ships at the cutover window (with migrations 022–033). All five skills change
  *simultaneously* — the first post-cutover run fails otherwise (`on_conflict=ticker` breaks on
  the new composite PK; `channel` text column is gone; `graddox` table/`signals` column renamed).
- **Phase 2** ships *after* the `legs` backfill is confirmed (with 034/035). This is the structural
  rewrite: stop writing `position_detail`/`last_action`/`current_weight`/`exit_*` to `holdings`;
  write `legs` + `leg_transactions` + `holding_transactions` rows instead.

---

## 0 — UUID resolution at cutover (do this first)

Every payload below needs a real UUID. They are **environment-specific** and finalized on the
Supabase **preview branch** at cutover (022 seeds traders; 023 seeds channels with fresh
`gen_random_uuid()`s). Resolve them once against the cutover target and paste in. Run these with
the service-role key (`$(cat /Users/claudiachez/Documents/Claude/Scheduled/.supabase-service-key)`)
against the **preview branch URL** (not prod, until merge):

```bash
# Trader UUIDs (exist after 022)
curl -s "<PREVIEW_URL>/rest/v1/traders?select=name,id" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Channel UUIDs (exist after 023)
curl -s "<PREVIEW_URL>/rest/v1/channels?select=channel_name,discord_channel_id,id" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Fill this table, then every `<…>` placeholder below resolves:

| Placeholder | Resolves to | Source |
|---|---|---|
| `<STW_UUID>` | `traders.id where name='STW'` | 022 |
| `<GRADDOX_UUID>` | `traders.id where name='Graddox'` | 022 |
| `<CH_LIVE_NOTES>` | channel `1229546005788098580` (live-notes-portfolio) | 023 |
| `<CH_UPDATES>` | channel `1503874839599911073` (updates-portfolio) | 023 |
| `<CH_STREAM>` | channel `1441560421822627860` (stream-library-stw) | 023 |
| `<CH_GRADDOX>` | channel `1149448308293632110` (graddox) | 023 |

> Note: the plan text calls the GEX channel "graddox-vip"; migration 023 seeds it as
> **`graddox`** (discord id `1149448308293632110`). The `channel_id` is what matters — resolve by
> discord id, not name.

---

# PHASE 1 — at cutover (migrations 022–033)

Mechanical payload/URL edits. No logic restructure. Grouped by change, then itemized per file.

## P1.1 — `holdings` upserts: add `trader_id` + composite `on_conflict`

After 025 the `holdings` PK is `(ticker, trader_id)`. Every `holdings` POST must (a) include
`"trader_id":"<STW_UUID>"` in the JSON body and (b) target the composite key explicitly via
`?on_conflict=ticker,trader_id` on the URL (the current curls have **no** `on_conflict` param —
they rely on the old single-column PK default).

**`stw-morning-run`** — STEP 2.3 position upsert (~line 101) and the thesis-refresh upsert
(~line 138):
```
- POST ".../rest/v1/holdings"
+ POST ".../rest/v1/holdings?on_conflict=ticker,trader_id"
  -d '{"ticker":"TICKER", "trader_id":"<STW_UUID>", ...rest unchanged...}'
```

**`stw-afternoon-run`** — STEP 3 upsert (~line 58), thesis-refresh upsert (~line 89 prose +
shared curl), and the STEP 3b Close upsert (~line 111): same two changes on each.

**`stw-friday-weighting`** — STEP 4 weight upsert (~line 56): same two changes.

**`stw-transcripts`** — STEP 5 thesis-refresh upsert (~line 234): same two changes.

> Phase 1 keeps these `holdings` upserts writing `last_action`/`current_weight`/`position_detail`
> exactly as today — those moves are **Phase 2**. Phase 1 only adds `trader_id` + `on_conflict`.

## P1.2 — `conviction_comments` inserts: add `trader_id`

After 026, `conviction_comments.trader_id` is NOT NULL. Add `"trader_id":"<STW_UUID>"` to every
insert body (the comment `source` already resolves correctly — `discord`/`streaming`).

- **`stw-morning-run`** — STEP 2.3 "(1) Append the comment" (~line 122)
- **`stw-afternoon-run`** — STEP 3 "(1) Append the comment" (~line 79)
- **`stw-transcripts`** — STEP 5 "(1) Append the comment" (~line 216)

```
  -d '{"ticker":"TICKER", "trader_id":"<STW_UUID>", "event_date":"…","conviction_level":…,"comment":"…","source":"discord","user_id":null}'
```

## P1.3 — `run_log` writes + high-water-mark reads: `channel` → `channel_id`

After 027 the `run_log.channel` text column is dropped and replaced by `channel_id` (FK).
Every **write** swaps the `"channel":"<name>"` body field for `"channel_id":"<CH_*>"`, and every
**high-water-mark read** swaps the `channel=eq.<name>` query filter for `channel_id=eq.<CH_*>`.

**Reads (`select=last_message_ts&channel=eq.…` → `&channel_id=eq.…`):**

| File | Location | `<name>` | → |
|---|---|---|---|
| `stw-morning-run` | STEP 2.1 (~line 37) | `live-notes-portfolio` | `<CH_LIVE_NOTES>` |
| `stw-morning-run` | PART 3 (~line 184) | `stream-library-stw` | `<CH_STREAM>` |
| `stw-afternoon-run` | STEP 1 (~line 25) | `live-notes-portfolio` | `<CH_LIVE_NOTES>` |
| `stw-afternoon-run` | STEP 4 (~line 132) | `stream-library-stw` | `<CH_STREAM>` |
| `stw-friday-weighting` | STEP 1 (~line 23) | `updates-portfolio` | `<CH_UPDATES>` |
| `stw-transcripts` | STEP 1 (~line 43) | `stream-library-stw` | `<CH_STREAM>` |

**Writes (`"channel":"<name>"` body field → `"channel_id":"<CH_*>"`):**

| File | Location | → |
|---|---|---|
| `stw-morning-run` | STEP 2.4 (~line 167) | `<CH_LIVE_NOTES>` |
| `stw-afternoon-run` | STEP 5 (~line 160) | `<CH_LIVE_NOTES>` |
| `stw-friday-weighting` | STEP 5 (~line 78) | `<CH_UPDATES>` |
| `stw-transcripts` | STEP 6 (~line 254) | `<CH_STREAM>` |

> `run_log` is not otherwise re-keyed in Phase 1 — only the channel reference changes.

## P1.4 — `graddox-daily-summary`: `graddox` table → `signals` (migration 028)

STEP 5 (~lines 130–181). Five edits to the write:

1. **Endpoint** (~line 174): `/rest/v1/graddox` → `/rest/v1/signals?on_conflict=trader_id,date`
   (the `on_conflict` is required — `signals_trader_date_unique` backs it; without it PostgREST
   rejects the merge-duplicates upsert).
2. **Drop `"id": 1`** from the payload entirely (~line 140) — `id` is now a uuid default.
3. **Add `"trader_id":"<GRADDOX_UUID>"`** to the payload.
4. **Rename the payload key** `"signals": [...]` → `"signals_data": [...]` (~line 162).
5. **`"date"` is mandatory** (already in the payload at ~line 141 — keep it, and emphasize in the
   prose that a NULL `date` never conflicts and silently duplicates the day's row).

Resulting payload skeleton:
```json
{
  "trader_id": "<GRADDOX_UUID>",
  "date": "YYYY-MM-DD",
  "last_updated": "YYYY-MM-DDTHH:MM:SS-04:00",
  "bias": "...", "bias_note": "...",
  "spx_price": null, "qqq_price": null,
  "spx": { ... }, "qqq": { ... },
  "signals_data": [ { "trigger":"...", "trade":"...", "exp":"M/DD", "logic":"...", "verdict":"..." } ],
  "log": [ { "time":"H:MM AM", "content":"..." } ]
}
```
And the curl header line keeps `Prefer: resolution=merge-duplicates,return=representation`.

> The "VERIFY THE WRITE" prose (~line 181) still holds verbatim — only the table name in the
> sentence ("writes to `graddox`") should read `signals`.

## P1.5 — `graddox-daily-summary`: add a `run_log` row (DECIDED: add it)

The GEX step currently writes **no** `run_log` row (it just reads the 2 newest graddox messages,
no high-water mark). Decision: **add one** so the GEX channel has an audit + high-water mark like
every other channel. Add a new final step (after the `signals` write in STEP 5) — and because
`graddox-daily-summary` runs both standalone ("discord summary") *and* via `stw-morning-run` PART 1,
put the write **in `graddox-daily-summary` itself** so both paths log it:

```bash
curl -s -X POST ".../rest/v1/run_log" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"run_type":"graddox","channel_id":"<CH_GRADDOX>","last_message_ts":"<newest graddox msg ts>","last_message_id":"<id>","messages_processed":<n>,"status":"ok","summary":"GEX bias <bias> — signals row saved (date <date>)"}'
```
- `run_type` = `"graddox"` (new value — confirms it's distinct from morning/afternoon/friday/transcripts).
- `last_message_ts`/`last_message_id` = the newest graddox message processed this run.
- Verify non-empty `return=representation` body, same as every other write.
- Gating the GEX read on this high-water mark is **optional/future** — for now the row is an audit
  mark; the skill keeps reading the 2 newest messages as today.

> `stw-morning-run` PART 1 needs no separate run_log write — delegating to `graddox-daily-summary`
> (which now writes its own row) covers it. Update PART 1's prose only to note the graddox run_log
> row is written by the delegated skill.

---

# PHASE 2 — after legs backfill (migrations 034–035)

This is the structural change. Migrations 034/035 drop `holdings.position_detail`/`last_price`/
`last_price_at`/`last_pnl_pct`/`last_pnl_at`/`ibkr_legs`/`exit_price`/`exit_pnl_pct`/`basket` and
`holding_transactions.position_detail`/`price`/`pnl_pct`/`leg`. After they land, any routine still
writing those columns throws "column does not exist". The position/weight/action state now flows
**through events**, not direct `holdings` writes.

## P2.0 — The new write model (read before editing)

Three invariants, derived from the actual migration files (029/030 size-less %-model, 031/033/036):

1. **`legs` are size-less.** Columns: `entry_price`, per-leg `weight` (%), `mark_price`,
   `exit_price`, `realized_pnl_pct`, `status`, `direction`, `instrument_type`,
   `option_strike`/`option_expiry`/`option_right`, `parent_leg_id`. **No share/contract counts.**
   P&L is a percentage. The routine **never** writes derived leg fields directly — it inserts
   `leg_transactions` and the 030 trigger derives `entry_price`/`weight`/`status`/`exit_price`/
   `realized_pnl_pct`/`opened_at`/`closed_at`/`close_reason`.

2. **`leg_transactions` is a quantity-free event log.** Columns: `leg_id`, `trader_id`,
   `action_type` (`BUY`/`SELL`/`EXERCISED`/`EXPIRED`), `price`, `weight` (leg weight *after* the
   event), `close_reason`, `executed_at`, `notes`. The 030 trigger (`fn_sync_leg_from_transaction`)
   recomputes leg state from **all** of the leg's events (replay-safe), so:
   - `BUY` → opens/adds; `entry_price` = price of the earliest BUY; leg `OPEN`.
   - `SELL` with `weight > 0` → partial trim, leg stays `OPEN`, weight updated, **no realized booked**
     (can't size the slice without counts).
   - `SELL` with `weight = 0` → full close: `CLOSED`, `exit_price` = event price,
     `realized_pnl_pct = (exit − entry)/entry × 100` (× −1 for short).
   - `EXPIRED` → `EXPIRED_WORTHLESS`, exit 0, realized −100% long / +100% short.
   - `EXERCISED` → `EXERCISED`, `realized_pnl_pct = NULL`; the routine then opens a **new SHARES
     leg** with `entry_price = strike + premium` and `parent_leg_id` = the option leg's id.

3. **`holdings` action/weight is trigger-driven (031).** The routine **stops** writing
   `last_action`/`action_date`/`current_weight`/`initial_weight` to `holdings`. Instead it inserts
   a `holding_transactions` row and trigger 031 propagates upward. A row with `action='Hold'` is the
   **weight-only** signal (updates `current_weight`, preserves `last_action`/`action_date`).
   `holding_transactions` insert columns: `ticker`, `trader_id`, `action`, `event_date`, `weight`,
   `notes`; **upsert** on `on_conflict=ticker,trader_id,action,event_date` (migration 036 — mirrors
   the app's `insertHoldingTransaction`). Trigger 031 only **UPDATE**s `holdings` — it never inserts
   the holdings row, so a brand-new position still needs a direct `holdings` INSERT first (identity +
   thesis + `category_id`), and the `legs` FK requires that holdings row to exist.

### Canonical event ordering per host action

| Host action | Routine writes (in order) |
|---|---|
| **New position** | 1. `holdings` upsert (identity + `category_id` + thesis cols; **no** last_action/weight) → 2. `legs` row per share-lot/option leg → 3. `leg_transactions` `BUY` per leg (price + weight) → 4. `holding_transactions` `{action:'New', weight, event_date}` (031 sets last_action/action_date/current_weight/initial_weight) → 5. `conviction_comments` if notable |
| **Upsize** | `leg_transactions` `BUY` on the affected leg(s) with the new post-event `weight` → `holding_transactions` `{action:'Upsized', weight}` |
| **Trim** | `leg_transactions` `SELL` with `weight = new (>0)` → `holding_transactions` `{action:'Trimmed', weight}` |
| **Close (full)** | `leg_transactions` `SELL` `weight=0` (+ `price` = exit; trigger books `exit_price`/`realized_pnl_pct` on the leg) on each open leg → `holding_transactions` `{action:'Closed', weight:0}`. **No** `exit_price`/`exit_pnl_pct` on `holdings`. |
| **Expire** | `leg_transactions` `EXPIRED` on the option leg → `holding_transactions` if it changes the holding's action/weight |
| **Exercise** | `leg_transactions` `EXERCISED` on the option leg → insert spawned `legs` SHARES row (`entry_price=strike+premium`, `parent_leg_id`) → `leg_transactions` `BUY` on the new shares leg → `holding_transactions` as needed |
| **Weight-only (Friday / nudge)** | `holding_transactions` `{action:'Hold', weight}` only — 031 updates `current_weight`, preserves last_action/date. (Optionally a per-leg `leg_transactions` weight event if the host re-states per-leg weights.) |

> **Weight is the only sizing input.** When the host doesn't state per-leg weight on a multi-leg
> position, apply the **90/10 default** (mixed = 90% shares / 10% split across option legs;
> options-only = even split; shares-only = 100%) — the same rule `legs.ts`/the backfill use. Admin
> can override per leg in the app.

## P2.1 — `stw-morning-run` + `stw-afternoon-run`

Both share the same STEP 2.3 / STEP 3 ("Apply portfolio changes") + Close handling. Rewrite that
section to the event model above. Concretely:

- **Remove** the `position_detail` format block (morning ~lines 73–83; afternoon ~line 46) — there
  is no `position_detail` column after 034. Replace with: "parse each leg (shares lot / option leg
  with strike·right·expiry) and emit a `legs` row + `BUY` `leg_transaction` per leg; resolve
  month-only expiries to the 3rd Friday; apply the 90/10 weight default when unstated."
- **Replace** the holdings position upsert (morning ~line 101; afternoon ~line 58) per the
  ordering table: keep a `holdings` upsert **only** for a New position's identity/thesis/`category_id`,
  and route all action/weight through `holding_transactions` + `leg_transactions`.
- **Delete** the Close exit-price logic that writes `exit_price`/`exit_pnl_pct` to `holdings`
  (afternoon STEP 3b ~lines 94–118; morning ~lines 149–155). The Finnhub quote is still used — but
  now as the `price` on the closing `SELL` `leg_transaction` (the 030 trigger computes
  `realized_pnl_pct` on the leg from entry→exit). `holding_transactions` `{action:'Closed',weight:0}`
  drives `holdings`.
- **Add** the `legs`/`leg_transactions` curl templates (service-role auth, `return=representation`,
  verify non-empty) and the `holding_transactions` upsert template
  (`on_conflict=ticker,trader_id,action,event_date`).
- **Thesis refresh** upsert stays (summary/bullets/conviction/dd_updated_at) — but see **P2.3**
  (`basket` → `category_id`).

## P2.2 — `stw-friday-weighting`

- **STEP 4** (~line 56): stop writing `current_weight` directly to `holdings`. Instead insert a
  `holding_transactions` row `{action:'Hold', weight:<snapshot>, event_date}` per ticker — trigger
  031 updates `current_weight` and **preserves** `last_action`/`action_date` (weight-only carve-out).
  Do **not** use a real action verb for a weight-only refresh.
- `initial_weight`: may be passed unconditionally — 031 is write-once (sets only when null).
- A ticker in the snapshot but **not yet** in `holdings` (~line 66): same New-position sequence as
  P2.1 (insert holdings identity row first, then the `holding_transactions` 'New' row).
- STEP 3's "before" weight read (`select=ticker,current_weight`) still works — `current_weight`
  remains a `holdings` column (now trigger-maintained). Add `trader_id` filter if disambiguating.

## P2.3 — `basket` → `category_id` (both daily runs + Friday new-position path)

Migration 034 drops `holdings.basket`; the app now reads `basket` from the `categories` join. The
routines currently write `basket` text (morning ~line 89). After 034 they must resolve/insert a
`categories` row and write `category_id` on the `holdings` upsert instead:

```bash
# resolve (or create) the category for STW, then use its id on the holdings upsert
curl -s ".../rest/v1/categories?on_conflict=trader_id,name" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '{"trader_id":"<STW_UUID>","name":"Semiconductors"}'   # returns the id
```
Then `"category_id":"<id>"` on the holdings upsert (not `"basket":"…"`).

> **DECIDED: the routine owns category creation.** It upserts the category by `(trader_id, name)`
> and writes the returned `category_id`, so a new theme auto-appears in the basket filter. Keep the
> theme vocabulary consistent with the seeded set (AI Infrastructure, Semiconductors, Space &
> Defense, Biotech, Fintech, Energy, Consumer Tech, Hedge, Other) so colors in `baskets.ts` resolve;
> only coin a genuinely new theme name when the host clearly introduces one.

## P2.4 — Admin IBKR proxy — already done (no routine edit)

For reference: the `legs.mark_price`/`mark_price_source='IBKR'` writer is **`IbkrBadge.tsx`** (app
code, done 2026-06-14). `ibkr_proxy.py` stays a pure pricer that echoes `leg_id`. No SKILL.md edit.

---

# DOC CLEANUP — stale "auto-archive trigger" language (all skills)

`stw-transcripts` still describes conviction notes as trigger/auto-archived, contradicting its own
STEP 5 body. Fix to match the corrected paragraph (plan §Workstream 3):
- **Header** (~lines 13–16): "the **previous note is auto-archived to the conviction history**" →
  conviction notes are explicit `conviction_comments` inserts; the dashboard renders all rows
  newest-first (no archiving, no trigger).
- **Context** (~line 26): "`conviction_comments` (written **automatically** by a trigger — see
  STEP 5)" → "written explicitly via curl — one INSERT per ticker; no trigger, no RPC."
- **STEP 7 confirm block** (~line 271): "prior note archived to history" → "added to commentary".

Morning/afternoon already use the correct explicit language — no change there beyond Phase 1/2.

---

# RESOLVED DECISIONS

1. **Graddox `run_log`** — DECIDED: **add** a `run_log` row (see P1.5), `run_type='graddox'`,
   `channel_id=<CH_GRADDOX>`. Written by `graddox-daily-summary` so both standalone and morning-run
   paths log it.
2. **`category_id` ownership (P2.3)** — DECIDED: the **routine creates** categories (upsert by
   `(trader_id, name)`), keeping to the seeded theme vocabulary so `baskets.ts` colors resolve.

# REMAINING NOTES (verify at cutover, no decision needed)

- **Phase 2 re-entrant audit row.** Under 031, inserting a `holding_transactions` row drives
  `holdings`; the 033 re-fire is deduped by `(ticker,trader_id,action,event_date)`. The routine's
  `holding_transactions` upsert uses the same key — confirmed safe, but worth one live smoke-test on
  the preview branch (one New + one Hold + one Closed) before resuming cron.
- **`channel` naming.** 023 seeds the GEX channel as `graddox` (plan says "graddox-vip"). Cosmetic —
  `channel_id` resolves by discord id `1149448308293632110`. Flagged only so the seed name isn't
  "corrected" by mistake.

---

# VERIFICATION (first post-cutover runs)

- **Phase 1:** first morning + afternoon + (Friday) + a graddox run each return non-empty
  `return=representation` bodies; `signals` row lands with correct `trader_id`+`date`; `run_log`
  rows carry `channel_id`; `holdings` upserts hit the composite PK (no duplicate ticker rows per
  trader).
- **Phase 2:** a New position produces 1 holdings row + N legs + N `BUY` leg_transactions + 1
  `holding_transactions` 'New' (and `holdings.current_weight`/`last_action` set by 031); a Close
  books `realized_pnl_pct` on the leg and sets `holdings.last_action='Closed'` with no
  `exit_price`/`position_detail` write; a Friday 'Hold' updates weight only.
