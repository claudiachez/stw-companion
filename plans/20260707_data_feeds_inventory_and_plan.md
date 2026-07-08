# Data Feeds + Sector Categories — Inventory & Plan

> Status: **PROPOSAL — awaiting host approval before any feed/schema code.**
> Author pass: 2026-07-07. Scope: Next Steps #1 (data feeds + sector categories) folding in
> #2 (integrity guardrails: regime backfill + cron verification) and #6 (stale `macro_daily_snapshots`
> PROD writer). This is an inventory + plan only — no code written yet.

---

## Part 1 — API Inventory (what we have, limits, what it does/doesn't serve)

| API | Key / access | Rate / quota (free tier we're on) | Serves today | Does NOT serve |
|---|---|---|---|---|
| **Finnhub** | `VITE_FINNHUB_KEY` (client) + same in functions' `process.env` | ~60 calls/min, 30 calls/sec burst | Live **stock** quotes (`/quote` → `.c`) across Picks / My Portfolio / Heatmap / regime badge; company `profile2` (used once, by hand, to seed `ticker_sector_map`) | **Index symbols** (`^VIX`, `^TNX`, …) — empty on free tier; **daily OHLC history** (we use TwelveData for that) |
| **TwelveData** | `VITE_TWELVEDATA_KEY` (client) + functions' `process.env` | **8 credits/min, 800 credits/day, 1 credit PER SYMBOL** (comma-joined batch does NOT save credits) | Daily OHLC (`/time_series`) for all MAs; the authoritative close source for VIX / VVIX / TNX (US10Y) / UUP / HYG; Sector-Rotation constituents; regime-daily's VIX/VIX3M/TNX + IWM/SPY/QQQ | Realtime intraday (we don't need it); anything beyond ~19–20yr history in one call (outputsize cap 5000) |
| **IBKR — local proxy** | `apps/admin/ibkr_proxy.py` → IB Gateway `127.0.0.1:4001` (`ib_insync`) | No API quota (local); Gateway pacing only | Admin-only: prices STW option legs → `legs.mark_price`; places/statuses real orders (`/place_order`, `/order_status`) | Anything cloud/subscriber; never deployed |
| **IBKR — Flex Web Service** | Per-subscriber `ibkr_flex_token` + `ibkr_query_id` in `profiles`, via `apps/web/netlify/functions/ibkr-flex.ts` | IBKR caps token reuse (~1 req / few min per token) | Each subscriber's **own open positions** → `user_positions` (delete-all-then-insert) | Closed-position history (open only — see Next Steps #9); intraday marks |
| **Anthropic** | `ANTHROPIC_API_KEY` (functions only) | Pay per token; no hard cap | Macro daily recap AM/PM (`macro-recap-am/pm`), admin Regenerate. Sonnet → Haiku fallback (`MACRO_RECAP_MODEL` override) | — |
| **MarketWatch** (scrape) | none | none (defensive HTML scrape; returns `source:'unavailable'` on any parse failure) | Economic-event calendar (CPI/PCE/FOMC/NFP) via `macro-events.ts` → Event Risk overlay | Anything structured/reliable — explicitly an interim source per its header |

**The binding constraint is TwelveData's 8-credit/min free tier.** Everything slow or flaky in the
Macro/Picks cold-load path traces back to it. Finnhub, Anthropic, and IBKR are comfortably within
limits for our volume.

### Where each feed is consumed (code map)
- **Live quotes (Finnhub):** `useTickerRegime.ts`, `PicksView`, `PortfolioDashboard`, `HoldingDetail`,
  `LegTimeline`, `PortfolioHeatmap`, GEX charts, macro VIX/VVIX quote attempts.
- **Daily closes (TwelveData) via `maCache.ts`:** `tdDailyCloses` (single), `tdBatchCloses` (≤8/chunk,
  65s pacing), `fetchClosesChunked` (sector constituents). Consumed by every macro module hook
  (`useMacroIndicators`, `useVolatilityStress`, `useCreditLiquidity`, `useRatesDollar`,
  `useSentimentGauge`, `useSectorRotation`) and `useTickerRegime`.
- **Sector map:** `fetchSectorMap()` (`limits/api.ts`) → `useSectorMap()` (`useRiskConfig.ts`,
  1h staleTime) → Risk-tab `sectorConcentration`, detail-pane Sector row, Heatmap "Sector" grouping.
- **Scheduled writers (Netlify functions, service-role key, direct REST):** `macro-snapshot.ts`
  (web, `30 21 * * 1-5`), `macro-recap-am/pm.ts` (web), `regime-daily.ts` (admin, **NOT scheduled**).

---

## Part 2 — Current State (verified against PROD `usmqbohcjcyszjxxvnqu`, 2026-07-07)

### Sector map (`ticker_sector_map`) — 53 rows, 13 distinct sectors
Finnhub `profile2`'s taxonomy, finer and messier than a clean GICS-11:

| Finnhub sector | n | Notes / problem |
|---|---|---|
| Technology | 18 | catch-all — includes software, networking, identity |
| Electrical Equipment | 13 | **lumps solar (ARRY, SHLS, FSLR?), fuel cells (BLDP), batteries (ENS), grid** — too broad, wrong for a rotation/concentration read |
| Semiconductors | 6 | split OUT of Technology (GICS folds these under Info Tech) |
| Aerospace & Defense | 4 | reasonable |
| Construction | 2 | AMRC, GLDD |
| Retail | 2 | AMZN, GME |
| Telecommunication | 2 | IRDM, LUMN |
| Automobiles / Banking / Communications / Energy / Financial Services / Marine | 1 each | **Banking (JPM) vs Financial Services (HOOD)** split arbitrarily; Marine (PANL) is a singleton |

**Gaps:**
- **No auto-refresh writer.** The map was hand-seeded once from Finnhub. When a new ticker opens it
  gets no sector until someone re-seeds by hand. **CCXI** (a real, open 3.4% position — the "Agility
  Robotics SPAC") is already unmapped for exactly this reason.
- **ETFs / CASH have no market sector** and legitimately never will: ARKK (closed), SQQQ (closed
  inverse ETF), CASH (balance row). These should be *classified as "ETF"/"Cash"/excluded*, not left
  as an "unevaluated" red flag on the Risk tab.

### `macro_daily_snapshots` — 2 rows (7/6, 7/7), both BROKEN
Both rows have `engine_version = null` and **null `trend` / `volatility` / `credit` / `rates_dollar`
scores** (only `gex`/`regime`/`risk_appetite` = 35). `run_log` has **0** `macro-snapshot` rows.
→ **PROD is running the stale pre-instrumentation `macro-snapshot` build.** The fixed, paced,
instrumented **v1.1.0** writer (engine_version stamp, ≤8/65s pacing, run_log, 120s timeout) is on
`staging` and will not take effect on PROD until the pending promotion. Until then the 5D trend
engine has no valid trend/vol/credit history to read.

### `regime_daily` — 0 rows, never run
The `regime-daily.ts` writer (integrity-guardrails Item 3) exists and is correct, but it is a **plain
handler with no `schedule()` wrapper**, and the backfill (`?backfill=1&days=N`) was never invoked.
`run_log` has 0 `regime-daily` rows. So the regime gate has no history at all yet.

---

## Part 3 — Proposed Plan (phased, approval-gated)

The work splits cleanly into **(A) sector taxonomy**, **(B) feed reliability/instrumentation**, and
**(C) the two dangling integrity-guardrail items**. A and B need host decisions (Part 4) before code.

### Phase 0 — Unblock what's already fixed (no new code; approval-gated because it's a prod deploy)
- The stale `macro_daily_snapshots` writer + everything else is fixed on `staging`. This is resolved
  **by the pending `staging → main` promotion**, which needs explicit host approval (Next Steps #0).
  Nothing to build; flagged here so it isn't re-diagnosed as a code bug. After promotion, verify one
  fresh snapshot row carries a non-null `engine_version` + real trend/vol scores + a `run_log` row.

### Phase A — Sector taxonomy (the core of Next Steps #1)
1. **Decide the canonical taxonomy** (Part 4, Q1) — recommendation: a fixed **GICS-11 + ETF + Cash**
   set, stored as a code-level constant in `@stw/shared` (`SECTORS` union type) so the Risk engine,
   Heatmap, and detail pane all validate against one list.
2. **Add a Finnhub→canonical mapping layer.** Keep `ticker_sector_map` as the store, but its `sector`
   column becomes one of the canonical values. A small pure map (Finnhub label → GICS bucket) folds
   the 13 messy labels into 11 (e.g. Semiconductors + Electrical-Equipment-that-is-really-tech →
   Information Technology; Banking + Financial Services → Financials; solar/fuel-cell → decide:
   Energy vs Industrials vs Utilities). Live in `@stw/shared`, unit-tested.
3. **Auto-refresh path** (Part 4, Q2) — recommendation: a new scheduled Netlify function
   `sector-map-sync` that, on a cadence (e.g. daily or weekly), finds `holdings` tickers missing from
   `ticker_sector_map`, calls Finnhub `profile2`, maps to canonical, and upserts. Idempotent; logs to
   `run_log` (same standard as macro-snapshot/regime-daily). ETFs/CASH classified explicitly, never
   left null. This closes the "CCXI has no sector" gap permanently.
4. **Re-seed the existing 53 rows** through the new mapping (one-off SQL or a `?backfill=1` call to
   the new function) so history matches the canonical taxonomy.
5. **UI:** ensure the Risk tab treats "ETF"/"Cash" as excluded-from-concentration, not `unevaluated`;
   confirm Heatmap "Sector" grouping + detail-pane badge read the canonical labels.

### Phase B — Feed reliability (TwelveData pacing + instrumentation)
Mostly already done on `staging` (pacing helpers, run_log instrumentation). Remaining:
1. **Verify the paced cold-load actually populates** end-to-end after promotion (regime badge renders;
   snapshot scores non-null) — Next Steps #3/#6.
2. **Consider a shared TwelveData credit budget.** Today Sector Rotation + Ticker Regime pace
   *independently* and can collide at a chunk boundary (documented residual gap). A single
   module-level pacing queue would remove that class of flakiness — propose as a follow-up, not P0.
3. **Document the daily 800-credit budget** against actual consumption (snapshot ~10/day +
   regime-daily ~5/day + per-user cold loads) so we know how much headroom a paid tier would buy.

### Phase C — Integrity guardrails (Next Steps #2, independent of any merge)
1. **Schedule `regime-daily`** — add the `schedule()` wrapper + a cron entry in admin `netlify.toml`
   (after-close, e.g. `30 21 * * 1-5`), matching macro-snapshot.
2. **Backfill `regime_daily`** — invoke `?backfill=1&days=N` across a few quota cycles to seed the
   504-day percentile window (the writer is designed for exactly this; TwelveData rate limit means it
   walks back with `?before=` across multiple invocations).
3. **Live cron verification** — confirm both scheduled writers fire and log `ok` to `run_log`.

---

## Part 4 — Decisions needed from the host BEFORE building

**Q1. Canonical sector taxonomy.** Keep Finnhub's finer 13+ labels, or fold to clean GICS-11
(+ ETF/Cash)? (Recommendation: GICS-11 — a concentration limit and a heatmap are only meaningful
against a small, stable, mutually-exclusive set; 13 drifting labels with singletons defeat both.)

**Q2. Auto-refresh mechanism.** New scheduled `sector-map-sync` function (recommended), vs. fold the
sector lookup into the existing out-of-repo routines (they already write `holdings` when a new
position opens — they could write the sector at the same time), vs. leave it manual.

**Q3. Ambiguous mappings** (solar / fuel-cell / nuclear-fuel names like ARRY/SHLS/BLDP/LEU): map to
GICS Energy, Industrials, or Utilities? These don't fold cleanly and the host's mental model should
drive it, since it feeds the concentration read.

**Q4. Promotion timing** for Phase 0 (the `staging → main` deploy that ships the fixed snapshot
writer) — separate approval, host-gated.

---

## Appendix — files touched by any eventual build
- `packages/shared/src/constants/` — new `SECTORS` union + Finnhub→GICS map (+ tests)
- `packages/shared/src/utils/limits.ts` — `sectorConcentration` already generic; classify ETF/Cash
- `apps/web|admin/netlify/functions/sector-map-sync.ts` — new writer (if Q2 = function)
- `apps/*/netlify.toml` — schedule `regime-daily` (+ `sector-map-sync`)
- `supabase/migrations/0XX_*.sql` — only if the taxonomy needs a CHECK constraint or a new column
