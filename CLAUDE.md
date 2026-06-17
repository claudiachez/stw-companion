# STW Companion — Claude Code Guide

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never force-push or reset `staging` or `main`
- Never push to `main` without explicit approval — that is production
- Write shared styling/logic/data **once** in the shared packages, never twice across apps
- **Every timestamp uses `fmtDateTime` from `@stw/shared`** — never `toLocaleString`/`toLocaleTimeString` or a local date helper (see Conventions → Timestamps)
- **All UI changes must work on mobile** — design for ≤390px first; test layouts at narrow width before pushing
- **After ~10 commits in a chat**, run the Session Close routine (see section below)

---

## Current Status — admin position editor reworked + legs verified (handoff 2026-06-17)

On `staging` (all feature branches merged + deleted; clean tree). Plan docs (all in `plans/`):
- [`legs_rebuild_spec.md`](plans/legs_rebuild_spec.md) — **authoritative legs ledger + methodology** (the applied rebuild)
- [`legs_rebuild_corrective.sql`](plans/legs_rebuild_corrective.sql) — the corrective SQL that was applied + verified
- [`workstream2_routine_edits.md`](plans/workstream2_routine_edits.md) — line-level SKILL.md edits (Phase 1 + 2 applied)
- [`cutover_runbook.md`](plans/cutover_runbook.md) · [`schema_migration_plan_v4.md`](plans/schema_migration_plan_v4.md) — migration history/spec

**Deployed:** PRs #28–#36 merged to `staging` (migration + app + legs rebuild + the admin **position editor** rework).
**`main`/prod app NOT deployed** (still pre-migration code). Confirm staging Netlify builds are green.

**Prod DB (`usmqbohcjcyszjxxvnqu`):**
- Migrations **022–033 + 036 + 037 applied**. **038 + 039 authored + merged — ⚠️ VERIFY/APPLY in prod:**
  **039** (`legs.weight_overridden`) is **REQUIRED for the position editor's leg saves**; **038** fixes the
  admin-write RLS on `holding_transactions`/`conviction_comments` (was a broken `auth.users` subquery).
  **034/035 still NOT applied** (drop deprecated cols — gated on the Phase 2 routine smoke-test below).
  (No `list_migrations` MCP — infer applied state from schema / the editor working.)
- **All 46 holdings categorized.** New `Hedge` category (ARKK, SQQQ).
- ✅ **`legs` table REBUILT + verified (2026-06-15)** — was corrupted by `stw_backfill_2026.sql`. Rebuilt
  from the **7 weekly snapshots (5/1–6/12)** + the **pre-redesign backup**
  (`backups/stw_db_backup_2026-06-12_pre-redesign.json`) + host live-notes + researched option closing
  prices. 62 legs across 38 tickers (33 open / 29 closed), 12 holding statuses corrected (SYNA flipped
  Closed→held), phantoms dropped. Authoritative ledger + methodology in
  [`legs_rebuild_spec.md`](plans/legs_rebuild_spec.md); the applied SQL is
  [`legs_rebuild_corrective.sql`](plans/legs_rebuild_corrective.sql). All 62 legs + 15 status fixes
  verified against prod (entry/exit/realized/status/weight). `holding_transactions` left intact.
  (Old discrepancy worklist [`legs_rebuild.md`](plans/legs_rebuild.md) is superseded.)

