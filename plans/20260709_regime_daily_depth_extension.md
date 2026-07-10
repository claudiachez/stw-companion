# Week-2 Item 4 — `regime_daily` depth extension to ~2000-present

**Status:** SPEC READY — execution deferred (needs stable Supabase service-role access + a
network fetch of a deep public daily-bar source; neither was available in the authoring session).
Everything else in Week 2 is built; this is the one item that is a data operation, not code.

**Why it matters:** current history is 2020-12-08 → present — exactly one bear market (2022),
COVID excluded. That is insufficient for the vol-targeting validation backtest (Week-2 Item 3) and
the eventual composite-vs-gate backtest (Phase 0c). Extending equity bars to ~2000-present adds
2000-02 (dot-com), 2008 (GFC), 2011, 2018, 2020 (COVID) — the stress regimes the gate exists for.

## Standing constraint — ONE code path, no drifting backfill script

The daily append and any backfill MUST share the same fetch + rolling-stat computation
(`apps/admin/netlify/functions/regime-daily.ts`'s `handlerImpl`, using only the
`packages/shared/src/utils/regime.ts` helpers: `sma`, `rocPositive`, `smaSlopePositive`,
`realizedVolAnnualized`, `percentileRankOf`, `trendStateFromClose`, `volStateFromVix`). Do NOT
write a parallel Python/node script that recomputes these — that is the exact drift the function's
header comment warns against. The engine stays frozen at `engine_version 1.1.0` (standing
prohibition). This extension changes only the *source of the equity bars*, not the math.

## The blocker the current code hits

`regime-daily.ts` fetches equity closes from **TwelveData**, whose `outputsize` caps at 5000
(~19–20 years) and bills 1 credit/symbol on the free tier. Walking back via `?before=` works but is
slow and still short of 2000 for a clean pull. FRED (VIX/VIX3M/US10Y) already has **no cap** and
backfills to each series' inception in one call — so FRED needs nothing new.

## Approach — add a deep public equity source behind the same computation

1. **Source: Stooq** (free, no API key, decades of daily history, CSV):
   `https://stooq.com/q/d/l/?s=spy.us&i=d` (also `qqq.us`, `iwm.us`). Returns
   `Date,Open,High,Low,Close,Volume` oldest-first — map to the same `Bar { date, close }` shape as
   `tdSeries`. Inceptions: SPY 1993, QQQ 1999-03, IWM 2000-05 (so IWM naturally starts ~2000).
2. **Wire it as an alternate source inside `regime-daily.ts`**, gated by a querystring
   (`?source=stooq`) so the daily cron path is untouched. A `stooqSeries(symbol)` function returns
   `Bar[]`; the existing compute loop and `sbUpsertMany` are reused verbatim. Set `source` column to
   `'stooq+fred'` for these rows (provenance per row, per the plan). VIX3M (`VXVCLS`) starts ~2007 —
   before that `vol_state` is honestly `'UNKNOWN'` (already handled by the `vix3mAvailable` path).
3. **Run it via the esbuild-bundle harness** (CLAUDE.md → Conventions → Netlify Functions — the
   zero-drift way): bundle the handler with esbuild, a CJS runner sets env from
   `apps/web/.env.local` + `.env` + the **prod service-role key file**, and calls
   `handler({ queryStringParameters: { backfill:'1', source:'stooq', days:'6500' } })`. 6500 covers
   ~25 years of trading days in one call (no `?before=` walk needed with Stooq). The 504-day
   percentile window fills naturally once ≥~524 prior bars exist.
4. **Apply to PROD (`usmqbohcjcyszjxxvnqu`)**; sandbox optional (dev-only, still 0 rows — needs a
   sandbox service key not in the repo).

## Acceptance (re-run the Item-3 spot-checks + two pre-2020 dates)

- The three existing acceptance dates still reconcile (unchanged rows, `on_conflict` merge).
- **2008-10-XX** (GFC): a double-RED day — trend RED (close < 200SMA) AND vol RED (VIX > VIX3M);
  `risk_multiplier` 0.0.
- **2013-XX-XX** (calm bull): GREEN + GREEN; `risk_multiplier` 1.0.
- Row count ≈ 3 instruments × ~6300 trading days back to 2000 (~19k rows total; fewer for IWM
  pre-2000-05 and for `vol_state` pre-2007).
- A `run_log` `regime-daily` row records the backfill count + `source=stooq+fred`.

## After this lands

Unblocks Week-2 Item 3's validation backtest (the `VolTargetPanel` currently labels it "pending the
regime history depth extension") and Phase 0c's composite-vs-gate backtest on the extended history.
