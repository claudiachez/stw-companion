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

### Feed usage by page / module (rate-vs-need matrix)

Refresh rate = how often that surface actually pulls the feed (TanStack Query `staleTime` for
live/on-load reads; cron cadence for scheduled writers). "Current plan" = the pricing tier we're on;
"Rate / quota" = that tier's hard limit. **Conclusion** flags where need vs. limit is a problem.
**Replacement (agreed)** = the feed each row moves to under the 2026-07-08 plan (— = no change).

| Page | Module | Feed (today) | Refresh rate | Current plan | Rate / quota | Replacement (agreed) | Conclusion |
|---|---|---|---|---|---|---|---|
| **Stock Picks** | Overview — Heatmap (Today color) | Finnhub | live, 60s staleTime | Free | 60/min | — (keep) | **OK** — ~53 held tickers, well under |
| Stock Picks | Overview — Sector grouping | `ticker_sector_map` (Supabase) | 1h staleTime | — | — | canonical GICS via `sector-map-sync` | **OK once sync built** (stopgap today) |
| Stock Picks | List + Ticker Detail — live price/day-change | Finnhub | 60s staleTime | Free | 60/min | — (keep) | **OK** |
| Stock Picks | Ticker Detail — option leg marks | IBKR local proxy (admin) | on-demand (admin prices) | self-hosted | none | — (keep) | **OK** — admin-only |
| Stock Picks | Ticker Detail — regime badge | TwelveData daily closes | 1x/day cache | Free | **8/min · 800/day · 1cr/sym** | **TwelveData (kept, unburdened)** | improved — freed once indices leave for FRED |
| **Macro** | Summary / Recap | Anthropic | 2x/day (8am / 4:30pm) | Pay per token | No hard cap | — (keep) | **OK** |
| Macro | Trend / Score Strip / Banner (equity ETFs) | TwelveData daily closes | 1x/day cache | Free | 8/min · 800/day | **TwelveData (kept, unburdened)** | improved — indices off-loaded to FRED |
| Macro | Vol / Stress · Credit · Rates+Dollar (indices) | TwelveData daily closes | 1x/day cache | Free | 8/min · 800/day | **FRED** (VIXCLS / VXVCLS / BAMLH0A0HYM2 / DGS10 / DTWEXBGS) | resolved by replacement |
| Macro | VIX / VVIX live reads | Finnhub → TwelveData fallback | on load | Free | 60/min | **VIX → FRED**; **VVIX → accept null** (non-critical, see Part 5) | resolved (FRED serves the VIX Finnhub can't) |
| Macro | Sector Rotation | TwelveData daily closes (constituents) | 1x/day cache | Free | 8/min · 800/day | **TwelveData (kept, unburdened)** | improved — indices off-loaded to FRED |
| Macro | GEX / Positioning | Supabase `signals` (morning routine) | 1x/day | — | — | — (keep) | **OK** |
| Macro | Event Risk | MarketWatch (HTML scrape) | on load | Free scrape | none | **FRED `releases/dates` + static FOMC list** | resolved (retires the scrape) |
| Macro | 5D trend engine | `macro_daily_snapshots` (← `macro-snapshot` fn) | 1x/day 4:30pm | Free | 8/min · 800/day | writer → **FRED (indices) + TwelveData (equity)** | resolved by rebuild + promotion |
| **My Portfolio** | Overview — Heatmap (Total color only) | stored marks (Supabase) | on sync | — | — | — (keep) | **OK** — no live day-change feed here by design |
| My Portfolio | Positions | IBKR Flex Web Service | manual sync | Free | ~1 req / few-min per token | — (keep) | **OK** — open positions only (closed history = Next Steps #9) |
| My Portfolio | Risk — sector concentration | `ticker_sector_map` | 1h staleTime | — | — | canonical GICS via `sector-map-sync` | **OK once canonical** (ETF/Cash excluded, not `unevaluated`) |
| My Portfolio | Tailing | Supabase `holdings` | on load | — | — | — (keep) | **OK** |
| **Signals** | GEX charts | Finnhub + TwelveData | 60s / daily | Free | 60/min · 8/min | — (Finnhub + TwelveData, unchanged) | **OK** |
| **Backend (scheduled)** | `macro-snapshot` writer | TwelveData (~10 series) | 1x/day wkdays | Free | 8/min · 800/day | **FRED (indices) + TwelveData (equity)**; VVIX dropped | rebuild + promote to schedule it |
| Backend | `regime-daily` writer | TwelveData (~5 series) | proposed 1x/day | Free | 8/min · 800/day | **FRED (VIX/VIX3M/TNX) + TwelveData (IWM/SPY/QQQ)** | schedule + backfill; VIX3M→FRED fixes `vol_state` |
| Backend | `sector-map-sync` (proposed) | Finnhub `profile2` | daily, only unmapped tickers | Free | 60/min | — (Finnhub is fine here) | **OK** — fires rarely, a few symbols |
| Backend | `macro-recap-am/pm` writer | Anthropic | 2x/day wkdays | Pay per token | No hard cap | — (keep) | **OK** |

**Read of the matrix (corrected 2026-07-08 after host review):** every **CONSTRAINED / BROKEN /
FRAGILE** row is resolved without spending. Macro *indices* (VIX, VIX3M, US10Y, credit, dollar) →
**FRED** (free, ~120/min; server-only, so via a proxy — no CORS from the browser). Equity daily closes
→ **TwelveData, kept** — once the indices leave for FRED, TD's 8/min is no longer contended and clears
the ~90-symbol equity cold burst faster than any free alternative (Tiingo's 50/hr would *stall* that
burst, so Tiingo was dropped). Event Risk → **FRED release-calendar + static FOMC**, retiring the
scrape. **VVIX is dropped** (no free source serves it; both scorers already null-tolerate it — see
Part 5). The 5D-engine writer is rebuilt onto FRED+TD and self-populates once promoted to `main` (Phase
0 explains why promotion is required). **No paid tier, and only one new key: `FRED_API_KEY`.**

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

### Phase 0 — Unblock what's already fixed (no new code; needs a prod deploy)
- The `macro_daily_snapshots` writer is already fixed on `staging` (v1.1.0: paced, instrumented,
  `engine_version`-stamped). **Why it still needs `main`:** Netlify only runs **scheduled functions on
  a site's production deploy (`main`)** — a branch deploy like `staging` builds the function but its
  cron never fires. So the good writer exists on staging but nothing triggers it there on the 4:30pm
  timer; the only writer running on a schedule is the stale one on the production (`main`) deploy,
  which is why PROD's rows are the old null-`engine_version` ones and no v1.1.0 rows exist anywhere.
  The self-populating fix therefore only starts once promoted to `main` (Next Steps #0, host-gated).
- **Note:** this is specifically about the *scheduler*. The staging code can be proven correct without
  promoting — hit the staging function URL directly over HTTP (manual invoke isn't cron-gated). NOTE
  this rebuilds onto FRED (indices) + TwelveData (equity) in Phase B, so verify the *rebuilt* writer.
  After promotion, confirm a fresh row carries non-null `engine_version` + real trend/vol scores + a
  `run_log` row.

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

### Phase B — Feed re-platform: FRED for indices, TwelveData kept for equity (host-corrected 2026-07-08)
This REPLACES the earlier "verify TwelveData pacing" framing. TwelveData is **not** dropped — it stays
the equity-EOD source, unburdened once indices move to FRED. **Tiingo dropped** (its 50/hr stalls the
~90-symbol equity cold burst; TD's 8/min is faster). Build order (host: feeds first):
1. **Shared pacing helper** — DONE (`runPaced`/`FEED_LIMITS` in `@stw/shared`, unit-tested). Every feed
   routes through it so no provider can re-introduce the unpaced-burst 429 bug.
2. **FRED proxy + client** — a Netlify `fred.ts` proxy (server-only key; browser hooks call it, server
   writers call FRED directly). Reassign the *index* reads: VIX→`VIXCLS`, **VIX3M→`VXVCLS`**,
   US10Y→`DGS10`, credit→`BAMLH0A0HYM2` (real HY OAS, an upgrade over the HYG proxy), dollar→`DTWEXBGS`.
   Touches `useVolatilityStress`, `useRatesDollar`, `useCreditLiquidity`, `macro-snapshot`, `regime-daily`.
   **VVIX removed entirely** (DONE 2026-07-08) — deleted from the scorers, the Volatility card, the
   Risk-Appetite gauge, the snapshot writer, and the recap context (no free feed serves it; a forever-
   `—` tile reads as broken per the "no permanently-empty field" convention). Remaining 6 gauge weights
   rescaled to sum to 1.0, gauge value materially unchanged.
   **Bonus:** VIX3M via FRED fixes `regime-daily`'s current `vol_state='UNKNOWN'`.
3. **Event Risk rebuild** — replace the MarketWatch scrape in `macro-events.ts` with FRED
   `releases/dates` (CPI/PCE/Employment/GDP) + a small static FOMC-date list. Anthropic may phrase
   "why it matters," never source dates (recap grounded-only rule).
4. **Timestamp audit** — every module's `SourceNote` shows a full `fmtDateTime` "Updated" stamp,
   distinct from the date-only "Data through" close date. Fix Rates+Dollar, Trend/Market Structure, +
   any other date-only offenders across all 11 modules.
5. **Verify** after key + promotion: FRED-backed cells populate; snapshot/regime rows carry real
   scores; macro cold-load is fast (FRED ~120/min removes the index contention on TD's 8/min).
Graceful-degrade throughout: a missing `FRED_API_KEY` → `—` cell, never a hard failure.

### Phase C — Integrity guardrails (Next Steps #2, independent of any merge)
1. **Schedule `regime-daily`** — add the `schedule()` wrapper + a cron entry in admin `netlify.toml`
   (after-close, e.g. `30 21 * * 1-5`), matching macro-snapshot.
2. **Backfill `regime_daily`** — invoke `?backfill=1&days=N` across a few quota cycles to seed the
   504-day percentile window (the writer is designed for exactly this; TwelveData rate limit means it
   walks back with `?before=` across multiple invocations).
3. **Live cron verification** — confirm both scheduled writers fire and log `ok` to `run_log`.

---

## Part 4 — Decisions (host-answered 2026-07-07) ✅

**Q1. Canonical taxonomy → GICS-11 + ETF + Cash.** Fold the 13 Finnhub labels into the standard 11
GICS sectors plus explicit ETF and Cash buckets. Stored as a code-level constant in `@stw/shared`.

**Q2. Auto-refresh → new scheduled `sector-map-sync` Netlify function.** Finds `holdings` tickers
missing from `ticker_sector_map`, resolves + upserts them, `run_log`-instrumented, in this repo.

**Q3. Ambiguous names → use the AUTHORITATIVE MSCI GICS classification per ticker, not a blanket
default.** (Host: "use framework classification: https://www.msci.com/indexes/index-resources/gics".)
So each company is assigned the GICS sector MSCI actually places it in — resolved per-name during the
build, verified where a company's real GICS bucket is non-obvious (e.g. Array/Shoals solar,
Ballard fuel cells, Centrus/LEU nuclear-fuel). No "default everything clean-energy to X" rule.

**Q4. Promotion timing** for Phase 0 (the `staging → main` deploy that ships the fixed snapshot
writer) — still separate, host-gated, not yet given.

### What Q1–Q3 mean concretely for the build
- **`@stw/shared`:** a `GICS_SECTORS` union of the 11 GICS sectors + `'ETF'` + `'Cash'`; a
  per-ticker `TICKER_GICS` map for the current book (each held/tracked ticker → its authoritative
  MSCI GICS sector), plus a Finnhub-label → GICS fallback map for tickers not yet hand-verified.
  Both unit-tested.
- **`sector-map-sync` function:** for each `holdings` ticker missing from `ticker_sector_map`, resolve
  via `TICKER_GICS` first, else Finnhub `profile2` → Finnhub→GICS fallback map; ETFs → `'ETF'`,
  CASH → `'Cash'`. Upsert; log to `run_log`. Scheduled after close.
- **Re-seed:** map the existing 53 rows through `TICKER_GICS` (one-off, so history matches).
- **Risk tab:** `'ETF'`/`'Cash'` excluded from sector-concentration, not counted `unevaluated`.

---

## Part 5 — Free-alternative research + feed reassignment (host questions, 2026-07-08)

Before considering a paid TwelveData tier, researched every free option. **Conclusion: a free-only
path clears the entire TwelveData-CONSTRAINED group AND fixes the fragile MarketWatch scrape.** No
paid plan recommended yet.

### FRED (Federal Reserve Economic Data) — the big win
Free, single tier, **~120 req/min, no daily cap**, one free API key, authoritative. Directly serves
every macro *index* indicator we currently pull from TwelveData, plus the event calendar:

| Need (module) | Today | → FRED series | Note |
|---|---|---|---|
| VIX (Volatility/Stress) | TwelveData / Finnhub-fails | **VIXCLS** | authoritative CBOE close |
| VIX3M (regime `vol_state`) | TwelveData (unreliable → `UNKNOWN`) | **VXVCLS** | CBOE 3-month vol — **fixes the current `vol_state='UNKNOWN'`** |
| US10Y (Rates+Dollar) | TwelveData TNX | **DGS10** | actual 10Y CMT yield, no `/10` normalization hack |
| Credit (Credit/Liquidity) | HYG ETF *proxy* | **BAMLH0A0HYM2** (HY OAS) | **upgrade** — the real spread the module footnotes it's proxying |
| Dollar (Rates+Dollar) | UUP ETF proxy | **DTWEXBGS** (broad $ index) | actual index vs ETF; daily, 1-business-day lag |
| Event Risk calendar | MarketWatch scrape | **`releases/dates` API** | CPI/PCE/Employment/GDP authoritative dates — replaces the scrape |

Caveats: FRED daily series post on a ~1-day lag (fine for a daily-close dashboard). FRED does **not**
serve individual equity prices or **VVIX**. **FOMC** meeting dates aren't a clean FRED release — use a
small maintained/annual static list (dates are pre-published a year out) rather than a scrape or a
model guess.

### Equity daily OHLC (SPY/QQQ/IWM/RSP/VEA, sector constituents, per-ticker regime badge) → keep TwelveData
FRED can't serve equities. **Decision (host, 2026-07-08): keep TwelveData, drop Tiingo.** Once the
indices move to FRED, TD's 8/min is no longer contended and clears the ~90-symbol equity cold burst
(~53 held tickers + ~40 sector constituents) in ~12 min. **Tiingo was considered and rejected:** its
free tier is only **50 req/hr** (per-symbol, no batch), which would *stall* a ~90-symbol burst to 1–2
hours — slower than TD, not faster. So Tiingo adds a key + integration for worse burst behavior. If TD
ever proves tight for equity, re-add a second source then (the pacing helper already supports it).

### VVIX — dropped as a dependency (host asked: how critical is it?)
**Not critical; no free source serves it, so accept null (unchanged from today).** No provider delivers
VVIX free: TwelveData's free tier hasn't been serving it (it's been null the whole time), FRED doesn't
carry it (VVIX is the one CBOE vol series absent from FRED), and Yahoo/Stooq are fragile. Its model
weight is small and it's largely redundant with signals we DO have: in the Risk-Appetite gauge it's
**12%** and its weight **redistributes** when null; in the Volatility sleeve it's **1 of 4** equal
sub-scores and that sleeve is only **20%** of the regime score (so ≤~5% reach), and it moves together
with `vixScore` + `ivPremiumScore` (both from FRED). Both scorers already renormalize around a null
VVIX. → Pass `null`; no fragile Stooq/Yahoo dependency.

### Rejected
- **Tiingo:** 50 req/hr stalls the equity cold burst (see above).
- **Yahoo Finance:** no official free API in 2026; reverse-engineered endpoint is fragile/unsupported —
  same risk class as the scrape we're retiring. Not a dependency.
- **Alpha Vantage:** **25 req/day, 5/min** — too small for anything primary.

### What this does to the paid-plan question
Offloading all macro indices → **FRED (free)** frees TwelveData to serve only equity closes on its
existing free tier. **Recommendation: stay free.** The only new key is `FRED_API_KEY`. Revisit paid
only if TD's freed-up 8/min proves tight for equity on real cold loads — measure first (Phase B).

### Q: keep the raw Finnhub label after mapping to canonical?
**No — don't persist it.** `ticker_sector_map.sector` stores only the canonical GICS value; the raw
Finnhub label is an intermediate the fallback map consumes and discards. Keeping it as a column means
two "sources of truth" that drift. If a bad mapping ever needs debugging, `sector-map-sync` records
the raw label it saw in its `run_log` summary (transient), not as a schema column.

### Timestamps — every module footer needs the full time, not just the date
Standing rule (CLAUDE.md → Timestamps): every "as-of/updated/checked" stamp uses `fmtDateTime`
(`Mon D · H:MM AM ET`). Today **Rates + Dollar** and **Trend / Market Structure** (and others) show a
date-only stamp. Fix: each module's `SourceNote` shows a full `fmtDateTime` **"Updated"** stamp
(when we last refreshed), kept distinct from the **"Data through {date}"** daily-bar close date, which
is legitimately date-only. Audit all 11 modules for this in the build.

### Generalize the pacing guard to ALL feeds (host)
The ≤8/65s TwelveData chunker in `maCache.ts` proved the pattern; **DONE** — `runPaced`/`FEED_LIMITS`
in `@stw/shared` (`utils/pacing.ts`, unit-tested) is the generic chunked-pacer, configured per feed
(FRED ~120/min, Finnhub ~60/min, TwelveData 8/min). Every feed routes through it so a new feed can't
reintroduce this class of bug.

### Sequencing + keys (host, 2026-07-08)
- **Feeds first**, then sector taxonomy. Build order within feeds: (1) shared pacing helper [DONE] →
  (2) FRED proxy + client, reassign VIX/VIX3M/US10Y/credit/dollar (VVIX→null) → (3) Event Risk rebuild
  (FRED calendar + static FOMC) → (4) timestamp audit across 11 modules. Equity stays on TwelveData
  (no Tiingo).
- **Promotion:** host will promote `staging → main` **after** this build lands (so the rebuilt
  scheduled writers start firing).
- **Keys:** the host registers the one free `FRED_API_KEY` and adds it to Netlify env (server-side, no
  `VITE_` prefix) on both sites; I write all wiring. Code graceful-degrades when the key is absent
  (module cell → `—`) so nothing hard-fails pre-provisioning. Live verification waits on the key.

### Architecture: FRED is server-only (CORS) → proxy function
FRED's `api.stlouisfed.org` sends **no `Access-Control-Allow-Origin` header**, so a browser `fetch`
is blocked — FRED cannot be called directly from the macro module hooks. Access goes through a
**Netlify function proxy** (`fred.ts`, one copy per site per the site-scoped-functions rule) that the
browser hooks call; the server-side writers (`macro-snapshot`, `regime-daily`, `macro-events`) call
FRED directly. Bonus: the `FRED_API_KEY` stays **server-side only** (no `VITE_` prefix), unlike the
client-exposed `VITE_TWELVEDATA_KEY` — a security improvement, and the pattern to prefer for any new
key. Equity reads stay client-direct on TwelveData (it allows CORS) — only FRED needs the proxy.

### Revised feed plan (net) — final, host-approved 2026-07-08
- **Macro indices (VIX, VIX3M, US10Y, credit, dollar) → FRED.** Fixes Volatility/Stress, Rates+Dollar,
  Credit; removes them from TwelveData; VIX3M→`VXVCLS` fixes `regime-daily` `vol_state`.
- **Event Risk → FRED releases calendar (+ static FOMC list).** Retires the MarketWatch scrape.
  Anthropic may *phrase* "why it matters", never *source* dates (recap grounded-only rule).
- **Equity EOD → TwelveData (kept, unburdened).** No Tiingo.
- **VVIX → null** (dropped; non-critical, no free source).
- **One new Netlify env var:** `FRED_API_KEY` (server-side). New scheduled `sector-map-sync` unchanged.

---

## Appendix — files touched by any eventual build
- `packages/shared/src/constants/` — new `SECTORS` union + Finnhub→GICS map (+ tests)
- `packages/shared/src/utils/limits.ts` — `sectorConcentration` already generic; classify ETF/Cash
- `apps/web|admin/netlify/functions/sector-map-sync.ts` — new writer (if Q2 = function)
- `apps/*/netlify.toml` — schedule `regime-daily` (+ `sector-map-sync`)
- `supabase/migrations/0XX_*.sql` — only if the taxonomy needs a CHECK constraint or a new column
