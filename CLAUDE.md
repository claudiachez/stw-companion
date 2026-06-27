# STW Companion — Claude Code Guide

> **⚠️ START HERE — branch.** **`staging` is the active trunk** — all feature work happens here.
> As of **2026-06-23** `main` was brought **level with `staging`** (the event-sourcing migration plan
> was completed and promoted), so a fresh clone is current — migrations run to **046**; if migrations
> stop at 021 you are on a stale checkout, re-sync. **First command every session:**
> `git fetch origin && git checkout staging && git pull --ff-only`.
> Feature branches cut from `staging`, PR to `staging`. `main` is promoted only by an approved
> staging→main PR (= a production deploy). (Note: `memory/` lives in local `~/.claude/`, NOT in the repo —
> never reference it in a prompt meant for a remote session; put anything a future session needs into the repo.)

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never force-push or reset `staging` or `main`
- Never push to `main` without explicit approval — that is production
- Write shared styling/logic/data **once** in the shared packages, never twice across apps
- **Every timestamp uses `fmtDateTime` from `@stw/shared`** — never `toLocaleString`/`toLocaleTimeString` or a local date helper (see Conventions → Timestamps)
- **All UI changes must work on mobile** — design for ≤390px first; test layouts at narrow width before pushing
- **After ~10 commits in a chat**, run the Session Close routine (see section below)

---

## Current Status — GEX staleness disclosure + missed-alerts routine fix + manual PROD corrections (handoff 2026-06-26 PM)

**NEXT SESSION = build the Macro Dashboard** — full spec on staging at
[`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md) (read first). New **Macro** nav tab
(Environment block + Sentiment Gauge first), then a **Portfolio Heatmap** block on `PortfolioDashboard`.
See Next Steps #1.

**This session — shipped on `staging` (PRs #54 reverted-in-place, #55): GEX "no new report" disclosure
(migrations 045/046), a routine-miss diagnosis + fix, and manual SYNA/GDYN/TENB corrections on PROD.**
- **GEX Signals "no new report" banner** ([`SignalsView.tsx`](packages/ui/src/features/signals/SignalsView.tsx)
  + `signals.status_note`, migration `045`). When the latest read's `date` < today (ET), the subheader leads
  with "No new report · Last GEX read: \<bias\> \<M/D\>" + a host-set note (e.g. "Morning prep resumes 7/7").
  A first attempt put a "last checked" line on the Portfolio **Overview** — wrong place, reverted; the
  `latest_run` view (044) it used was dropped (migration `046`).
- **Routine miss diagnosed + fixed (out-of-repo SKILLs).** The 6/26 afternoon run advanced the live-notes
  high-water mark PAST SYNA-close / TENB-DD / GDYN-close without processing them — **incomplete Discord
  scrollback** (read the newest screenful, never scrolled back to the prior mark). Added to morning/afternoon:
  a **completeness rule** (scroll back to the prior mark, process EVERY message in the gap, advance the mark
  only after); **alert-obfuscation interpretation** (host disguises actions to fool copy-bots — read intent,
  not the verb; GDYN worked example); **research name-only tickers** (CCXI = "Agility Robotics SPAC");
  **business-only comments**; and the GEX break `status_note` set/clear.
- **Manual PROD corrections** (the 3 missed, applied via the event-sourcing model + verified): **SYNA** Closed
  (shares +49.4%, $85C +352.6% — ON Semi acquisition), **GDYN** Closed (shares −18.6%, stopped out;
  revisit-before-earnings saved as commentary), **TENB** split fixed 90:10→80:20 + full DD added (new
  `TENB.md`); **basket "AI Fraud / Verified Identity" → "AI Security & Fraud"**.

**DB state — migrations 045 + 046 applied to BOTH PROD (`usmqbohcjcyszjxxvnqu`) and SANDBOX
(`uolabcgbnrkhzpwuvzlk`)** — `signals.status_note` exists, `latest_run` view dropped. The manual
SYNA/GDYN/TENB/basket corrections are **PROD-only** (live position data; sandbox is stale dev data).
(Carried-over sandbox gap from last session: the `prev_conviction_level` backfill was never run on sandbox.)

**⏳ PENDING — production deploy:** everything since the last promotion is on **`staging`, NOT `main`**
(PRs #50–#55). Promoting `staging → main` is the production deploy and needs **explicit approval** (the PROD
*database* already has the additive columns; old production code ignores them, so nothing is broken meanwhile).

**Event-sourcing migration plan is CLOSED (on `main` since 2026-06-23) — do not reopen.** The weight model,
locked decisions, and Phase-5 routine semantics below remain authoritative reference.

**Why:** the old editor was split-brain — it wrote BOTH `legs` (directly) and `leg_transactions`, which
fought on save, diverged, and stamped synthetic dates. Now committed to **true event-sourcing**:
`leg_transactions` (**the diary**) is the only hand-written source; `legs` (**the scoreboard**) is a pure
trigger-derived projection. The editor + ledger write ONLY events.

**Weight model (host-confirmed, corrected 2026-06-18):** a diary row's `weight` = that leg's **lot**
(BUY) or **remaining** (SELL, 0 on full close). **BUYs accumulate** → `legs.weight = Σ BUY lots − sells`.
So **Initial position weight = Σ open legs' lots** (computed from the diary = `positionWeight().current`;
tracks current lots, falls after a trim) and **Current position weight = `holdings.current_weight`** —
the live weight **the routines restate weekly** (NOT Σ legs). Both display read-only in the editor; the
hand-typed `initial_weight` field is gone and the editor no longer writes `initial_weight`/`current_weight`
(routines own current; legs own initial). The earlier "Current = Σ open legs; Initial = typed" wording was
wrong — host confirmed the swap. The 90:10 (equity:options) / 20:80
(short:long) split is only the **default** for computing lots when the host gives a total with no per-leg
detail — held in `app_config`, with a per-position override on `holdings.equity_pct`.

**Phase 1 DONE ✅ + verified on SANDBOX** (`040_sandbox_verify.sql`):
- **Migration `040_legs_event_sourcing.sql`** — `leg_transactions += action_label`; `holdings +=
  equity_pct`; new `app_config` table (split defaults 0.90 / 0.20); **trigger 030 rewritten** to fire on
  INSERT/UPDATE/DELETE, replay the diary, accumulate BUY lots, and **book realized on trims** (slice-weighted).
  Requires **037 + 039** first. (`host_quote` was added then removed — Notes is the single field.)
- `@stw/shared`: `deriveLegWeights` rewritten (90:10 / 20:80, expiry-aware, pins preserved) + new
  `positionWeight()` (Σ open legs). 45 tests green.

**Phase 2 DONE ✅ + verified on SANDBOX (browser):**
- **`PositionEditor`** = position fields + `equity_pct`; **Current weight computed** (read-only), **Initial
  weight editable**; open legs shown read-only (leg CRUD lives in the ledger — one edit surface).
  "Last Action Date" label; each open leg shows its open date.
- **`LegTimeline` = editable Transaction History ledger** (writes only `leg_transactions`): `+ Add event`
  (incl. new legs: Instrument {Shares/Call/Put} + Direction {Long/Short}), per-row ✎/✕ edit/delete,
  columns **Date · Action · Details · Price · Weight · Notes** (Details holds "Shares"/`$30C Sep '26`;
  one **Notes** column), newest-first, table on desktop / cards on mobile, **open/closed/all toggle**,
  **closed-leg rows dimmed** + "Closed"/"Expired" muted gray.
