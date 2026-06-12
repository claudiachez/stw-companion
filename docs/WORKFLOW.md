# STW Companion — Full Workflow (Handoff)

A self-contained, end-to-end description of how STW Companion works: how data is ingested, where it
lands, and how the apps render it. Written to be read **cold** by another chat with no prior context.

> For app-code conventions (layering, design system, migrations, deploy) see the repo `CLAUDE.md`.
> This doc covers the **whole system** — including the ingestion engine that lives outside the repo.

---

## 1. What it is (one paragraph)

STW Companion turns a paid Discord trading server (**Stock Talk Weekly**, "STW") plus a **Gradoxx**
GEX-signals channel into a structured, live dashboard. An ingestion engine of scheduled cron tasks
("**the routines**") reads the Discord channels via a browser, extracts every explicitly-stated
trade, weight, thesis, and conviction note, and upserts them into **Supabase**. Two thin React/Vite
app shells consume the same shared packages and differ only by capability: a **subscriber web app**
(Supabase auth + tier paywall + each subscriber's own IBKR portfolio sync) and an **admin dashboard**
(no paywall, manual Edit form + IBKR option pricer). Everything reads live from Supabase — there is
no static data file. All derived-number logic (P&L, weights, date formatting) lives in `@stw/shared`.

---

## 2. Architecture

Single **pnpm monorepo** (no Turborepo/Nx). React 18 + Vite 5 + TypeScript; TanStack Query (60s
staleTime); Zustand; Tailwind + CSS variables; Supabase (auth + Postgres + RLS); Finnhub for live
prices.

```
packages/
  shared/ (@stw/shared)  pure logic: types, tiers, baskets, format (fmtDateTime), options, pnl, filters
  ui/     (@stw/ui)       shared React: feature pages/components, data hooks, supabase/query factories,
                          AppCapabilities context  (everything via props/context — no app imports/env/routes)
apps/
  web/                    subscriber shell: router, Layout, auth, AccessGate (tier paywall),
                          Portfolio page, Settings; netlify/functions/ibkr-flex.ts (Flex Query proxy)
  admin/                  admin shell: no paywall, Edit form + Users tab + IBKR badge;
                          ibkr_proxy.py (local option pricer, run on your machine, not deployed)
supabase/migrations/      001..021 — single source of truth for schema/RLS
```

- **Two Netlify sites, one repo, same branch** — distinguished by base dir (`apps/web` vs `apps/admin`).
- Admin vs subscriber differences flow through **one `AppCapabilities` context** (`isAdmin`, `canEdit`,
  `onEditHolding`, `showIbkrBadge`) — never scatter `isAdmin` checks in shared components.
- Branches: `main` = production, `staging` = trunk/staging. Both deploy to their respective Netlify env.

> **History note:** an earlier Phase-1 version was a local `file://` HTML dashboard reading a
> `data/holdings.js` (`window.STW_DATA`) file. That is **fully retired** — ignore any reference to it.

---

## 3. The ingestion engine — "the routines" (lives OUTSIDE this repo)

The routines are **Claude cowork cron tasks**, not checked into the repo. They live at
`~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/<id>/`).
The Supabase schema is the **contract** between them (writers) and the apps (readers).

**Mechanism shared by every routine:**
- **Reads Discord via Claude in Chrome** — the user's own account (not a bot; the user isn't a server admin).
- **Writes to Supabase via `curl`** to the REST API using the **service-role key** (from
  `~/Documents/Claude/Scheduled/.supabase-service-key`), which **bypasses RLS** (so it can write the
  `cc@claudiachez.com`-only `holdings`/`graddox` tables). Every write uses
  `Prefer: return=representation` and is **verified** — an empty `[]` body is treated as a failure.
- **High-water mark = idempotency.** Each routine first reads the newest `run_log.last_message_ts`
  for its channel, processes only messages newer than that, then writes a fresh `run_log` row. A
  message / recording / snapshot is processed **exactly once**, regardless of which path fires.
- **Only extracts what is explicitly stated** — never infers actions, weights, or conviction.
- Must run **fully unattended** (no permission prompts) — enforced via the project's
  `.claude/settings.local.json` (`defaultMode: bypassPermissions` + broad allow prefixes).

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Gradoxx → `live-notes-portfolio` → (fallback) `stream-library-stw` | `graddox`, `graddox_levels`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

**Discord channels** (server `916525682887122974`):

| Channel | ID | Used by |
|---|---|---|
| live-notes-portfolio | `1229546005788098580` | morning + afternoon (primary: buy/sell/upsize/trim + DD/thesis) |
| updates-portfolio | `1503874839599911073` | friday-weighting only (weekly full snapshot) |
| stream-library-stw | `1441560421822627860` | transcripts (webinar recordings) |
| thesis-library-stw | `1491600503740563636` | DROPPED — no longer read |

---

## 4. The flows in detail

### Daily flow (morning 9am / afternoon 3pm)
1. Read `live-notes-portfolio` — the host's real-time **buy / sell / upsize / trim** calls **and** his
   DD/thesis (he posts thesis here, not in a separate channel).
2. For each changed ticker, **upsert `holdings`** on the `ticker` PK:
   - `last_action` ∈ `New` / `Upsized` / `Trimmed` / `Hold` / `Closed` (only when explicitly stated).
   - `current_weight`, `action_date`, and `position_detail` normalized to the **canonical leg form**:
     `Common @ $PRICE + $STRIKE[C|P] MON 'YY @ $ENTRY` — one expiry and a single `@` per leg, joined
     with ` + `. (This exact format is what the Picks **Trades** tab parses into one row per leg/lot.)
   - On a **Close**: also snapshot `exit_price` + `exit_pnl_pct` (from a stated exit price, else a
     Finnhub quote), with `current_weight: 0`; do **not** overwrite `position_detail`.
