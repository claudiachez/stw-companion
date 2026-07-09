# Data Feeds — current state

The live map of every external data feed STW Companion uses: what it serves, its limits, and where
it's consumed. This is the **current-state** companion to the proposal/inventory in
[`plans/20260707_data_feeds_inventory_and_plan.md`](../plans/20260707_data_feeds_inventory_and_plan.md)
— that doc is the reasoning; this doc is the result. Last synced with the codebase: **2026-07-10**
(FRED re-platform + GICS taxonomy).

Keep this current when a feed, key, rate limit, or consumer changes — it's referenced by the
Session-Close doc-maintenance step.

---

## The feeds at a glance

| Feed | Key (env) | Tier / limit | Serves (current) | CORS / access |
|---|---|---|---|---|
| **FRED** | `FRED_API_KEY` (server-side, no `VITE_`) | Free, ~120 req/min, no daily cap | Macro **index** indicators (VIX, VIX3M, US10Y, HY-OAS credit, dollar) **+ the Event Risk release calendar** | **No CORS** → browser reads via the `fred` Netlify proxy; writers call FRED directly |
| **TwelveData** | `VITE_TWELVEDATA_KEY` | Free, **8 credits/min, 800/day, 1 credit/symbol** | **Equity daily closes only** — trend ETFs (SPY/QQQ/IWM/RSP/VEA) + Sector-Rotation constituents | CORS OK (client-direct) |
| **Finnhub** | `VITE_FINNHUB_KEY` | Free, ~60/min | Live **stock** quotes; `profile2` (industry, for `sector-map-sync`) | CORS OK; free tier serves neither index symbols nor daily candles |
| **IBKR — local proxy** | none (localhost) | Gateway pacing only | Admin option-leg marks (`legs.mark_price`) + real order placement | `apps/admin/ibkr_proxy.py`; never deployed |
| **IBKR — Flex Web Service** | per-subscriber token in `profiles` | ~1 req / few-min per token | Subscriber's own **open** positions → `user_positions` | via `apps/web/netlify/functions/ibkr-flex.ts` |
| **Anthropic** | `ANTHROPIC_API_KEY` (server-side) | Pay per token | Macro daily recap (AM/PM) | functions only |

> Retired 2026-07-10: the **MarketWatch** economic-calendar scrape (`cheerio`) — replaced by FRED's
> release calendar. `cheerio` is now an unused dependency (safe to drop). **VVIX** was dropped
> entirely (no free feed serves it).

---

## FRED (the macro-index + event-calendar source)

- Series ids + pure URL/parse helpers: `packages/shared/src/utils/fred.ts` — `FRED_SERIES`
  (`vix`→`VIXCLS`, `vix3m`→`VXVCLS`, `us10y`→`DGS10`, `hyOas`→`BAMLH0A0HYM2`, `dollar`→`DTWEXBGS`),
  `buildFredUrl`, `parseFredObservations` (drops `.` missing rows, returns ascending).
- **Server-only (no CORS).** The browser hooks call the same-origin **proxy** at
  `/.netlify/functions/fred?series=…` (`apps/{web,admin}/netlify/functions/fred.ts`); the scheduled
  writers (`macro-snapshot`, `regime-daily`, `macro-events`) call FRED directly. `FRED_API_KEY` stays
  server-side — the pattern to prefer for any new key.
- Browser cache: `packages/ui/src/features/macro/fredCache.ts` (localStorage, daily TTL, mirrors `maCache`).
- **Notable wins vs the old TwelveData wiring:** DGS10 is already a percent (no ×10 TNX hack); HY OAS
  is the real ICE BofA spread (upgrade over the HYG-price proxy); VXVCLS makes `regime-daily`'s
  `vol_state` term-structure check resolve (was perpetually `UNKNOWN`); FRED's 120/min removes the
  cold-load bottleneck that TwelveData's 8/min caused for the indices.
- **Event Risk** (`macro-events.ts`): FRED `/fred/release/dates` **per release_id** — CPI `10`,
  PCE `54`, Employment/NFP `50`, GDP `53`, PPI `46` — window-filtered, plus a static
  `FOMC_DECISION_DATES` list. A calendar has no actual/consensus values, so `classifyEventRisk`'s
  surprise/shock path no-ops; the upcoming-event windows work. **FOMC dates are hardcoded best-effort
  — verify against the Fed's published schedule when they roll over.**

## TwelveData (equity daily closes)

- Cache/helpers: `packages/ui/src/features/macro/maCache.ts`.
- **Bills 1 credit per symbol, not per HTTP call**, on an ~8/min free tier. Always route batches
  through `tdBatchCloses` / `fetchClosesChunked` (≤8 symbols, ~65s pacing) — never one big unchunked
  call. **Indices are OFF TwelveData now — do not add index series back to it.**

## Shared pacing

`runPaced` + `FEED_LIMITS` in `packages/shared/src/utils/pacing.ts` is the one chunk-and-pause throttle
every feed routes through (FRED / Finnhub / TwelveData). Reuse it for any new feed rather than
re-implementing pacing.

## Sector taxonomy (Finnhub `profile2` → GICS)

- Canonical set = **GICS-11 + ETF + Cash** (`packages/shared/src/constants/sectors.ts`).
- `ticker_sector_map.sector` holds a GICS value; `resolveSector(ticker, finnhubLabel?)` = `TICKER_GICS`
  override → `FINNHUB_GICS` fold (Finnhub industries roll up to GICS along the real hierarchy) → null.
