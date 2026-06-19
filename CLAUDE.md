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

## Current Status — legs/transaction-history → true event-sourcing (handoff 2026-06-19)

**Active branch: `claude/legs-event-sourcing`** (off `staging`, pushed, **PR'd → `staging`**, not yet
merged). Authoritative spec: [`plans/legs_event_sourcing_redesign.md`](plans/legs_event_sourcing_redesign.md).
Read it first. **Phases 1–3 done + verified on SANDBOX; the clean import + the post-import holdings fix
(Next Step #2) are applied to SANDBOX.** Everything below works end-to-end on localhost (→ sandbox).

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
  `Closed` at the holding level (last_action has no "Expired"). AMZN/HOOD/TSLA have no legs → skipped.
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
**"Legacy" is a conviction tier (Tier 6 / `c0`), NOT a sector/category** (host 2026-06-19). **Conviction is
owned by the routines** — set in the streaming run, never in a seed/migration (so the post-import fix does
NOT touch conviction; the 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/AMKR/LEU/AMZN/TSLA are the routines' job).

**New plan docs (`plans/`):** `legs_event_sourcing_redesign.md` (spec) · `import_open_positions.sql`
(clean open-position import) · `post_import_holdings_fix.sql` (Next Step #2 seed) ·
`revert_legacy_category.sql` (drops the bad Legacy category) · `040_sandbox_verify.sql` (trigger test) ·
`legs_inspect.sql` (inspect legs/diary) · `zzadea_populate.sql` (seed test fixture).

**Tooling:** `pnpm` not on PATH — use `corepack pnpm …` or `~/.local/bin/pnpm`. No local Postgres (can't
run DDL locally — apply migrations via the Supabase SQL editor). Prod service key (read-only checks) at
`~/Documents/Claude/Scheduled/.supabase-service-key`. Sandbox anon key in `apps/admin/.env.local`.

## Next Steps

1. **Run `revert_legacy_category.sql` on PROD** (one-liner left from this session — see DB state) and
   **merge the PR** (`claude/legs-event-sourcing` → `staging`, #37). Decide whether the staging Netlify
   deploy points at sandbox or prod before relying on it.

2. **Phase 5 — routines (out-of-repo `~/Documents/Claude/Scheduled/*`) on the event model** — THE BIG
   NEXT TASK. Update the 3 daily/Friday routines to write the diary, not the old `holdings`-direct model:
   - Write `leg_transactions` rows with **`action_label`** (New/Upsized/Trimmed/Closed/Exercised/Expired)
     and the host's words in **`notes`**; let the 040 trigger derive `legs`. **Lot semantics:** BUYs
     accumulate (each lot adds), a SELL's weight = the leg's **remaining** (0 on a full close).
   - Set holding-level **`last_action`/`action_date`** from the latest diary event (ties → keep-open;
     Expired → Closed), **`conviction`** (the routines own it — 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/
     AMKR/LEU/AMZN/TSLA → tier 5; AMZN/TSLA are Legacy = tier 6 though — clarify with host), and
     **baskets** from the portfolio-update sector groupings.
   - **Status-lifecycle aging = ROUTINE-ONLY, no UI change** (confirmed: `ActionBadge` renders nothing
     for `Hold`). When a position's `action_date` is older than the **2nd portfolio update** after it
     (opened Mon → New through that Friday, drops the next Friday), the routine writes
     `last_action='Hold'` and the badge disappears. Closed stays Closed (terminal).
   - **Weekly truth-up (the hard open question):** the Friday snapshot restates `current_weight`; when the
     restated total ≠ Σ lots (IRDM-style appreciated trims, market-remaining > Σ lots), do the cost-basis
     translation. `current_weight` is routine-owned from Monday. Read `app_config` + `holdings.equity_pct`
     for the 90:10 / 20:80 default split; respect `weight_overridden` pins.

3. **Phase 4 — admin Config page** editing `app_config` (`equity_options_default`,
   `options_short_long_default`); wire the routines + any default-split path to read it.

4. **Deferred:** inline leg editing in the modal; **034/035** (drop deprecated cols — after Phase 5);
   admin **Manage** area (categories/traders CRUD); `$100k` notional + SPY benchmark (`spy_daily`,
   migration 032).

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
