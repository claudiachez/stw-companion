# Trading-day calendar — one source of truth for "market days only" (2026-07-11)

**Status: repo side IN PROGRESS (this branch → PR to staging). Routines: separate out-of-repo edit.**

## Problem

"Trading days only" was enforced in exactly ONE place — the regime-trajectory
*read* (`useMacroTrendHistory`, via the hardcoded `isTradingDay` in
`packages/shared/src/utils/market-calendar.ts`). Everything that *writes*
time-series data skipped weekends (cron `* 1-5`) but **still fired on NYSE
holidays**: `macro-snapshot`, `regime-daily`, `gex-snapshot`, and the four
out-of-repo ingestion routines. There was no shared control, and a TS helper in
`@stw/shared` can't be reached by the routines (out-of-repo, `curl`-driven).

## Mechanism (host decision, 2026-07-11): a Supabase calendar + RPC

Migration **068** (`market_holidays` table + `is_trading_day(date)` RPC) is the
single source of truth both sides read over REST:

- **Repo writers** (Node fns): a small inline `isTradingDay(url, key, date)` POSTs
  to `/rest/v1/rpc/is_trading_day`. On the daily/scheduled path, a non-trading day
  → log a `skipped … — not a trading day` run_log row and return early (write
  nothing). **Fails OPEN** (proceeds) if the RPC is unavailable — a calendar
  outage must never silently stop market-data writes. `regime-daily`'s **backfill**
  path is exempt (it only writes the trading-day bars the equity feed returns).
- **Routines** (out-of-repo `~/Documents/Claude/Scheduled/*/SKILL.md`): same RPC
  via `curl` at the top of the run; skip the market-data work on a non-trading day.
  *(Separate edit — not in this repo.)*
- **Client** (`useMacroTrendHistory`, PR #96): keeps the `market-calendar.ts`
  helper as a display mirror. Once the writers stop creating holiday rows the
  client filter is belt-and-suspenders. **The `market-calendar.ts` seed list and
  the migration-068 seed must stay in sync** (both are the same NYSE list; extend
  yearly).

Weekends are derived (`dow`); the table stores only full-day closures, as OBSERVED
dates (weekend-shifted holidays already resolved). Seeded 2025–2027.

## Verified

- RPC on **sandbox**: `2026-07-10`(Fri)=true, `07-11`(Sat)=false, `07-03`(Jul-4
  observed)=false, `07-13`(Mon)=true, `11-26`(Thanksgiving)=false.
- All three writers typecheck + esbuild-bundle clean with the guard.

## Pending

- **Apply migration 068 to PROD** (sandbox done). The writers' guards are inert
  (fail-open) until it's applied — no breakage in the meantime, they just keep
  writing as before until the RPC exists.
- **Routines**: add the `curl` guard to `stw-morning-run`, `stw-afternoon-run`,
  `stw-friday-weighting` SKILL.md (transcripts is webinar-driven, not market-day
  gated). Out-of-repo.