- **Resizable split** in `PicksView` — drag the divider between the list and the detail (15–80%).

**Phase 3 DONE ✅ + verified on SANDBOX (CXDO/IRDM):** detail-card P&L split per asset class, never
blended — **Open** shows Shares/Options return + lot; **Closed** shows per-asset return + portfolio
contribution. `closedPnlPct` + `closedPnlContribution` + `hasClosedPnl` in `@stw/shared`.

**Post-import holdings fix (Next Step #2) DONE ✅ on SANDBOX:**
- **`last_action`/`action_date` derived from each ticker's latest diary event** (`plans/post_import_holdings_fix.sql`).
  Same-day conversion ties (ADEA/CXDO/FIVN/GDYN/SHLS) resolve to the keep-open `New`; `Expired` →
  `Closed` at the holding level (last_action has no "Expired"). (At import time AMZN/HOOD/TSLA had no
  legs and were skipped — but that was a transient state, NOT a rule; **the host has since added real
  legs to the legacy names on PROD (2026-06-23)**. See the legacy-positions decision below.)
- **Baskets/categories** assigned from the 6/18 sector groupings; 3 new categories created
  (**AI Fraud / Verified Identity**, **Space & Satellite**, **Nuclear**); **IRDM moved Defense → Space & Satellite**.
- **Initial weight for fully-closed positions** now shows the closed legs' entry lots instead of blank —
  new shared helper **`displayInitialWeight`** wired into BOTH `HoldingDetail` (detail card) and
  `PositionEditor`. ARKK reads `1% → 0%`. 54 tests + typecheck green.
- **`revert_legacy_category.sql` applied** — removed the mistaken "Legacy Positions" category;
  AMZN/HOOD/TSLA are Uncategorized (Legacy is their **conviction tier**, not a sector).

**DB state — BOTH environments now on the event model (2026-06-19):**
- **PROD (`usmqbohcjcyszjxxvnqu`):** 038 + 039 + 040 + the import + `post_import_holdings_fix.sql`
  applied. **Verified: 42 legs / 60 diary rows**, last_action/action_date/baskets correct, reconciles to
  6/18. **STILL TODO on PROD: run `revert_legacy_category.sql`** — PROD has a *pre-existing* "Legacy
  Positions" category (old system) that AMZN/HOOD/TSLA still use; the env-agnostic revert clears it.
  Conviction on PROD is left to the routines (some cores not yet tier 5).
- **SANDBOX (`uolabcgbnrkhzpwuvzlk`):** same scripts + the revert all applied. Admin dev `.env.local` →
  sandbox, so **localhost reads/writes the sandbox directly**. 25 tickers / 42 legs.
- **PROD import gotchas (baked into `plans/prod_import/*` + the SQL files):** (1) PROD's STW
  `trader_id` = `64a779f9-13ba-4cb4-824b-d70dcab3a49b` (sandbox = `9ec36b89-…`); seeds now resolve the
  trader **by name**. (2) The Supabase SQL editor threw "Failed to fetch" on the one big import — it was
  split into 9 small files in **`plans/prod_import/`** (run `1_wipe` → `8_legs` → `9_weights` in order).
  (3) The wipe deletes **all** legs (PROD carried 28 stale ones from the old 029/030 system) with the
  `trg_leg_transactions_sync` trigger disabled during the delete.

**Decisions locked (see spec):** event-sourced; ledger-only leg editing (inline modal editing **deferred**);
one Notes column; trims book realized; >2 option legs split even; ledger newest-first; **a "convert to
shares" close is a real cash sale → book the option's actual exit price as realized P&L, never $0** (host
2026-06-18); **ledger Action verb = bold green for OPEN-leg events, plain gray for CLOSED-leg events**;
**P&L is split by asset class (Shares vs Options), never blended** — Open shows per-asset return + lot;
Closed shows per-asset return + **portfolio contribution** (return × sold weight), so a +600% option on a
thin slice reads as its true ~+3.6% portfolio impact (host 2026-06-18). P&L Breakdown is open-legs-only.
**"Legacy" is a conviction tier (Tier 6 / `c0`), NOT a sector/category** (host 2026-06-19). **Legacy /
low-conviction does NOT mean "no legs/data"** — every position the host actually holds carries leg +
transaction data regardless of tier, **especially while still open**; the host added real legs to the
legacy names (AMZN/HOOD/TSLA) on PROD (host 2026-06-23). So a tier-0 holding with open legs is normal —
never treat low conviction as a reason to leave a held position without legs. **Conviction is
owned by the routines** — set in the streaming run, never in a seed/migration (so the post-import fix does
NOT touch conviction; the 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/AMKR/LEU/AMZN/TSLA are the routines' job).

**New plan docs (`plans/`):** `legs_event_sourcing_redesign.md` (spec) · `import_open_positions.sql`
(clean open-position import) · `post_import_holdings_fix.sql` (Next Step #2 seed) ·
`revert_legacy_category.sql` (drops the bad Legacy category) · `040_sandbox_verify.sql` (trigger test) ·
`legs_inspect.sql` (inspect legs/diary) · `zzadea_populate.sql` (seed test fixture).

**Tooling:** `pnpm` not on PATH — use `corepack pnpm …` or `~/.local/bin/pnpm`. No local Postgres (can't
run DDL locally — apply migrations via the Supabase SQL editor). Prod service key (read-only checks) at
`~/Documents/Claude/Scheduled/.supabase-service-key`. Sandbox anon key in `apps/admin/.env.local`.

**Phase 5 DONE ✅ (2026-06-19) — routines on the 040 event model** (out-of-repo
`~/Documents/Claude/Scheduled/*`; SKILL.md edits, not committed). All four updated:
- **morning + afternoon:** STEP 2.3 / STEP 3 rewritten — diary `leg_transactions` (`action_label` +
  `notes`=host's verbatim words) + **direct `holdings` PATCH** of `last_action`/`action_date`/
  `current_weight`; **`holding_transactions` path retired** (the still-live 033 trigger auto-logs a
  harmless audit row). **Lot semantics:** BUY weight = lot **added**, SELL = **remaining** (cost basis).
  **Split (90:10 / 20:80 from `app_config` + `holdings.equity_pct`) is initial-sizing fallback only —
  existing legs are NEVER re-split.** Upsize = keep existing legs, add the increment to the **named**
  leg (FIVN worked example baked in). Contract→shares = close option at real exit (never $0) + new
  shares leg **inherits the replaced leg's weight** (net-neutral); same-day close+open keeps the
  position open (`last_action` = the opening verb). Trim uses **cost-basis remaining**; an appreciated
  winner stated only in market % → **flag**, don't guess. `action_date` = the host's action date,
  written only by a real action.
- **friday-weighting:** direct `current_weight` PATCH (no `Hold` rows); **truth-up mismatch (snapshot ≠
  Σ lots, e.g. IRDM +600%) → flag, never rewrite lots**; legs reconcile adds missing only; **new STEP
  4d status-aging** — `action_date` older than the **previous** snapshot → `last_action='Hold'`
  (`action_date` preserved); Closed/Expired terminal.
- **transcripts:** conviction note — routine-owned, **mutable both ways on an explicit signal incl.
  promoting a Legacy (0)**; never inferred from sizing.
- **One-time SQL applied (PROD + sandbox):** `plans/conviction_618_stars.sql` (8 stars → tier 5;
  AMZN/TSLA stay 0) + `plans/fix_fivn_shares_weight.sql` (FIVN shares lot 3.5→2.5, net-neutral 6.0%).
- **PENDING (host) — NOT a repo task, doesn't affect the apps:** the stale **`gradoxx-daily-summary`**
  Cowork scheduled task (duplicates morning PART 1's Graddox) is an **orphaned backend object** — it
  still fires ~9am but has no working delete UI (absent from Cowork→Scheduled; its task page 404s; the
  delete API is desktop-client-gated). Task UUID `8377c152-0ffa-474d-9ec0-2281a92edb26`, org Claudia Chez
  `aea1699f-e0b8-4ed4-80b9-4abb5d0a7711`; the underlying skill is `skill_01UY6zPNf9Do8eR4voyUvtm6`. Being
  cleared via Anthropic support / desktop skill-delete. Also smoke-test the routines on their next live runs.

## Next Steps

0. **Promote `staging → main` when approved (production deploy).** PRs #50–#55 are on `staging` only.
   Open a `staging → main` PR **only on explicit host approval**.

1. **Macro Dashboard — IMMEDIATE next task.** Full self-contained spec:
   [`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md) (read first). New **Macro** nav tab
   (between Signals and Portfolio): **Module 1 = Environment block + Sentiment Gauge** (start here), then
   **Module 2 = Portfolio Heatmap** block on `PortfolioDashboard`, then **Module 3 = Sector Rotation**
   (later). Design principles per the spec: Environment = market *structure* (indices/rates/credit/breadth,
   no dollar), Sentiment = *risk appetite* (vol/IV/GEX/credit/breadth/dollar), no indicator duplication,
   user-configurable indicator visibility, minimal default (SPY/QQQ/VIX/US10Y) with expert indicators opt-in.

2. **Overview/experience enrichment (host-requested, queued).** Stop the click-each-ticker experience:
   - **Transcripts library tab** — a NEW subscriber-facing **episode recap** (host's *trading psychology* +
     that episode's *per-ticker commentary*). **NOT** the local methodology `.md` files (apps never read those).
     Needs a new `webinars` table written by `stw-transcripts` + a new tab.
   - **Global Activity Feed** — one cross-ticker, reverse-chron feed merging Commentary + Transactions across
     all holdings, filterable. No schema (reads `conviction_comments` + `leg_transactions`). Low-cost.

3. **Phase 4 — admin Config + Manage area** — spec'd in
   [`plans/phase4_admin_manage.md`](plans/phase4_admin_manage.md). Config page edits `app_config`
   (`equity_options_default` / `options_short_long_default`); `useAppConfig` read hook in `@stw/ui`
   (note: `deriveLegWeights` has **no call sites** today, so app-side split-wiring is forward-looking).
   Manage area: **categories CRUD** (delete-guarded), **traders read-only**. One "Manage" nav entry,
   admin-local. No migrations expected. (Host was "gathering info" as of 2026-06-25 — confirm before building.)

4. **Future features (not migration work):** **My Portfolio closed/realized transactions** — the subscriber
   IBKR Flex query returns *open positions only*, so the tab can't show closed trades; needs a different IBKR
   query (trade-history/flex statement) + storage before a closed view is possible (host asked 2026-06-25).
   Also: inline 2-line leg editing in the modal (deferred); `$100k` notional + SPY benchmark (the `spy_daily`
   table from migration 032 already exists; the population cron + benchmark UI are unbuilt).

**Sandbox gaps (not blocking, dev-only):** (a) the **`prev_conviction_level` backfill** was never run on
sandbox, so the Conviction Changes block won't render there until it is (or until a real batch lands); (b) the
`recent_changes` view (migration 008) was never applied to sandbox, so **"Latest Portfolio Changes"** hides
there. Both render fine on PROD. Apply them to sandbox only if you want those blocks locally.

---

## One Monorepo, Two App Shells

This is a single pnpm workspace. Two thin app shells consume the same shared
packages and differ only by **capability**, never by forked components.

| App | Audience | Folder | Capabilities |
|---|---|---|---|
| Subscriber web | Subscribers | `apps/web` | Supabase auth + tier paywall (`AccessGate`); Portfolio page + IBKR Flex Query subscriber connection; Settings page (`/settings`) |
| Admin dashboard | STW editor | `apps/admin` | No paywall; Edit form, Users tab, IBKR badge + proxy writer |

Each deploys to its own Netlify site from the **same branch** (base dir differs).

---

## Repo Structure

```
pnpm-workspace.yaml          → packages/*, apps/*
package.json                 → workspace scripts (dev:web, dev:admin, build, typecheck, test)
packages/
  shared/  (@stw/shared)     pure framework-agnostic logic: types, tiers, baskets,
                             format, options, pnl, filters (+ unit tests)
  ui/      (@stw/ui)         shared React: feature pages/components, data hooks,
                             supabase/query-client factories, AppCapabilities context
apps/
  web/                       subscriber shell: router, Layout, auth, AccessGate
    netlify/functions/
      ibkr-flex.ts           serverless IBKR Flex Query proxy (JWT-auth, never exposes token)
    netlify.toml             (Netlify base dir = apps/web)
  admin/                     admin shell: no paywall, Edit + Users + IBKR
    ibkr_proxy.py            local IBKR writer (run on your machine, not deployed)
    netlify.toml             (Netlify base dir = apps/admin)
supabase/migrations/         001..046 — single source of truth for DB schema/RLS
CLAUDE.md                    this file
```

### Layer rules (keep them honest)
- `@stw/ui` takes everything via **props/context** — no app-specific imports, no env,
  no routes. The Supabase client + `VITE_*` env are created in each app and injected.
- Admin/subscriber differences flow through **one `AppCapabilities` context**
  (`isAdmin`, `canEdit`, `onEditHolding`, `showIbkrBadge`) — never scatter `isAdmin`
  checks deep in shared components.
- `@stw/shared` is the only home for derived-number logic (P&L, weights, sector %, date formatting).
  Don't re-implement it in an app. (End state: move the math into Supabase views/RPC.)

---

## Branch Strategy

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production | both Netlify sites — prod |
| `staging` | Trunk / staging | both Netlify sites — staging |

Feature branches: `claude/<feature>` → branch from `staging` → PR to `staging` →
PR `staging` → `main` when approved.

```bash
git checkout -b claude/my-feature origin/staging
# work across packages/* and apps/*; shared change is written once
git push -u origin claude/my-feature
# PR → staging for review, then staging → main when approved
```

---

## Local Development

```bash
pnpm install            # installs the whole workspace
pnpm dev:web            # subscriber app (Vite)
pnpm dev:admin          # admin app (Vite)
pnpm build              # pnpm -r build across packages + apps
pnpm typecheck          # pnpm -r typecheck
pnpm test               # unit tests (@stw/shared)
```

Env: each app needs `VITE_FINNHUB_KEY` (live prices) and the Supabase URL + anon
key (in `.env`, gitignored; see `apps/web/.env.example`).

---

## Deployment (Netlify)

Two sites, one repo, same branch — distinguished by **base directory**:
- Web site: base dir `apps/web`, build `pnpm install && pnpm --filter web build`, publish `dist`
- Admin site: base dir `apps/admin`, build `pnpm install && pnpm --filter admin build`, publish `dist`

`staging` branch → staging deploy; `main` → production (requires approval). Build
config lives in each app's `netlify.toml`; base dir + env vars are set in the
Netlify dashboard.

**Build-skip:** with a base dir, Netlify by default skips a build when nothing in
that dir changed — which silently dropped shared `packages/**` updates. Each
`netlify.toml` now has an `ignore` command that builds when the app dir, any shared
package, or a root manifest (`pnpm-lock.yaml`/`package.json`/`pnpm-workspace.yaml`)
changed, and skips doc-only commits. So a `packages/**` change now correctly rebuilds
both sites.

Add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs (Google
OAuth on web does a full-page redirect).

---

## Database (Supabase)

- Project: `usmqbohcjcyszjxxvnqu.supabase.co`; client created per-app and injected into `@stw/ui`.
- `supabase/migrations/` is the single source of truth (through **046**).
  **Claude authors migrations; you apply them** via the Supabase SQL editor / `supabase db push`.
- **Local DB backups → gitignored `backups/`** (never committed — may carry PII), named
  `<date>_<purpose>.json` (e.g. `*_pre-coldrop.json`). Take a fresh logical snapshot of the
  affected tables before any destructive migration (column/table drop). The Supabase MCP has no
  `pg_dump`; pull tables via the REST API with the service key, or `select json_agg(...)`.
- Tables: `holdings`, `signals`, `profiles`, `tiers`, `run_log`,
  `user_positions`, `holding_transactions`, `conviction_comments`, plus the event-sourced
  `legs` / `leg_transactions`, `categories`, `traders`, `app_config`.
  RLS on `holdings`/`signals` restricts writes to `cc@claudiachez.com`. `user_positions`
  uses user-owned RLS — each subscriber reads and writes only their own rows.
  The admin IBKR proxy now prices STW's option legs and writes **`legs.mark_price`** (the old
  `last_pnl_*` / `ibkr_legs` columns on `holdings` were dropped in 034).
- **Transaction History is auto-logged by a DB trigger** (`stw_log_holding_transaction`,
  migration 016): any non-`Hold` change to a `holdings` row's `last_action`/`action_date`
  writes a `holding_transactions` row — so every writer (admin Edit form *and* the external
  scheduled routines) is captured with no client code. A dedupe guard on
  `(ticker, leg, action, event_date)` makes idempotent script re-runs safe. The admin
  "+ Add Event" form is a manual backup (a direct insert that doesn't touch `holdings`,
  so it never double-fires the trigger). This intentionally differs from conviction
  history, which uses explicit appends (see migration 015).

### Data sources / writers
The apps mostly **read** these tables; the rows are written by systems that live **outside this
repo**. Know who writes what before you reason about freshness or "why is this row here":

| Table | Primary writer | Notes |
|---|---|---|
| `holdings` | **the routines** (see next section) | core position rows (`last_action`/`action_date`/`current_weight`/thesis/conviction/`category_id`); admin Edit form also writes. Per-leg sizing + prices live on `legs`/`leg_transactions`, not here |
| `signals` | **morning routine** (Graddox step) | GEX signal bias + levels |
| `conviction_comments` | **the routines** + `stw-transcripts` | explicit appends; `source` = `discord` or `streaming`; admin/users can also add notes |
| `holding_transactions` | **DB trigger** (no client) | auto-logged from any `holdings` write; never written directly by app or routine |
| `run_log` | **the routines** | ingestion audit + high-water mark; newest `digest` → "Latest Portfolio Changes" |
| `user_positions` | **web `ibkr-flex.ts`** | each subscriber's own IBKR account; user-owned RLS |
| `profiles` / `tiers` | auth + Settings | per-user creds/preferences, tier paywall |

"The routines" = three cowork cron tasks that ingest Discord into Supabase — **the primary writers of
`holdings`, `signals`, `conviction_comments`, `run_log`.** They are not in this repo (they live at
`~/Documents/Claude/Scheduled/<id>/SKILL.md`); the next section documents the full flow. They write
via the Supabase REST API with the **service-role key**, which is why their writes bypass the
`cc@claudiachez.com`-only RLS on `holdings`/`signals`.

---

## Data Ingestion — The Routines (out-of-repo, but the source of almost all data)

The apps render data that an external ingestion engine writes on a schedule. This engine is **not
checked into this repo** — it is a set of Claude cowork cron tasks at
`~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/`). It is
documented here because the Supabase schema is the contract between it (writer) and the apps
(readers); changing a table or the `legs`/`leg_transactions` event-sourced schema affects both sides.

**Mechanism (shared by every routine):**
- Reads Discord via **Claude in Chrome** (the user's own account — not a bot; the user isn't a server admin).
- Writes to Supabase via `curl` to the REST API using the **service-role key** (from `~/Documents/Claude/Scheduled/.supabase-service-key`), bypassing RLS. Every write uses `Prefer: return=representation` and is verified — an empty `[]` body is treated as failure.
- **High-water mark:** each routine first reads the newest `run_log.last_message_ts` for its channel, processes only messages newer than that, then writes a fresh `run_log` row. This makes every run idempotent — a message/recording/snapshot is processed exactly once, no matter which path fires. **Completeness is critical:** scroll Discord back to the *prior* mark and process EVERY message in the gap before advancing — the newest screenful loads first, so stopping early silently skips mid-gap messages while the mark moves past them (this dropped SYNA/TENB/GDYN on 6/26).
- **Extract intent, not the surface verb.** The host **deliberately obfuscates alerts to fool copy-bots** (confirmed 2026-06-26): a disguised "buy / hang on / revisit" can be a real **Close** (tells: "tossed/stopped out", "rules are rules", "I often sell bottoms"), and he may **omit the ticker** (name only, e.g. "Agility Robotics SPAC" = $CCXI → research and resolve the symbol). Still never infer weights/conviction from sizing; flag genuinely ambiguous actions rather than guessing.

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Graddox → `live-notes-portfolio` → (fallback) `stream-library-stw` | `signals`, `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

**Daily flow (morning / afternoon):**
1. Read `live-notes-portfolio` — the host's real-time buy / sell / upsize / trim calls **and** his DD/thesis (he posts thesis here, not in a separate channel).
2. For each changed ticker, write the **event-sourced** path (post-Phase-5): a `leg_transactions` **diary** row per leg event (`BUY`/`SELL`/etc. with `action_label`, `price`, `weight`=lot/remaining, `notes`=host's words) — the 040 trigger derives the `legs` scoreboard (status, entry/exit, realized P&L) — then a **direct `holdings` PATCH** of `last_action`/`action_date`/`current_weight` only. No `position_detail`/`exit_*` blob is written (those columns were dropped in 034/035).
3. That `holdings` PATCH **auto-fires the 033 trigger** → a harmless `holding_transactions` audit row (no client code; the routines never write that table directly).
4. For notable commentary, **append a `conviction_comments` row** (`source='discord'`) → becomes "Latest Comments"; refresh `holdings.summary`/`bullets` + `dd_updated_at` only when the durable thesis actually changed.
5. Write the `run_log` mark, including a multi-line **`digest`** → rendered as "Latest Portfolio Changes" in the Overview.
6. **Recording fallback:** if `stream-library-stw` has an unprocessed recording, delegate to `stw-transcripts`. (Morning also runs the Graddox GEX step first → `signals`.)

**Weekly flow (Friday):** read the full-portfolio snapshot from `updates-portfolio` and **truth-up every holding's `current_weight`** to match it (this is the weighting source of record; daily calls only nudge weights). A ticker in `holdings` but absent from the snapshot is flagged, not auto-closed.

**Webinar flow (`stw-transcripts`):** processes the newest unprocessed recording **exactly once** (dedup via the `stream-library-stw` high-water mark). From one Zoom transcript it produces **two outputs**: (A) a **methodology-analysis `.md`** — a fixed 10-section reverse-engineering of *how the host thinks* (not what he owns) — saved to `~/Documents/Claude/Projects/Stock Talk Weekly/StockTalk_Episode_<DATE>_Analysis.md`; and (B) **conviction notes** — a `conviction_comments` row per ticker (`source='streaming'`) plus a thesis refresh when the durable "why" changed. Output A is the **only** routine output the apps never read (a local research library, kept separate from position data on purpose).

---

## IBKR Pipelines (two separate systems)

### Admin — local option pricer
`apps/admin/ibkr_proxy.py` is a **local** Flask server (`localhost:8765`, self-signed
TLS) that talks to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The admin browser
calls it to price **STW's** option legs (arbitrary contracts, not just held positions);
the browser then writes the per-leg **`legs.mark_price`** / `mark_price_at` (`mark_price_source='IBKR'`)
to Supabase — the proxy itself never writes Supabase. (Pre-event-sourcing this wrote `last_pnl_*` /
`ibkr_legs` on `holdings`; those columns were dropped in 034.) Run it locally with IB Gateway
connected; never deployed.

The proxy batches snapshots for speed, then **retries any leg the batch returned empty,
one at a time** (concurrent frozen snapshots occasionally drop an illiquid contract).
An unpriced leg carries an `error` reason so the UI can explain it, never a bare blank:
`ambiguous` (strike not listed for that expiry) or `no_market_data` (resolved but no
bid/ask/last/close — likely illiquid / deep-ITM / far-dated). Map it via
`legPriceReason(leg)` from `@stw/shared` — the single source of truth for unpriced copy.

### Subscriber — Flex Query portfolio sync
`apps/web/netlify/functions/ibkr-flex.ts` is a **serverless** Netlify function that
calls IBKR's cloud Flex Web Service API to fetch a subscriber's **own** portfolio positions.
Security model: client sends its Supabase JWT → function verifies it, reads
`ibkr_flex_token` + `ibkr_query_id` from `profiles` via service key → calls IBKR →
writes positions to `user_positions`. The raw token never reaches the browser.

Required Netlify env vars on the **web** site:
- `VITE_SUPABASE_URL` — already present (shared with the Vite client build)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, must be added separately (no VITE_ prefix)

These two pipelines are independent. The admin proxy prices STW's positions; the
subscriber function reads the subscriber's own account. Do not conflate them.

---

## Conventions

### Timestamps
All UI timestamps use `fmtDateTime(val: Date | string | null)` from `@stw/shared`.
Output format: **`Mon D · H:MM AM ET`** (Eastern Time, year omitted).
- DB stores UTC; always display in ET via `timeZone: 'America/New_York'`.
- Label pattern: `[Action]: ${fmtDateTime(value)}` — e.g. `Last synced: Jun 5 · 7:46 AM ET`.
- Never call `toLocaleString` / `toLocaleTimeString` directly in components for timestamps.
- **No per-component date helpers** (e.g. a local `fmtStamp`) — import `fmtDateTime`. This covers every full "as of" timestamp: column labels, source lines, tooltips, alerts. (Exceptions: a date-only display like `action_date`, or a compact intraday tag like the Signals `@ 4:00 PM` price time — neither is a full timestamp.)

### Ticker links
**Any ticker shown anywhere in the UI must be a hyperlink to its detail page** — never
plain text. Use `<TickerLink ticker onSelect={onSelectTicker} />` from `@stw/ui` (free
text like a digest can be linkified token-by-token against the holdings set). This is a
standing rule: when you render a ticker, link it without being asked.

### Counts
"Positions" counts exclude the `CASH` balance row (it's not a position) and reflect the
active filter (closed hidden by default). The FilterBar count shows `N of {total}`.

### UI consistency (standing rules, host 2026-06-23)
- **White text on green.** Any filled `--acc`/green button or active toggle uses **white** text, never
  black/dark (black-on-green is low-contrast). Match the existing Save buttons (`color: '#fff'`).
- **Sibling tabs read as one app.** The Trades filter bar mirrors the Ticker Details `FilterBar` chrome
  (full-bleed surface bar, same control styling, same wording — e.g. "All Baskets", not "All Sectors").
  When you add a filter/list/blotter surface, reuse the established chrome rather than inventing a new look.
  This bit hard in the 2026-06-25 My Portfolio work — a from-scratch layout had to be reworked twice to match.
- **Filter/sort control ORDER is canonical — don't reinvent it per page.** Every filter bar follows
  **Search → Baskets → (Tiers/Status) → Types → Sort → toggles (checkboxes) → Clear → count**. Sort sits *after*
  the filters, never second. Match the order in `FilterBar.tsx` / `TradesFilterBar.tsx`; new tabs differ only by
  which filters exist, not by arrangement.
- **Timestamps align right; the left of a filter bar is for filters.** A "Last synced / Updated" stamp goes on
  the **right** of its bar (right-aligned), not the left — the left edge is filter real estate (host, 2026-06-25).
- **A list/blotter is a flat table by default; grouping is an opt-in checkbox** (like "Tailed only"), not forced
  sections. My Portfolio reuses the Trades `th`/`td` table styles; its "Group by ticker" toggle is the accordion.
- **Equity/Shares : Options ratio is computed by current MARKET VALUE, per leg** — shares on the live quote,
  option legs on their mark (cost weight grossed up by `mark÷entry`). **Never** by cost/premium weight and
  **never** by classifying a whole holding as equity-or-options (that dumps shares+overlay positions into equity
  and badly understates options). The host quotes the split by market value (confirmed 2026-06-25 against prod
  leg data: cost-weight ≈ 87:13 vs market-value ≈ host's 76:24). Same basis on the Stock Picks Overview card and
  the My Portfolio summary card.
- **Overview blocks share one header pattern.** Title lives OUTSIDE the card via `SectionHeader`, with an
  optional right-aligned `Updated: {fmtDateTime}` stamp — used by the webinar, changes, unpriced, and
  stale blocks. Don't put a block's title or its date inside the card.
- **Admin-only action hints.** Instructions a subscriber can't act on (e.g. "Run the IBKR sync") render
  only when `canEdit`; the explanation still shows to everyone.
- **Routine review-flags are admin-only** (host 2026-06-26). Operational uncertainty the routine surfaces —
  "flagged for review", "left open rather than auto-closed", missing-DD / snapshot-mismatch notes — must NOT
  appear in the subscriber-facing digest (`run_log.digest` → "Latest Portfolio Changes"). The public digest
  carries only **confirmed** changes; review-flags go to `run_log.summary` / the chat output (admin-gated).
- **Ticker Detail = four non-overlapping surfaces, one job each** (contract:
  [`plans/commentary_vs_transaction_boundary_spec.md`](plans/commentary_vs_transaction_boundary_spec.md)):
  **Highlight box** = `holdings.summary` (durable narrative paragraph) · **Key Points** = `holdings.bullets`
  (durable supporting detail — receipts + angles, **de-duped vs the summary**, never restating it; §2A) ·
  **Commentary** = `conviction_comments` (dated episodic views) · **Transaction History** =
  `leg_transactions.notes` (mechanics). Never re-derive one surface from another in the renderer.
- **Durable thesis source = local DD files** at `~/Documents/Claude/Projects/Stock Talk Weekly/Tickers DD/<TICKER>.md`
  (one per opened position; line 1 is a `**Source:** [Discord](url)` link; template `_TEMPLATE.md`). The apps
  NEVER read these — `holdings.summary`/`bullets` are the condensed projection, written from them by the
  routines (create on new position, non-destructive update on a durable DD expansion). Same private-library
  pattern as the methodology `.md` files.
- **Conviction delta is routine-recorded, never app-derived.** The Conviction Changes Overview block reads
  `conviction_comments.prev_conviction_level` (043) → renders `prev → current` directly. Do NOT reconstruct
  changes by diffing comment-level history across rows — it's sparse and contradicts the routine. The routine
  stamps the prior conviction on every comment it writes (= current when reaffirming).
- **Source-message icon is shown to everyone.** The "open original message" link (`dd_source_url` /
  `source_url`, via `SourceLink`) renders for all users — the platform is a companion to the Discord
  membership, so Discord itself gates access (member sees the message, non-member hits Discord's no-access
  screen). Don't admin-gate it. Use a directional glyph (▲▼★) for change *direction* and the external-link
  glyph only for *opening the source* — don't conflate the two.

---

## Design System

- **Font:** Barlow Condensed (700/800) for the **STW logo** in the header only; system sans-serif (`font-sans`) everywhere else including page headings and login
- **Logo:** STW mic + green arrow SVG
- **Default theme:** Dark. Toggle persists to `localStorage` (`stwTheme`); light
  theme applied via `[data-theme="light"]`. Never hardcode colors outside `:root` /
  `[data-theme="light"]` — always use CSS variables.

#### Color Variables (`:root`)
| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#111111` | Cards, header |
| `--s2` | `#1a1a1a` | Secondary surfaces |
| `--border` | `#2a2a2a` | Borders |
| `--bsub` | `#1f1f1f` | Subtle dividers |
| `--text` | `#f0f0f0` | Primary text |
| `--t2` | `#a0a0a0` | Secondary text |
| `--t3` | `#525252` | Muted text |
| `--acc` | `#22c55e` | STW green |

#### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` | Highest conviction |
| `--c4` | `#3b82f6` | High conviction |
| `--c3` | `#f59e0b` | Moderate |
| `--c2` | `#6b7280` | Waning interest |
| `--c1` | `#ef4444` | Concern |
| `--c0` | `#52525b` | Legacy |

---

## Tech Stack
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript |
| Workspace | pnpm workspace (no Turborepo/Nx) |
| Routing | react-router-dom 6 |
| Data | TanStack Query 5 (60s staleTime) |
| State | Zustand 5 |
| Backend | Supabase (auth + Postgres + RLS) |
| Prices | Finnhub (live), IBKR proxy (options legs) |
| Styling | Tailwind 3 + CSS variables |

---

## Session Close

Run this routine after ~10 commits or when wrapping up a session.

### 1 — Git hygiene
```bash
git fetch --prune origin          # drop stale remote-tracking refs
git branch --merged staging       # list local branches already merged
git branch -d <merged-branches>   # delete each one
```
Remote branches merged into staging: delete via GitHub UI
(Settings → Branches, or the "Delete branch" button on a closed PR).
Claude can attempt `git push origin --delete <branch>` but may get a 403 —
flag it if so and ask the user to delete manually.

### 2 — Supabase check
- Were any new migrations authored this session? List them and confirm the user has applied them via the Supabase SQL editor.
- If schema or RLS changed, remind user to verify on the staging project before shipping to prod.

### 3 — CLAUDE.md review
Review every section and ask: *does this still reflect the codebase, or is it stale?*
- Update migration count if new ones were added
- Update AppCapabilities list if the context interface changed
- Add conventions introduced this session (only if they're rules, not implementation details)
- Remove anything that's now discoverable from the code itself

### 4 — Staging deploy
Confirm the latest push to `staging` produced a successful Netlify build — but first decide whether a build was even *expected*.

Each `netlify.toml` `ignore` command builds only when the app dir, a shared
`packages/**`, or a root manifest changed (see Deployment). Check what the session's commits actually touched:
```bash
git diff --stat origin/main...staging   # files changed since last prod release
```
- **Only root/non-app files changed** (e.g. `CLAUDE.md`, `supabase/migrations/**`, `.github/**`): a **Canceled** deploy is *correct and expected* — there was nothing to rebuild. Leave it; do **not** force an empty commit (that just produces another no-op build).
- **App or shared code changed** (`apps/web/**`, `apps/admin/**`, `packages/**`) but the deploy is **Canceled or Failed**: this is a real problem (the `ignore` command should have built it). If it was canceled by a rapid superseding push, trigger a fresh build:
  ```bash
  git commit --allow-empty -m "Trigger staging deploy" && git push -u origin staging
  ```
  If it Failed, read the Netlify build log before re-triggering.

### 5 — Session summary
Briefly list: what was shipped, any pending user actions (migrations to apply, env vars to add, manual branch deletes), and any known open issues to tackle next session.