3. That `holdings` write **auto-fires a DB trigger** → writes a `holding_transactions` row. No client
   code logs transactions; every writer (routines AND the admin Edit form) is captured automatically.
4. For notable commentary: **append a `conviction_comments` row** (`source='discord'`) → becomes the
   "Latest Comments"; the prior latest drops into history. Refresh `holdings.summary`/`bullets` +
   `dd_updated_at` **only when the durable thesis actually changed**.
5. Write the `run_log` mark, including a multi-line **`digest`** (the per-ticker change summary) →
   rendered as **"Latest Portfolio Changes"** in the Overview.
6. **Recording fallback:** if `stream-library-stw` has an unprocessed recording (per its high-water
   mark), delegate to the `stw-transcripts` skill.
7. (Morning only) **Part 1 is Gradoxx** — runs the Gradoxx GEX skill first, writing the signal bias +
   levels to `graddox` / `graddox_levels` (a discrete, verified, blocking write before the portfolio part).

### Weekly flow (Friday 5pm)
Read the **full-portfolio snapshot** from `updates-portfolio` and **truth-up every holding's
`current_weight`** to match it. This is the weighting **source of record**; the daily calls only nudge
weights between snapshots. A ticker in `holdings` but **absent** from the snapshot is flagged for
review, **not** auto-closed (closing is a `live-notes` decision). A ticker in the snapshot but not yet
in `holdings` is inserted as `New`.

### Webinar flow (`stw-transcripts`, manual + daily fallback)
A few times a month the host runs a webinar reviewing holdings. The skill processes the **newest
unprocessed recording exactly once** (dedup via the `stream-library-stw` high-water mark). It opens
the Zoom recording (link + passcode from Discord), reads the full transcript, and takes the **episode
date from the transcript itself** (the real streaming date, `YYYYMMDD`). From one transcript it
produces **two outputs**:
- **Output A — methodology analysis `.md`** → saved to
  `~/Documents/Claude/Projects/Stock Talk Weekly/StockTalk_Episode_<DATE>_Analysis.md`. A fixed
  10-section reverse-engineering of **how the host thinks** (thesis construction, trade structure,
  risk management, exits, portfolio construction, watchlist process, mental models, regime awareness,
  vocabulary, open questions) — explicitly **not** a catalog of what he owns. No frontmatter; body
  starts at `## EPISODE METADATA`. Claims tagged `[EXPLICIT]`/`[IMPLIED]`/`[UNCLEAR]`.
- **Output B — conviction notes** → a `conviction_comments` row per ticker materially discussed
  (`source='streaming'`), plus a `holdings.summary`/`bullets` refresh when the durable "why" changed.

**Output A is the only routine output the apps never read** — it's a local research library about the
host's *process*, kept deliberately separate from the position data the dashboard renders.

---

## 5. Supabase tables — who writes, who reads

| Table | Primary writer | Read by (app module) |
|---|---|---|
| `holdings` | **routines** (also admin Edit form; admin IBKR proxy writes only `last_pnl_*`/`ibkr_legs`) | Picks Overview, Ticker Details (thesis = `summary`+`bullets`), Trades |
| `holding_transactions` | **DB trigger** `stw_log_holding_transaction` (migration 016) — never written directly | Transaction Ledger, Trades history |
| `conviction_comments` | **routines** + `stw-transcripts` (explicit appends; `source` = `discord`/`streaming`); users can add notes | Ticker Details — "Latest Comments" (newest row) + history (older rows) |
| `graddox` / `graddox_levels` | **morning routine** (Gradoxx step) | Gradoxx signals panel |
| `run_log` | **routines** | newest `digest` → "Latest Portfolio Changes"; ingestion audit trail |
| `user_positions` | **web `ibkr-flex.ts`** (subscriber's own IBKR account; user-owned RLS) | web Portfolio page |
| `profiles` / `tiers` | auth + Settings (per-user IBKR creds/preferences, tier) | AccessGate paywall, Settings |

**RLS:** `holdings`/`graddox` writes restricted to `cc@claudiachez.com` (routines bypass via
service-role key). `user_positions` is user-owned — each subscriber reads/writes only their own rows.

**Key design point:** `holding_transactions` is populated by a **DB trigger** on any non-`Hold`
`holdings` change (dedupe guard on `(ticker, leg, action, event_date)` for safe re-runs), so the
transaction ledger is correct no matter who wrote the holding. `conviction_comments`, by contrast,
uses **explicit appends** — different mechanism on purpose.

---

## 6. The two IBKR pipelines (independent — do not conflate)

1. **Admin local option pricer** — `apps/admin/ibkr_proxy.py`, a **local** Flask server
   (`localhost:8765`, self-signed TLS) talking to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The
   admin browser calls it to price **STW's** option legs, then writes `last_pnl_pct` / `last_pnl_at` /
   `ibkr_legs` onto `holdings`. Web only **reads** those columns. Run locally; never deployed.
2. **Subscriber Flex Query sync** — `apps/web/netlify/functions/ibkr-flex.ts`, a **serverless**
   Netlify function. Client sends its Supabase JWT → function verifies it, reads `ibkr_flex_token` +
   `ibkr_query_id` from `profiles` via the service key → calls IBKR's cloud Flex Web Service → writes
   the subscriber's **own** positions to `user_positions`. The raw token never reaches the browser.

The admin proxy prices STW's positions; the subscriber function reads each subscriber's own account.

---

## 7. Mental model (the one-liner)

**The routines (out-of-repo cron, browser-read Discord + service-key Supabase writes) are the writers;
the apps are the readers; Supabase is the contract.** Change the schema or the `position_detail`
format and you affect both sides at once.
