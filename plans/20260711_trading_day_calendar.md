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

## Extension — end-of-week weighting (migration 069)

The weekly weighting run must fire on the **last trading day of the week** —
normally Friday, but Thursday when Friday is a holiday. New RPC
**`is_last_trading_day_of_week(date)`** (migration 069): true when `d` is a
trading day and no later trading day exists in its Mon–Fri week. The
`stw-friday-weighting` routine's STEP 0 now gates on it (was `is_trading_day`),
and — crucially — the routine's **Cowork schedule must widen to Thursday + Friday
5pm** (host action; the routines aren't in the repo scheduler). The gate then runs
it exactly once, on the week's last open session. **Fail-safe:** if the RPC is
unavailable the gate degrades to the original Friday-only behavior (`DOW=5`
proceeds, else skip) — never a double-run.

## Extension — auto-populating the calendar

`nyseHolidays(year)` (`packages/shared/src/utils/nyse-calendar.ts`) computes NYSE
closures in-house (nth-weekday + Good Friday via Easter + weekend-observance
shifts) — no external feed. Validated to reproduce the 2025–2027 seed exactly.
The **`market-calendar-sync`** scheduled fn (web, monthly `0 9 1 * *`) upserts the
current year + next two into `market_holidays`, so the calendar extends forever.
The migration-068 seed is now just the bootstrap. (The client mirror in
`market-calendar.ts` — PR #96 — could later be replaced by a DB read, but stays
as an offline mirror for now.)

## Pending

- **Apply migrations 068 + 069 to PROD** (both verified on sandbox). All guards are
  inert (fail-open / fail-safe) until applied — no breakage meanwhile.
- **Cowork schedule change (host):** widen `stw-friday-weighting` to **Thu + Fri
  5pm** so the end-of-week gate can pick the right day.
- **Routines**: the `curl` guards are added to `stw-morning-run`,
  `stw-afternoon-run` (trading-day gate) and `stw-friday-weighting` (end-of-week
  gate). Out-of-repo; live once migrations 068/069 are on PROD (fail-open until then).