- **`sector-map-sync`** (`apps/web/netlify/functions/sector-map-sync.ts`, weekdays 22:00 UTC + manual)
  maps newly-opened `holdings` tickers via Finnhub `profile2`; unresolved names left for review. The
  **admin Ticker-detail editor's Sector dropdown** sets a ticker's sector by hand (writes
  `ticker_sector_map`) — the fix for names Finnhub can't resolve (e.g. CCXI / SPAC shells). ETF /
  Cash are excluded from Risk sector-concentration.

---

## Scheduled writers (which feed, which cadence)

| Function | Site | Cadence | Feeds | Writes |
|---|---|---|---|---|
| `macro-snapshot` | web | weekdays 21:30 UTC | FRED (indices) + TwelveData (equity) | `macro_daily_snapshots` (5D engine) |
| `regime-daily` | admin | weekdays 23:00 UTC | FRED (VIX/VIX3M/US10Y) + TwelveData (IWM/SPY/QQQ) | `regime_daily` (PROD backfilled 4,200 rows; cron fires on the `main` deploy — promotion #87) |
| `sector-map-sync` | web | weekdays 22:00 UTC | Finnhub `profile2` | `ticker_sector_map` |
| `macro-recap-am/pm` | web | weekdays 12:00 / 21:30 UTC | Anthropic | `macro_daily_recaps` |

> Netlify fires scheduled functions **only on a site's production (`main`) deploy** — not on branch/
> `staging` deploys. So these self-populate on prod only. Note a `schedule()`-wrapped function is
> **cron-only over HTTP** — it can't be tested by hitting its URL (even on staging); run it locally via
> `netlify functions:invoke --querystring` or the esbuild-bundle harness (see CLAUDE.md → Conventions →
> Netlify Functions). All are `run_log`-instrumented (`run_type` = the function name).

---

## Feed usage by page / module (rate-vs-need matrix)

Where each feed surfaces and whether its limit comfortably covers the need. Refresh rate = how often
that surface pulls the feed (TanStack Query `staleTime` for live/on-load reads; cron cadence for
scheduled writers). Post-re-platform, every row is within limits — the old TwelveData-index bottleneck
is gone.

| Page | Module | Feed (current) | Refresh rate | Limit | Status |
|---|---|---|---|---|---|
| **Stock Picks** | Overview — Heatmap (Today color) | Finnhub | live, 60s | 60/min | OK — ~53 tickers |
| Stock Picks | Overview — Sector grouping | `ticker_sector_map` (GICS) | 1h | — | OK |
| Stock Picks | List + detail — live price | Finnhub | 60s | 60/min | OK |
| Stock Picks | Ticker detail — option leg marks | IBKR local proxy (admin) | on-demand | none | OK — admin-only |
| Stock Picks | Ticker detail — regime badge | TwelveData daily closes | 1x/day cache | 8/min | OK (equity, paced) |
| **Macro** | Summary / Recap | Anthropic | 2x/day (8am/4:30pm ET) | pay-per-token | OK |
| Macro | Trend / Score Strip / Banner (equity ETFs) | TwelveData daily closes | 1x/day cache | 8/min | OK (equity, paced) |
| Macro | Market Internals — Vol / Credit / Rates (indices) | **FRED** (VIXCLS/BAMLH0A0HYM2/DGS10/DTWEXBGS) | on load, daily | ~120/min | OK |
| Macro | VIX value | **FRED** (VIXCLS) | on load | ~120/min | OK (Finnhub free won't serve indices) |
| Macro | Sector Rotation | TwelveData daily (constituents) | 1x/day cache | 8/min | OK (paced) |
| Macro | GEX / Positioning | Supabase `signals` | 1x/day | — | OK |
| Macro | Event Risk | **FRED** release calendar + static FOMC | on load | ~120/min | OK (surprise/shock N/A — calendar has no values) |
| Macro | 5D trend engine | `macro_daily_snapshots` (← writer: FRED + TwelveData) | 1x/day 4:30pm | — | OK on prod after promotion |
| **My Portfolio** | Overview — Heatmap (Total only) | stored marks (Supabase) | on sync | — | OK (no live day-change feed) |
| My Portfolio | Positions | IBKR Flex Web Service | manual sync | ~1/few-min/token | OK — open positions only |
| My Portfolio | Risk — sector concentration | `ticker_sector_map` (GICS) | 1h | — | OK (ETF/Cash excluded) |
| My Portfolio | Tailing | Supabase `holdings` | on load | — | OK |
| **Signals** | GEX charts | Finnhub + TwelveData | 60s / daily | 60/min · 8/min | OK |
| **Backend (scheduled)** | `macro-snapshot` | FRED (indices) + TwelveData (equity) | 1x/day wkdays | — | OK — prod deploy only |
| Backend | `regime-daily` | FRED (VIX/VIX3M/US10Y) + TwelveData (IWM/SPY/QQQ) | 1x/day wkdays 23:00 UTC | — | scheduled; PROD backfilled; cron live after promotion #87 |
| Backend | `sector-map-sync` | Finnhub `profile2` | weekdays 22:00 UTC | 60/min | OK — prod deploy only |
| Backend | `macro-recap-am/pm` | Anthropic | 2x/day wkdays | pay-per-token | OK — prod deploy only |

## Env vars (set on both Netlify sites unless noted)

`FRED_API_KEY` (server-side) · `VITE_TWELVEDATA_KEY` · `VITE_FINNHUB_KEY` · `ANTHROPIC_API_KEY` ·
`SUPABASE_SERVICE_ROLE_KEY` · `VITE_SUPABASE_URL`. Optional: `MACRO_RECAP_MODEL`. All function env
reads use `.trim()`.
