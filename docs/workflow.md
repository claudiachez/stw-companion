# STW Companion — Full Workflow (Handoff)

A self-contained, end-to-end description of how STW Companion works: how data is ingested, where it
lands, and how the apps render it. Written to be read **cold** by another chat with no prior context.

> For app-code conventions (layering, design system, migrations, deploy) and the authoritative current
> status, see the repo **`CLAUDE.md`**. For every external data feed's keys/limits/consumers see
> **[`docs/feeds.md`](feeds.md)**. This doc is the durable system overview; those two hold the detail
> that changes most.

---

## 1. What it is (one paragraph)

STW Companion turns a paid Discord trading server (**Stock Talk Weekly**, "STW") plus a **Graddox**
GEX-signals channel into a structured, live dashboard. An ingestion engine of scheduled cron tasks
("**the routines**", out-of-repo) reads the Discord channels via a browser, extracts every explicitly
stated trade / weight / thesis / conviction note, and writes them to **Supabase**. Two thin React/Vite
app shells consume the same shared packages and differ only by capability: a **subscriber web app**
(Supabase auth + tier paywall + each subscriber's own IBKR portfolio sync + a Macro dashboard) and an
**admin dashboard** (no paywall, an event-sourced position editor + IBKR option pricer + real order
placement + a Config page). Everything reads live from Supabase — there is no static data file. All
derived-number logic (P&L, weights, sector %, date formatting, macro scoring) lives in `@stw/shared`.

---

## 2. Architecture

Single **pnpm monorepo** (no Turborepo/Nx). React 18 + Vite 5 + TypeScript; TanStack Query (60s
staleTime); Zustand; Tailwind + CSS variables + a design-system token layer; Supabase (auth + Postgres
+ RLS). Prices: Finnhub (live quotes), TwelveData (equity daily closes), FRED (macro indices), IBKR
(option marks). See `docs/feeds.md`.

```
packages/
  shared/ (@stw/shared)  pure logic: types, tiers, baskets, format (fmtDateTime), options, pnl, legs,
                         filters, macro scorers, limits, regime, sectors (GICS), pacing, fred helpers
  ui/     (@stw/ui)      shared React: feature pages/components, data hooks, supabase/query factories,
                         AppCapabilities context (everything via props/context — no app imports/env/routes)
apps/
  web/                   subscriber shell: router, Layout, auth, AccessGate (paywall), Portfolio,
                         Settings, Macro tab; netlify/functions/ (ibkr-flex, fred, macro-*, sector-map-sync)
  admin/                 admin shell: no paywall, position editor + ledger + Users + Config + IBKR;
                         ibkr_proxy.py (local option pricer + order placement, run locally, not deployed)
supabase/migrations/     001..062 — single source of truth for schema/RLS
```

- **Two Netlify sites, one repo, same branch** — distinguished by base dir (`apps/web` vs `apps/admin`).
- Admin vs subscriber differences flow through **one `AppCapabilities` context** (`isAdmin`, `canEdit`,
  `showIbkrBadge`, `canViewHistory`, `canUseLimits`, `onEditHolding`, `onExecuteIbkrOrder`, injected
  keys) — never scatter `isAdmin` checks in shared components.
- Branches: `main` = production, `staging` = trunk/staging. Both deploy to their respective Netlify env.
  Netlify fires **scheduled functions only on the production (`main`) deploy**.

---

## 3. The ingestion engine — "the routines" (lives OUTSIDE this repo)

Claude cowork cron tasks at `~/Documents/Claude/Scheduled/<id>/SKILL.md` (not in the repo). The
Supabase schema is the **contract** between them (writers) and the apps (readers).

**Mechanism shared by every routine:**
- **Reads Discord via Claude in Chrome** (the user's own account — not a bot).
- **Writes to Supabase via `curl`** with the **service-role key**, bypassing the `cc@claudiachez.com`-only
  RLS on `holdings`/`signals`. Every write is verified (an empty `[]` body = failure).
- **High-water mark = idempotency.** Each routine reads the newest `run_log.last_message_ts` for its
  channel, processes only newer messages, then writes a fresh `run_log` row — each item processed once.
- **Extracts intent, not the surface verb** — the host deliberately obfuscates alerts to fool copy-bots
  (a disguised "buy/hang on" can be a real Close); it may omit the ticker (name only). Never infer
  weights/conviction from sizing; flag genuine ambiguity rather than guessing. Edited-in-place Discord
  messages can defeat a naive high-water mark — cross-check an "(edited)" marker + stated episode number.

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Graddox → `live-notes-portfolio` → (fallback) `stream-library-stw` | `signals`, `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

---

## 4. The flows in detail

### Daily flow (morning 9am / afternoon 3pm)
The position model is **event-sourced** (see §5). Per changed ticker:
1. Read `live-notes-portfolio` — the host's real-time buy / sell / upsize / trim calls **and** his
   DD/thesis (posted here, not a separate channel).
2. Write a **`leg_transactions` diary row per leg event** (`action_label`, `price`, `weight` = lot on a
   BUY / remaining on a SELL, `notes` = the host's verbatim words). The **040 trigger** replays the diary
   and derives the `legs` scoreboard (status, entry/exit, realized P&L). Then a **direct `holdings` PATCH**
   of `last_action` / `action_date` / `current_weight` only. Sizing fallback when the host gives a total
   with no per-leg detail: the 90:10 (equity:options) / 20:80 (short:long) split from `app_config`
   (+ per-position `holdings.equity_pct` override) — existing legs are never re-split.
3. The `holdings` PATCH **auto-fires the 033 trigger** → a harmless `holding_transactions` audit row.
4. Notable commentary → append a `conviction_comments` row (`source='discord'`). Refresh
   `holdings.summary`/`bullets` + `dd_updated_at` only when the durable thesis actually changed.
5. Write the `run_log` mark with a multi-line **`digest`** → "Latest Portfolio Changes" in the Overview.
   Operational review-flags go to `run_log.summary` (admin-only), never the public digest.
6. **Recording fallback:** an unprocessed `stream-library-stw` recording → delegate to `stw-transcripts`.
   Morning also runs the **Graddox GEX step first** → `signals`.

### Weekly flow (Friday 5pm)
Read the full-portfolio snapshot from `updates-portfolio` and **truth-up every holding's
`current_weight`**. A ticker in `holdings` but absent from the snapshot is flagged, not auto-closed.

### Webinar flow (`stw-transcripts`)
Processes the newest unprocessed recording exactly once. From one Zoom transcript: **(A)** a
methodology-analysis `.md` (how the host thinks) saved to a local research library — **the only routine
output the apps never read**; **(B)** conviction notes (`source='streaming'`) + a thesis refresh when the
durable "why" changed.

---

## 5. Supabase tables — who writes, who reads

Event-sourced positions: **`leg_transactions`** (the diary — the only hand-written source) and **`legs`**
(the scoreboard — a pure trigger-derived projection). `holdings` carries the position-level row.

| Table | Primary writer | Read by |
|---|---|---|
| `holdings` | routines (+ admin editor) | Picks Overview, Ticker Details (thesis = `summary`+`bullets`), Trades |
| `leg_transactions` / `legs` | routines + admin ledger (write only `leg_transactions`; `legs` is trigger-derived) | Transaction History ledger, per-leg P&L split (shares vs options) |
| `holding_transactions` | **DB trigger** (migration 033) — never written directly | audit trail |
| `conviction_comments` | routines + `stw-transcripts` (explicit appends; `source` = `discord`/`streaming`); users can add notes | Ticker Details — Commentary |
| `signals` | **morning routine** (Graddox step) | GEX Signals panel (Signals tab) |
| `gex_snapshots` | **`gex-snapshot`** scheduled fn (web, FlashAlpha SPY, migration 067) | Macro GEX / Positioning module (replaced Graddox there 2026-07-10) |
| `run_log` | routines + scheduled Netlify writers | "Latest Portfolio Changes"; ingestion audit |
| `ticker_sector_map` | **`sector-map-sync`** fn + one-off migration | GICS sector (Risk concentration, heatmap, detail pane) |
| `macro_daily_snapshots` / `macro_daily_recaps` / `regime_daily` | scheduled Netlify fns | Macro 5D engine / recap / regime gate |
| `risk_config` / `risk_violation_acks` | subscriber Settings; **`ibkr_nlv` written by the Flex sync** (NAV section) | My Portfolio Risk tab |
| `user_positions` | web IBKR Flex pipeline — `_lib/flex-core.ts` via `ibkr-flex.ts` (interactive) + `ibkr-sync-cron.ts` (nightly, prod-only) (user-owned RLS) | My Portfolio |
| `user_executions` | same pipeline `<Trades>` (append-only), **plus `ibkr-import.ts`** one-time XML upload in *refresh* mode (updates existing fills, e.g. backfills prices) (user-owned RLS) | TCA (`scripts/tca.mjs`, admin/CLI) |
| `regime_exit_audit` | `risk_config` trigger (user-owned RLS) | audit trail of REGIME_EXIT edits |
| `profiles` / `tiers` | auth + Settings | AccessGate paywall, Settings |
| `app_config` | admin Config page | sizing/capital defaults, IBKR kill switch, regime sleeve weights |

**RLS:** `holdings`/`signals` writes restricted to `cc@claudiachez.com` (routines bypass via
service-role key). `user_positions` / `user_executions` / `risk_config` / `regime_exit_audit` are
user-owned (DB-layer multi-tenancy proven on PROD 2026-07-10 — see `docs/launch_gates.md`).

---

## 6. The Macro dashboard (subscriber-facing)

A weighted **Market Regime** read (Trend 30% · Volatility 20% · Credit 15% · Rates+Dollar 15% · GEX 20%,
admin-configurable) plus supporting modules. Macro **index** indicators come from **FRED** (VIX, VIX3M,
US10Y, HY-OAS credit, dollar) via a server-side proxy; equity closes from TwelveData; GEX from
`gex_snapshots` (FlashAlpha SPY, written by the `gex-snapshot` scheduled fn — replaced Graddox 2026-07-10).
Event Risk uses FRED's release calendar + a static FOMC list. Full feed detail:
[`docs/feeds.md`](feeds.md); subscriber help: `docs/macro_dashboard_guide.md`.

---

## 7. The IBKR pipelines (three independent systems — do not conflate)

1. **Admin local option pricer + order placement** — `apps/admin/ibkr_proxy.py`, a **local** Flask
   server (`localhost:8765`) talking to IB Gateway via `ib_insync`. Prices STW's option legs (browser
   then writes `legs.mark_price`), and — gated by `canEdit` + `app_config.ibkr_live_trading_enabled` +
   `onExecuteIbkrOrder` (wired only in `apps/admin`) — places **real orders**. A confirmed fill patches
   the diary row's price. Local only; never deployed. Admin-only, single-account.
2. **Subscriber Flex Query sync** — `apps/web/netlify/functions/ibkr-flex.ts`, serverless. Client JWT →
   function reads the subscriber's Flex token from `profiles` (service key) → IBKR cloud → writes the
   subscriber's **own open** positions to `user_positions`. The raw token never reaches the browser.

---

## 8. Mental model (the one-liner)

**The routines (out-of-repo cron, browser-read Discord + service-key Supabase writes) are the writers;
the apps are the readers; Supabase is the contract.** Positions are event-sourced — hand-write the
`leg_transactions` diary; `legs` is a trigger-derived projection. Change the schema and you affect both
sides at once.