**Admin position editor — REWORKED ✅ (2026-06-17, this session).** One `✎ Edit` → a single **modal**
([`PositionEditor.tsx`](packages/ui/src/features/picks/components/PositionEditor.tsx)): holding fields +
**position weight** (the input the host states weekly) + **directly-editable leg rows** (no per-leg Edit
click) + one Save. Per-leg weights **derive 90/10** from the position weight (`deriveLegWeights` in
`@stw/shared`); typing a leg weight **overrides + pins** it (`legs.weight_overridden`, migration 039 —
the split *and the routines* must skip pinned legs). **Transaction History restored**
([`LegTimeline.tsx`](packages/ui/src/features/picks/components/LegTimeline.tsx)) reading
**`leg_transactions`** — the same source the legs derive from, so they can't disagree (the old bug was
legs vs `holding_transactions`); shows both grains (position-level action per day + per-leg events).
`holding_transactions` is fully **out of the UI** (TransactionTimeline/EventForm + their api fns removed).
Data fixes applied to **prod** this session: SYNA `current_weight` 0→4.7; IRDM leg (3.4% / opened 2/27);
deduped **20 phantom "New" `holding_transactions`**; re-backfilled `legs.initial_weight` from holding
initials; `legs.opened_at` set to true opens (OSS Dec 19 2025, etc.). **Soft spot:**
`leg_transactions.executed_at` still carries the rebuild's *proxy* dates, so the timeline's dates can lag
the corrected `legs.opened_at` (see Next Steps).

