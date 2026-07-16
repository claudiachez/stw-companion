# Macro data sources & module structure

> The Macro-tab wiring (feeds, regime weights, event risk, recap timing, 5D engine, sector rotation). Moved out of CLAUDE.md. See also docs/feeds.md for the raw feed inventory.

### Macro data sources & module structure (FRED re-platform, 2026-07-10)
Feed responsibilities, post-re-platform (full inventory: [`plans/20260707_data_feeds_inventory_and_plan.md`](plans/20260707_data_feeds_inventory_and_plan.md)):
- **FRED** (`FRED_API_KEY`, server-side, no `VITE_`): the authoritative source for macro **index**
  indicators — VIX (`VIXCLS`), VIX3M (`VXVCLS`), US10Y (`DGS10`, already %), HY-OAS credit
  (`BAMLH0A0HYM2`), broad dollar (`DTWEXBGS`) — **and** the Event Risk release calendar. Free,
  ~120/min, no daily cap. **FRED is server-only (no CORS): browsers reach it through the `fred`
  Netlify proxy** (`apps/{web,admin}/netlify/functions/fred.ts`); the scheduled writers call FRED
  directly. Series ids + URL/parse helpers are in `packages/shared/src/utils/fred.ts` (`FRED_SERIES`,
  `buildFredUrl`, `parseFredObservations`); the browser cache is `fredCache.ts` (mirrors `maCache`).
  This is the pattern to prefer for any new key — keep it server-side behind a proxy.
- **TwelveData** (`VITE_TWELVEDATA_KEY`): now **equity daily closes ONLY** — the trend ETFs
  (SPY/QQQ/IWM/RSP/VEA) and Sector-Rotation constituents. Cache via `maCache.ts`. **It still bills 1
  credit/symbol on the free ~8/min tier**, so keep routing any batch through `tdBatchCloses`/
  `fetchClosesChunked` (≤8 symbols, ~65s pacing) — never one big unchunked call. Indices are OFF
  TwelveData now; do not add index series back to it.
- **Finnhub** (`VITE_FINNHUB_KEY`): live stock quotes only (free tier serves neither index symbols nor
  daily candles), plus `profile2` for `sector-map-sync`'s GICS resolution.
- **FlashAlpha** (`FLASHALPHA_API_KEY`, server-side, no `VITE_`): the Macro GEX / Positioning module's
  source (net GEX · gamma flip · call/put walls) — `GET https://lab.flashalpha.com/v1/exposure/gex/SPY`
  with an `X-Api-Key` header. **Free tier = 5 requests/DAY, SPY-only, single expiry** (nearest Friday;
  full chain needs the Growth plan). Because 5/day rules out any per-browser proxy, the **`gex-snapshot`
  scheduled Netlify fn (web only, ~8:30am/4:30pm ET) is the ONLY caller** → derives levels via
  `deriveGexLevels`/`gexSleeveScore` (`@stw/shared/utils/gex.ts`) → upserts `gex_snapshots` (migration
  067); every client + `macro-snapshot.ts` read that table, never FlashAlpha. **GEX sleeve score =
  spot-vs-gamma-flip cushion × `GEX_SLEEVE_SLOPE` (20; host-signed-off 2026-07-10)** — feeds the Macro
  **composite** only, never the frozen regime **gate** (engine 1.1.0). A paid key later unlocks real SPX
  with no code change. (The Discord Graddox `signals` row still powers the separate **Signals tab** —
  only the Macro GEX module moved.)
- **VVIX is dropped** — no free feed serves it; don't re-add a perpetually-null input.
- **Generic pacing helper**: `runPaced` + `FEED_LIMITS` in `@stw/shared` (`utils/pacing.ts`) is the one
  chunk-and-pause throttle every feed routes through (FRED/Finnhub/TwelveData). Reuse it for new feeds.
- **Module structure (v2):** the Macro tab is **weighted module scores**, NOT a single MA table. The
  9/21/200 MA table is **Trend only**; **VIX → Volatility/Stress**, **US10Y → Rates+Dollar**. Modules
  5–7 (Volatility / Credit / Rates+Dollar) are consolidated into ONE **Market Internals** table
  (`MarketInternalsCard.tsx`) — one row per sleeve, values right-aligned; the three underlying card
  components are kept but parked. Pure scorers live in `packages/shared/src/utils/macro.ts`. Every card
  shows a `SourceNote` footer with a full `fmtDateTime` **"Updated:"** stamp + a date-only "data through".
