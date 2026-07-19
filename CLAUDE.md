# STW Companion — Claude Code Guide

**Branches:** `staging` = trunk (auto-deploys to both staging Netlify sites); `main` = prod.
Never commit to `staging`/`main` directly, never force-push/reset them, never open OR merge a
`staging → main` promotion without explicit host approval. Every change:
`git checkout -b claude/<feature> origin/staging` → push → PR to `staging` (host merges).

**Start every session:** `git fetch origin && git checkout staging && git pull --ff-only`.
Current status, migration high-water, and pending items → **[docs/status.md](docs/status.md)** (read first).
CI (`.github/workflows/ci.yml`) runs typecheck/lint/test/fn-parity on every PR. Run **`/stw-review`**
before opening one.

## Ground rules
- Shared styling/logic/data lives ONCE in `packages/*` — never forked across apps.
- Timestamps use `fmtDateTime` from `@stw/shared` (`Mon D · H:MM AM ET`) — never `toLocale*` or a
  local helper. Reuse shared formatters (`fmtOptionExpiry`, `fmtLegInstrument`, money/pct/weight) —
  never re-implement (no hand-rolled month arrays / date slicing).
- Every displayed value carries a named **source** + an as-of `fmtDateTime` stamp, and a **prior-period
  comparison** (default vs yesterday) — never a bare number.
- Derived-number logic lives only in `@stw/shared`.
- All UI works at ≤390px (mobile-first).
- Refer to the host generically ("the host") in prose/commits/comments; literal identifiers
  (RLS emails, UUIDs) excepted.
- Migrations: Claude authors, the host applies — a merged PR ≠ a migrated DB.
- If instructions conflict, ask before acting. After ~10 commits (or session end), run `/wrap-up`.

## Docs map (load on demand — don't inline them here)
- **[docs/status.md](docs/status.md)** — current state, pending, next work (transient).
- **[docs/decisions.md](docs/decisions.md)** — locked product/architecture decisions, full rationale.
- **[docs/ui-conventions.md](docs/ui-conventions.md)** — the standing UI rules.
- **[docs/routines.md](docs/routines.md)** — who writes each table + the ingestion cron routines.
- **[docs/ibkr.md](docs/ibkr.md)** — the three IBKR pipelines.
- **[docs/drawdown-alerts.md](docs/drawdown-alerts.md)** — drawdown-alert channels (in-app + email/Resend) + setup env + the Discord-DM option.
- **[docs/macro.md](docs/macro.md)** + **[docs/feeds.md](docs/feeds.md)** — Macro wiring + feed inventory/limits.
- **[docs/design-system/CONTRIBUTING.md](docs/design-system/CONTRIBUTING.md)** — tokens + primitives.
- **[docs/session-history.md](docs/session-history.md)** — dated handoff archive.

## Architecture
One pnpm workspace; two thin shells over shared packages, differing only by capability.
| App | Folder | Capabilities |
|--|--|--|
| Subscriber web | `apps/web` | auth + tier paywall, Portfolio, IBKR Flex sync, Settings |
| Admin | `apps/admin` | no paywall, Edit/Users/Config, IBKR pricer + order placement |

`@stw/shared` = framework-agnostic logic (types, tiers, format, pnl, options, filters,
macro/regime/limits scorers + tests). `@stw/ui` = React features/components/hooks/primitives.

**Layer rules:** `@stw/ui` takes everything via props/context — no app imports, env, or routes
(Supabase client + `VITE_*` injected per app). All admin/subscriber differences flow through ONE
`AppCapabilities` context (`isAdmin`, `canEdit`, `showIbkrBadge`, `canViewHistory`, `canUseLimits`,
`onEditHolding`, `onExecuteIbkrOrder`, `finnhubKey`, `twelveDataKey`) — never scatter `isAdmin` deep
in shared code. `onExecuteIbkrOrder` is wired only in `apps/admin` — that (not a UI gate) keeps real
order placement out of web. `plans/` files are date-prefixed `YYYYMMDD_<name>`.

## Dev / deploy
- `pnpm` not on PATH → `corepack pnpm …` or `~/.local/bin/pnpm`. Scripts: `dev:web|dev:admin|build|
  typecheck|test|lint|check:fn-parity`.
- No local Postgres — apply migrations via the Supabase SQL editor. Prod read-only service key:
  `~/Documents/Claude/Scheduled/.supabase-service-key`.
- Two Netlify sites, same branch, differ by base dir. Each `netlify.toml` `ignore` rebuilds only when
  its app dir / a shared package / a root manifest changed — a doc-only "Canceled" deploy is correct.