**Phase 1 SKILL.md edits — ALL 5 DONE ✅** (out-of-repo `~/Documents/Claude/Scheduled/*`). First live cron
run = **9am ET 2026-06-15**, verified clean (Next Steps #1).

**Phase 2 SKILL.md edits — DONE ✅ (2026-06-15), pending a live smoke-test + 034/035.** Out-of-repo:
- `stw-morning-run` / `stw-afternoon-run`: rewritten to the **event model** — write `legs` +
  `leg_transactions` + `holding_transactions` (trigger-derived); stop writing
  `last_action`/`current_weight`/`position_detail`/`exit_*`; `basket`→`category_id` (resolve/create);
  close = `SELL` leg_transaction (no `exit_*` on holdings); **90/10** weight default; **unstated
  entry/exit price → research that day's close (Yahoo/MarketWatch), don't guess**.
- `stw-friday-weighting`: weight-only `holding_transactions {Hold}` + **reconciles legs from the
  snapshot** (the leg source of record).
- `stw-transcripts`: no change (only writes surviving cols; docs already clean).
- **Two enhancements beyond the spec:** (a) Graddox switched **Control Chrome → Claude in Chrome** so the
  morning run is silent like the afternoon (Control Chrome = visible takeover; Claude in Chrome =
  silent); (b) **early-portfolio-update fallback** added to morning + afternoon — if `updates-portfolio`
  has a new snapshot (host posts Thu/holiday early), they delegate to `stw-friday-weighting`;
  idempotent on its high-water mark (whoever processes it first claims it; later runs skip).
- **REMAINING:** smoke-test one live run on the new model, then DB dump + apply **034/035**.

**App code (PR #29 verified in admin preview):** count fixes (CASH excluded from Ticker Details tab count;
FilterBar total respects "Show closed"); web "Re-run the sync." gated to admin; admin Edit form has a
Category dropdown (`category_id`). typecheck + 30 tests + both builds green.

**Key new insight (drives Phase 2):** the host does NOT announce every leg in the daily feed (e.g. SYNA
`$85C Sep'26` only in the weekly snapshot). → the **Friday routine must reconcile legs/contracts from the
weekly snapshot, not just weights.**

**Tooling note:** `pnpm` not on PATH; use `corepack pnpm …` or the shim at `~/.local/bin/pnpm`.
Admin dev `.env.local` points at the **sandbox** DB, not prod.

**Key design decisions (this migration):**
- Size-less %-P&L model: no share/contract counts. `legs` store `entry_price` + per-leg `weight` + `mark_price`/`exit_price`/`realized_pnl_pct`. P&L is always a %. Per-leg weight stated in chat, else 90/10 default (mixed: 90% shares / 10% options; options-only: even split; shares-only: 100%).
- `leg_transactions` is a quantity-free event log → trigger 030 derives leg state (replay-safe).
- Exercise: option → `EXERCISED`; SHARES leg spawned at `strike + premium` (`parent_leg_id`).
- Trigger 031: `holding_transactions` → `holdings`. Trigger 033 (rewrite of 016): dedupe guard breaks the 031↔033 loop.
- Apply order: **033 immediately after 026** at cutover.
- Sandbox (`uolabcgbnrkhzpwuvzlk`) holds full 022–036 + sample data for reference.

## Next Steps

*(Done earlier — see Current Status: 9am cron verified, legs rebuilt+verified, admin position editor reworked, Phase 1+2 SKILL.md edits.)*

1. **Apply migrations 038 + 039 to prod** via the Supabase SQL editor, then **verify the position editor
   end-to-end on prod**: open `✎ Edit` on a holding → change the position weight (legs should re-derive
   90/10) → add/edit/close a leg → Save → confirm legs update + the event shows in Transaction History.
   **039 is required** or leg saves fail (`legs.weight_overridden` missing). Also confirm the staging
   Netlify build for the merged PRs is green.

2. **Routine follow-ups (out-of-repo `~/Documents/Claude/Scheduled/*` SKILL.md)** to match the new weight
   model: routines must (a) **respect `legs.weight_overridden`** — skip pinned legs in the 90/10
   redistribution; (b) treat the host's weekly **position weight as the input** and derive legs 90/10
   (already the documented model); (c) keep writing **`leg_transactions`** (the timeline's source — already do).

3. **Re-date `leg_transactions.executed_at`** to the true open/close dates (the rebuild used proxy dates,
   so the LegTimeline's dates lag the corrected `legs.opened_at`). Either a corrective `UPDATE` (BUY
   `executed_at` = `legs.opened_at`, close events = `legs.closed_at`) or have `LegTimeline` read leg dates.

4. **Phase 2 cutover (drops the deprecated cols):** smoke-test ONE live routine run on the event model
   (a New + a Hold + a Close — confirm `legs`/`leg_transactions`/`holding_transactions` land and `holdings`
   updates via triggers), then take a DB dump and apply **034/035**. Until then the routines simply stop
   writing those cols — no break.

5. **Deferred:** admin **Manage** area (CRUD categories/traders/channels; move basket colors into
   `categories.color`, retiring `baskets.ts`); `$100k` notional portfolio + SPY benchmark (`spy_daily`
   exists, migration 032).

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
supabase/migrations/         001..021 — single source of truth for DB schema/RLS
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
- `supabase/migrations/` is the single source of truth (021 migrations to date).
  **Claude authors migrations; you apply them** via the Supabase SQL editor / `supabase db push`.
- Tables: `holdings`, `graddox`, `graddox_levels`, `profiles`, `tiers`, `run_log`,
  `user_positions`, `holding_transactions`, `conviction_comments`.
  RLS on `holdings`/`graddox` restricts writes to `cc@claudiachez.com`. `user_positions`
  uses user-owned RLS — each subscriber reads and writes only their own rows.
  The admin IBKR proxy is the only writer of `last_pnl_*` / `ibkr_legs` on `holdings`.
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
| `holdings` | **the routines** (see next section) | core position rows; admin Edit form also writes; admin IBKR proxy writes only `last_pnl_*`/`ibkr_legs` |
| `graddox` / `graddox_levels` | **morning routine** (Graddox step) | GEX signal bias + levels |
| `conviction_comments` | **the routines** + `stw-transcripts` | explicit appends; `source` = `discord` or `streaming`; admin/users can also add notes |
| `holding_transactions` | **DB trigger** (no client) | auto-logged from any `holdings` write; never written directly by app or routine |
| `run_log` | **the routines** | ingestion audit + high-water mark; newest `digest` → "Latest Portfolio Changes" |
| `user_positions` | **web `ibkr-flex.ts`** | each subscriber's own IBKR account; user-owned RLS |
| `profiles` / `tiers` | auth + Settings | per-user creds/preferences, tier paywall |

"The routines" = three cowork cron tasks that ingest Discord into Supabase — **the primary writers of
`holdings`, `graddox`, `conviction_comments`, `run_log`.** They are not in this repo (they live at
`~/Documents/Claude/Scheduled/<id>/SKILL.md`); the next section documents the full flow. They write
via the Supabase REST API with the **service-role key**, which is why their writes bypass the
`cc@claudiachez.com`-only RLS on `holdings`/`graddox`.

---

## Data Ingestion — The Routines (out-of-repo, but the source of almost all data)

The apps render data that an external ingestion engine writes on a schedule. This engine is **not
checked into this repo** — it is a set of Claude cowork cron tasks at
`~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/`). It is
documented here because the Supabase schema is the contract between it (writer) and the apps
(readers); changing a table or the `position_detail` format affects both sides.

**Mechanism (shared by every routine):**
- Reads Discord via **Claude in Chrome** (the user's own account — not a bot; the user isn't a server admin).
- Writes to Supabase via `curl` to the REST API using the **service-role key** (from `~/Documents/Claude/Scheduled/.supabase-service-key`), bypassing RLS. Every write uses `Prefer: return=representation` and is verified — an empty `[]` body is treated as failure.
- **High-water mark:** each routine first reads the newest `run_log.last_message_ts` for its channel, processes only messages newer than that, then writes a fresh `run_log` row. This makes every run idempotent — a message/recording/snapshot is processed exactly once, no matter which path fires.
- **Only extracts what is explicitly stated** — never infers actions, weights, or conviction.

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Graddox → `live-notes-portfolio` → (fallback) `stream-library-stw` | `graddox`, `graddox_levels`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

**Daily flow (morning / afternoon):**
1. Read `live-notes-portfolio` — the host's real-time buy / sell / upsize / trim calls **and** his DD/thesis (he posts thesis here, not in a separate channel).
2. For each changed ticker, **upsert `holdings`** on the `ticker` PK — `last_action` (`New`/`Upsized`/`Trimmed`/`Hold`/`Closed`), `current_weight`, and `position_detail` normalized to the canonical leg form (`Common @ $X + $STRIKE[C|P] MON 'YY @ $entry`, one `@` per leg) so the Picks **Trades** tab can parse each leg/lot. On a Close, also snapshot `exit_price`/`exit_pnl_pct` (from a stated exit or a Finnhub quote).
3. That `holdings` write **auto-fires the DB trigger** → a `holding_transactions` row (no client code).
4. For notable commentary, **append a `conviction_comments` row** (`source='discord'`) → becomes "Latest Comments"; refresh `holdings.summary`/`bullets` + `dd_updated_at` only when the durable thesis actually changed.
5. Write the `run_log` mark, including a multi-line **`digest`** → rendered as "Latest Portfolio Changes" in the Overview.
6. **Recording fallback:** if `stream-library-stw` has an unprocessed recording, delegate to `stw-transcripts`. (Morning also runs the Graddox GEX step first → `graddox`/`graddox_levels`.)

**Weekly flow (Friday):** read the full-portfolio snapshot from `updates-portfolio` and **truth-up every holding's `current_weight`** to match it (this is the weighting source of record; daily calls only nudge weights). A ticker in `holdings` but absent from the snapshot is flagged, not auto-closed.

**Webinar flow (`stw-transcripts`):** processes the newest unprocessed recording **exactly once** (dedup via the `stream-library-stw` high-water mark). From one Zoom transcript it produces **two outputs**: (A) a **methodology-analysis `.md`** — a fixed 10-section reverse-engineering of *how the host thinks* (not what he owns) — saved to `~/Documents/Claude/Projects/Stock Talk Weekly/StockTalk_Episode_<DATE>_Analysis.md`; and (B) **conviction notes** — a `conviction_comments` row per ticker (`source='streaming'`) plus a thesis refresh when the durable "why" changed. Output A is the **only** routine output the apps never read (a local research library, kept separate from position data on purpose).

---

## IBKR Pipelines (two separate systems)

### Admin — local option pricer
`apps/admin/ibkr_proxy.py` is a **local** Flask server (`localhost:8765`, self-signed
TLS) that talks to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The admin browser
calls it to price **STW's** option legs (arbitrary contracts, not just held positions),
then writes `last_pnl_pct` / `last_pnl_at` / `ibkr_legs` to `holdings` in Supabase.
Web only **reads** those columns. Run it locally with IB Gateway connected; never deployed.

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