- **Regime weights are admin-configurable** — `app_config` keys `regime_weight_*` (percent, migration
  061), read via `useAppConfig().regimeWeights`, passed to `environmentScore(sleeves, weights?)` (which
  normalizes by the total, so scale is cosmetic). Edited on Admin Config → "Market Regime weights". The
  `macro-snapshot` writer reads the same keys so the persisted regime matches the live banner.
- **Event Risk** (`macro-events.ts`, web + admin): FRED `/fred/release/dates` **per release_id** for the
  schedule (CPI 10 · PPI 46 · PCE 54 · NFP 50 · GDP 53 · Retail Sales 9 · Philly Fed 351 · Housing 27 ·
  UMich 91) + a static `FOMC_DECISION_DATES` list, window-filtered (7-day default, "Show more" expands).
  **The `/fred/series/observations` DATA series supplies the print numbers** (calendar has none): each
  release fetches its latest TWO obs, so an UPCOMING row shows `previous` and a just-RELEASED row shows
  `actual` (latest) + `previous` (prior) — that's what makes a just-dropped CPI show its number.
  **`consensus` stays null** (no free feed) so `classifyEventRisk`'s surprise/shock path no-ops — but the
  **reaction overlay fires on RELEASE TIME, not on `actual`** (window **48h**; a released event never
  vanishes; closest major — just-released vs imminent — is the headline). With no consensus, a released
  print shows a **favorability arrow** instead of a surprise: `eventPrintTrend` (`@stw/shared`) compares
  actual vs previous — glyph = the move, color = good/bad per the release's `lowerIsBetter` (inflation
  green when falling; growth/jobs green when rising). Never fabricate a print; a null actual renders "—".
  **FOMC dates are a hardcoded best-effort list — verify against the Fed's schedule.**
- **Earnings Ahead** (`useEarningsCalendar` + `EarningsAheadCard`, Finnhub calendar): the coverage set is
  the signed-in user's own positions ∪ STW holdings ∪ mega-cap movers, tagged **yours / STW / mkt mover**,
  **open positions only** (closed STW holdings + zero-qty user positions excluded). Held tickers link to
  their detail page; movers stay plain (no detail page).
- **Macro recap** (`macro-recap-am/pm` scheduled fns + `macro-recap.ts` manual fn): a **daily** note, two
  sessions per weekday. **AM = 8:35 ET** — the cron fires `35 12,13 * * 1-5` (two UTC times bracketing
  8:35 ET across DST, since Netlify cron is UTC-only) and the recap's `minEtMinutes` gate writes only once
  ET ≥ 8:35, so it lands AFTER the 8:30 econ releases; idempotency no-ops the second fire. PM = 21:30 UTC.
  Grounds in the day's FRED econ calendar + released actuals (via the macro-events endpoint) alongside the
  scores — **never fabricate figures** (actual + prior only, no consensus). Sonnet→Haiku (`MACRO_RECAP_MODEL`). Persisted in
  `public.macro_daily_recaps` (migration 051). Hook: `useDailyRecap.ts`.
- **5D trend engine** (`useMacroTrendHistory.ts`): reads `public.macro_daily_snapshots` (migration 048),
  written by the `macro-snapshot` scheduled fn (4:30pm ET weekdays), folding today's live scores in.
  Supabase-backed (not localStorage). The **v2.0.0 writer (FRED indices + HY-OAS + paced equity) is LIVE
  on production** (verified 2026-07-08: a fresh row carries `engine_version = macro-snapshot-2.0.0` +
  real trend/vol/credit scores + a `run_log` row). Deltas are legitimately null until ≥~6 fresh rows accrue.
- **Sector Rotation** (Module 11): per-sector radar cards + constituent chips, fetched via
  `fetchClosesChunked` (TwelveData, paced).
- **`regime_daily` reads pick the latest COMPLETE row, not the newest** (`fetchLatestRegime`,
  `useLatestRegime` — powers the My-Portfolio Risk-tab RegimeLight + admin VolTargetPanel). FRED
  publishes VIX/VIX3M with a ~1-day lag, so the *current* day's `regime_daily` row lands with price +
  rv20 but null `vix_close`/`vix3m_close`; querying the raw newest row blanked Vol / Multiplier / VIX /
  VIX3M. The query filters `vix_close`/`vix3m_close` not-null so it shows the latest full reading (fixed
  2026-07-10). Apply the same "latest complete row" instinct to any panel that needs the vol inputs.