## Database (Supabase `usmqbohcjcyszjxxvnqu`)
- `supabase/migrations/` is the single source of truth. Tables: `holdings`, `signals`,
  `legs`/`leg_transactions` (event-sourced), `conviction_comments`, `run_log`, `user_positions`,
  `user_executions`, `risk_config`, `regime_exit_audit`, `regime_daily`, `ticker_sector_map`,
  `categories`, `traders`, `app_config`, `gex_snapshots`, `macro_daily_snapshots`/`_recaps`,
  `profiles`/`tiers`, `ops_log`.
- RLS: `holdings`/`signals` write = editor only; `user_*`/`risk_config`/`regime_exit_audit` = user-owned.
- `holding_transactions` is trigger-logged (016) on any `holdings` action change — never written
  directly. `holdings.action_date` is a SEPARATE write path from a leg's own date — fix both.
- Destructive migration → snapshot affected tables to gitignored `backups/` first.
- Who writes what → **docs/routines.md**.

## Conventions
- **Netlify fns:** direct `fetch()` to Anthropic + Supabase REST — never `@anthropic-ai/sdk` or
  `@supabase/supabase-js` (both crash the Node runtime; `flex-core`'s supabase-js+ws is the one
  sanctioned exception). `.trim()` every env var. Shared functions live ONCE in the `@stw/functions`
  workspace package; each app's `netlify/functions/<name>.ts` is a thin re-export (bundles like
  `@stw/shared`). `pnpm check:fn-parity` still guards any remaining per-app copy byte-identical.
  `schedule(...)` fns run cron ONLY on the prod (`main`) deploy.
- **One value, one source** — never two pipelines for one number: account equity = `risk_config.ibkr_nlv`;
  Macro GEX = `gex_snapshots`; live equity quotes = Finnhub via `priceCache` (`useLiveQuotes`); regime
  gate = `regime_daily` (read the latest COMPLETE row — VIX lags a day).
- **Tickers:** every ticker is a `TickerLink` to its detail (except Macro index/ETF symbols — no detail
  page). A new row field ships with its filter + sort on every list surface that shows it, same change.
- **Sector taxonomy:** GICS-11 + `ETF` + `Cash` (`resolveSector`); auto-mapped by `sector-map-sync`,
  manual override via admin Sector dropdown. "Basket" (thematic `categories`, the UI label) ≠ "Sector"
  (GICS). ETF/Cash excluded from sector concentration.
- **Counts:** "Positions" excludes the `CASH` row and reflects the active filter; FilterBar shows `N of {total}`.
- **UI:** reuse existing primitives/idioms (`DetailPane`, `KpiCard`, `StatusPill`, `Modal`, `DataTable`,
  `HelpToggle`, the P&L-row style) — never invent chips/cards/underlines. Detail-pane twins
  (`HoldingDetail` ↔ `PortfolioPositionDetail`) stay at parity. Full rules → **docs/ui-conventions.md**;
  design tokens (dark default, eslint bans literal colors/font-sizes) → **docs/design-system/CONTRIBUTING.md**.

## Decisions locked (index — full rationale in [docs/decisions.md](docs/decisions.md))
- **Event-sourcing:** `leg_transactions` (diary) is the only hand-written source; `legs` (scoreboard)
  is trigger-derived. Weight = lot(BUY)/remaining(SELL), BUYs accumulate. P&L split by asset class,
  never blended. Convert-to-shares close books the option's real exit price. Ledger-only leg editing.
- **"Legacy" = conviction tier 6, not a sector.** Low conviction ≠ no legs.
- **Admin IBKR trading:** admin-only, local-proxy-only, single-account. Legs are weight-only (%)
  forever — quantities entered at order time, never derived. Only a confirmed fill patches a diary price.
- **Risk engine:** 4 tiers (`ok|near|breach|unevaluated`; near ≥80%; unevaluated never a breach).
  Advisory/display-only — never blocks. Any `risk_config` % uses `account_equity`/`ibkr_nlv` as the
  denominator, never re-derived from the same positions.
- **Drawdown:** cash-flow-adjusted off live NLV (`cashflowAdjustedDrawdownPct`); `cumulative_cashflow`
  written by IMPORT only; silent until real NLV+peak exist. Ladder vs double-RED regime = independent
  triggers reconciled by "tightest binds" (`bindingGrossTarget`).
- **REGIME_EXIT:** per-user `risk_config` setting, advisory/display-only, one source `regimeExitAdvice`.
- **Frozen:** regime gate at engine 1.1.0; the gate and the Macro composite never blend; no new gate indicators.

## Tech stack
React 18 + Vite 5 + TS · pnpm workspace · react-router 6 · TanStack Query 5 (60s stale) · Zustand 5 ·
Supabase (auth/PG/RLS) · Tailwind 3 + CSS-var tokens · lightweight-charts, react-gauge-component.
Prices: Finnhub (live), TwelveData (daily closes), IBKR proxy (option legs).
