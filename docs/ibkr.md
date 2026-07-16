# IBKR pipelines (three separate systems)

> Moved out of CLAUDE.md. The three pipelines are independent — don't conflate them.

## IBKR Pipelines (three separate systems)

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

### Admin — local real order placement (added 2026-07-03)
The same `ibkr_proxy.py` also exposes `POST /place_order` and `GET /order_status/<id>`
(write-capable `ib_insync` session, `readonly=False` — the pricer above stays `readonly=True`).
The admin browser calls it from a row-scoped "Open via IBKR" / "Close via IBKR" button in
`LegTimeline.tsx`, which opens a modal asking for real quantity + order type (legs are
weight-only — see `legs.ts`'s header comment — so quantity can never be derived from weight,
only suggested via `app_config`'s capital-allocation defaults). A confirmed fill PATCHes the
triggering diary row's price/`broker_*` columns (open) or inserts a new Closed diary row (close) —
never the requested/guessed price. Gated by `canEdit` + `app_config.ibkr_live_trading_enabled` +
`AppCapabilities.onExecuteIbkrOrder` only being wired in `apps/admin/src/main.tsx`.
**This is explicitly admin-only, local-proxy-only, single-account.** Do not extend it to
arbitrary subscribers without a separate legal/compliance review — that would need an entirely
different integration (IBKR's Client Portal Web API, or Alpaca's OAuth trading API per
`plans/20260524_mobile-transition.md`), not more gating on this one. `IB_PORT` is an env var
(`IB_PORT=4002` for paper mode) so testing never requires editing the file.

### Subscriber — Flex Query portfolio sync
**One shared pipeline** — `apps/web/netlify/_lib/flex-core.ts` (`fetchFlexReport` two-step Web Service
call → `parseFlexReport` → `persistFlexResult`) — used by **three callers; never fork it**:
- **`ibkr-flex.ts`** — interactive per-user sync (browser sends its Supabase JWT → function verifies,
  reads `ibkr_flex_token` + `ibkr_query_id` from `profiles` via service key, calls IBKR; the raw token
  never reaches the browser). Short poll budget (Netlify 10s limit).
- **`ibkr-sync-cron.ts`** — scheduled (08:00 UTC Tue–Sat), syncs **every connected user** so fills stay
  complete even if the user never opens the app. **Only fires on the prod (`main`) deploy** (Netlify
  scheduled-fn rule) — dormant on staging.
- **`ibkr-import.ts`** — JWT-auth one-time **XML upload** (the user exports a long-period report from the
  IBKR portal, which builds big reports the Web Service refuses). Executions-only; backfills / **repairs**
  history the short live window can't reach.

**The one Activity Flex report carries up to FOUR sections, persisted with different semantics:**
- `<OpenPositions>` → `user_positions` — **mutable snapshot**, delete-all-then-insert every sync.
- `<Trades>` → `user_executions` — **append-only log**, upsert on `(user_id, ibkr_exec_id)`. **Write mode
  matters:** the sync uses `append` (`ignoreDuplicates` — a seen fill is never re-touched); the **import
  uses `refresh`** (update-on-conflict) so re-importing an authoritative export *corrects* existing rows
  (e.g. backfills a price an older Trade-Price-less sync stored null). Fill instant ET-wall-clock→UTC, raw
  string kept (`exec_datetime_raw`). Consumed by TCA (`scripts/tca.mjs`).
- `<EquitySummaryInBase>` latest `total` → `risk_config.ibkr_nlv` (live equity; the "one value, one
  source" denominator). Written by the **sync**, NOT the import.
- `<ChangeInNAV>` `depositsWithdrawals` → **parsed but not yet persisted** — reserved for the pending
  cash-flow-adjusted drawdown rebuild (Next Steps #1).

**Field rules (in `flex-core.ts`):** **Trade Price** is the fill price; **Orig Trade Price** is a lookalike
that's frequently `"0"`, so it's a last resort used **only when positive** — never store a $0 fill.
**Cost Basis Money** falls back to `costBasisPrice × qty × multiplier`. `parseFlexReport` returns a
**`warnings[]`** of mis-ticked-template gaps (no Trade Price / no NAV section / Trades not at Execution
LOD / no Open Positions), surfaced as an amber strip on Settings after a sync.

**Recommended subscriber query = Activity Flex, Period "Last 7 Days"** — a large YTD query makes the Web
Service return `1001 "could not be generated"` (it also throttles a query hard when hit repeatedly). Short
window + daily cron + append-only = no fill ever dropped; full history comes from the import. The
`SettingsPage.tsx` `CONNECT_STEPS` walkthrough documents the exact fields + lookalike traps (IB vs External
Execution ID; Trade Price vs Orig; Currency vs IB Commission Currency) and the General-Config defaults the
parser depends on (yyyyMMdd/HHmmss, Breakout by Day = No).

`flex-core.ts` uses **supabase-js with the `ws` Realtime-transport shim** (a sanctioned exception to the
"no supabase-js in functions" convention below — the delete/insert/upsert flows are cleaner with the
client, and the shim avoids the import-time WebSocket crash). Env vars (web site): `VITE_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`.

These three IBKR pipelines are independent (admin proxy prices/trades STW's own account; the subscriber
functions only ever read a subscriber's own account). Do not conflate them.

---

