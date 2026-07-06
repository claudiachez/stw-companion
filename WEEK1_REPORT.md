# Week 1 Integrity Guardrails — Report

Branch `claude/week1-integrity-guardrails` off `staging`. Source spec:
[`plans/integrity-guardrails.md`](plans/integrity-guardrails.md). All 7 items addressed; details,
deviations, and open follow-ups below.

## Item 0 — macro-snapshot cron fix

**Root cause (revised from the source spec's first theory):** `macro-snapshot` was never
undiscovered by Netlify (the `[functions] directory = "netlify/functions"` block auto-registers
everything in that folder). The real gap: `apps/web/netlify.toml` gave `ibkr-flex`/`macro-recap-am`/
`macro-recap-pm` explicit timeout overrides (26s/60s/60s) but `macro-snapshot` had none, silently
falling back to Netlify's much shorter default — implausible for the ~10 sequential external API round
trips (TwelveData × 8 unique symbols + 2 Finnhub calls + 1 internal fetch + Supabase reads/writes) the
function makes. Fixed:
- `apps/web/netlify.toml`: added `timeout = 60` for `macro-snapshot` (matching the proven-working recap
  functions rather than an invented number).
- `apps/web/netlify/functions/macro-snapshot.ts`: added `run_log` instrumentation (ok/error, rows
  written, error detail) on every path including a wrapping try/catch; deduped the SPY and RSP closes
  (previously fetched twice each); stamped `engine_version` (`macro-snapshot-1.1.0`) on every row.
- `supabase/migrations/054_integrity_guardrails.sql` adds `macro_daily_snapshots.engine_version`.

**Verification status: code-complete, live verification deferred.** TwelveData's daily quota was
already exhausted this session (992/800 credits used, confirmed via a direct 429) before this fix
shipped — per host decision, proceeding code-complete and deferring live verification rather than
blocking the session on a quota reset. **Next session: confirm a real row lands in
`macro_daily_snapshots` after the next scheduled run, or invoke the deployed function directly
(`curl -X POST https://<site>/.netlify/functions/macro-snapshot`) once quota resets.**

## Item 0.5 — closed-weight invariant

**Root cause confirmed procedural, not systemic:** of 25 Closed/Expired holdings on PROD, 17 already
carried zero weight (the normal close path is fine); only the 8 named tickers (HII/PLPC/KTOS/AMSC/
LUMN/RDCM/BLDP/AMRC) were corrupted, all traced to the 6/12 manual flag-resolution path per the spec.

- Corrected `current_weight = 0` for all 8 tickers on PROD (host-approved to apply directly), each
  logged to the new `ops_log` table with its prior value preserved.
- Structural guard: `fn_check_closed_weight_zero()` trigger on `holdings`, `RAISE EXCEPTION`s on
  `last_action IN ('Closed','Expired') AND current_weight <> 0` (BEFORE INSERT/UPDATE). Verified live on
  sandbox: an attempted violating UPDATE raised `P0001` with the exact ticker/weight in the message.
- Verified in the admin app (screenshot) that the corrected rows still render fine — no blank-vs-zero
  regression (didn't need new code; the existing formatter already treats 0 as a real value).

## Item 1 — integrity migration + retroactive audit

`supabase/migrations/054_integrity_guardrails.sql` (applied to sandbox then PROD):
- `ops_log` table, seeded with the 2026-07-01 outage + the 6/12–6/18 maintenance-pause events.
- `leg_transactions.weight` → `NOT NULL` — PROD audit reconfirmed 0 null rows; verified live that a
  null-weight insert now raises `23502`.
- `leg_transactions.weight_status` / `source` / `date_precision` columns + CHECK constraints.
- `source = 'snapshot_reconciled'` backfilled for the 6 rows actually identifiable as reconciliation
  inserts by content (ADEA ×2, RNG, MITK, ARKK, CRNC from the 6/12+6/18 runs) — **the literal phrase
  "reconciled from weekly snapshot" the spec named as the detector does not appear anywhere in current
  `notes`; the candidate set was found by reading each row's actual content instead** (all describe
  being inferred from the portfolio-update snapshot after a maintenance gap).
- `packages/shared/src/utils/format.ts`: added `tradingDateET()`, the shared trading-date-derivation
  helper, alongside `fmtDateTime`.

**Midnight-UTC audit — scope corrected from the spec after live verification.** The spec named 5
"confirmed" anomalies; running its own detector (`executed_at::time AT TIME ZONE 'UTC' = '00:00:00'`)
against PROD actually returns **36 of 80** `leg_transactions` rows, many from 2025 — ordinary
day-precision entries for older positions, not synthetic backdates. Flagged this to the host rather
than guessing; **host confirmed the calendar dates are already correct (manually verified in ET) and
time-of-day is secondary** — and flagged a real, separate risk: naively applying `AT TIME ZONE
'America/New_York'` to a bare midnight-UTC timestamp rolls it back to the *previous* calendar day
(ET is always behind UTC), which would have silently corrupted all 36 already-correct dates. Resolved
by making `tradingDateET()` special-case exact-midnight timestamps (read the date directly, skip TZ
conversion) — only genuine intraday timestamps get ET-localized. The full list of 36 candidate rows was
handed to the host directly in-session; **host offered to supply corrected times for the list** — no
Discord-research pass was run this session since it wasn't the actual blocker.

## Item 2 — limits engine

- `packages/shared/src/utils/limits.ts` — pure functions (`positionConcentration`,
  `sectorConcentration`, `grossExposureViolation`, `drawdownLadderTarget`, `evaluateRiskConfig`).
  Exposure v1 = `|quantity × markPrice × multiplier|` rolled up per underlying, documented in the module
  header; delta-notional explicitly out of scope. 13 tests incl. a fixture book with known breaches and
  a multi-tenancy proof (two independent configs/books → independent results).
- `supabase/migrations/055_risk_limits_engine.sql` — `risk_config` (per-user RLS, seeded with the
  operator's row via email lookup — not a hardcoded uuid — using the spec's exact placeholder defaults,
  `is_placeholder` flag) + `ticker_sector_map` (small admin-editable table, NOT the live
  Finnhub-industry algorithm in `macro.ts` — a different, unrelated system).
- `supabase/migrations/056_risk_violation_acks.sql` — per-user violation review state
  (new/acknowledged/glide_path), RLS-owned.
- `apps/admin/src/features/limits/LimitsPage.tsx` — new admin-only "Limits" nav tab. Sync-on-evaluate
  (reuses `useSyncPortfolio`/`useUserPositions`), staleness timestamp, explicit sync-failure banner
  (never silent), acknowledge/glide-path UI per violation. **Verified in-browser** (screenshot, desktop
  + mobile 375px, no console errors): renders correctly with no synced positions yet; clicking "Sync &
  Evaluate" against the local dev server (no Netlify functions runtime, no IBKR proxy) surfaces the
  expected explicit failure banner rather than crashing.
- **Not done this session:** creating a second real Supabase auth user + live `user_positions` to
  multi-tenancy-prove the DB/RLS layer end-to-end (the pure-function layer's multi-tenancy is unit-
  tested; provisioning a second real account felt out of scope for this pass). RLS itself is identical
  to the already-proven `user_positions` pattern.

## Item 3 — regime_daily + regimeGate() + advisory light

- `packages/shared/src/utils/regime.ts` — `regimeGate()` (frozen `engine_version = '1.1.0'`, 4-cell
  ladder GREEN+GREEN→1.0/one RED→0.5/RED+RED→0.0, UNKNOWN propagation) + self-contained stats helpers
  (`sma`, `rocPositive`, `smaSlopePositive`, `realizedVolAnnualized`, `percentileRankOf`) — **zero
  imports from `macro.ts`**, per the standing prohibition. 18 tests cover all four ladder cells +
  UNKNOWN propagation + the stats helpers.
- `supabase/migrations/057_regime_daily.sql` — `regime_daily` table (exact spec column list) +
  `traders.regime_proxy` (seeded `STW→IWM`, `Graddox→underlying`).
- `apps/admin/netlify/functions/regime-daily.ts` — single function, two modes: daily-append (default)
  and backfill (`?backfill=1&days=N&before=YYYY-MM-DD` for walking further back across invocations).
  Same `run_log` instrumentation standard as Item 0. VIX3M availability from TwelveData is **unconfirmed
  this session** (quota exhaustion blocked the direct check) — the function marks `vol_state = 'UNKNOWN'`
  rather than guessing if it's unavailable, per the spec's own instruction.
- `packages/ui/src/features/regime/RegimeLight.tsx` — admin-gated (`isAdmin`), shows trend/vol state,
  risk multiplier, raw values, and the mandated "Advisory — under forward validation. Not a trade
  signal." label. Wired into the new Limits tab. **Verified in-browser**: renders the correct
  "no data yet" state (since no backfill has run) with no console errors, at both desktop and mobile
  width.
- **Not done this session — the backfill itself.** TwelveData's outputsize cap (5000) limits one call to
  roughly the trailing ~19-20 years, short of the spec's ~2000-present ask, and today's quota was already
  exhausted before this item was reached. The function is built and typechecked but has **not been
  invoked** — no `regime_daily` rows exist yet on either environment. Per the host-approved plan, running
  the backfill (via `?backfill=1&days=N`, walking back with `?before=` across multiple quota cycles) and
  the three spot-check dates (a 2022 double-RED day, a 2024 GREEN+GREEN day, an Aug-2024 vol-inversion
  day) from the acceptance criteria are **next-session work**.

## Item 4 — REGIME_EXIT_v0.md

Created [`docs/REGIME_EXIT_v0.md`](docs/REGIME_EXIT_v0.md) — unsigned template, named blanks, version/
date-signed fields. No code.

## Item 5 — SKILL.md amendments (out-of-repo, not part of this PR's diff)

- `~/Documents/Claude/Scheduled/stw-friday-weighting/SKILL.md`: added the reconciliation cascade
  (Discord search → `executed_at`/`date_precision` → `source='snapshot_reconciled'` always).
- `~/Documents/Claude/Scheduled/stw-morning-run/SKILL.md`: added the manual-reconcile-timestamp rule
  (host's original Discord message timestamp, never a bare midnight-UTC date, source link in notes).
  `stw-afternoon-run/SKILL.md` explicitly defers to morning's STEP 2.3 ("Identical write model"), so no
  separate edit was needed there.

## Deviations from the source spec (summary)

1. Item 0's root cause is the missing timeout override, not non-discovery (spec's exploration-agent
   theory) — see Item 0 above.
2. Item 1's `source='snapshot_reconciled'` detector is the actual notes content, not the literal phrase
   the spec named (which doesn't exist in the data).
3. Item 1's midnight-UTC audit scope was cut from "36 hits" down to those the host actually flagged as
   real anomalies — the host confirmed dates are already correct and offered to supply real times
   separately; no Discord-research pass was run.
4. Item 2 ships without a second live (non-synthetic) account to prove multi-tenancy at the DB layer —
   proven at the pure-function layer only.
5. Item 3's historical backfill was not executed this session (quota exhaustion) — schema, pure
   functions, and the backfill/daily-append function are all built, typechecked, and ready to invoke.

## Definition of done — status

All 7 items have code/schema in place and are typechecked (`pnpm -r typecheck`) and tested
(`pnpm -r test` — 187 tests in `@stw/shared`, all green). Two acceptance-criteria items are explicitly
deferred to next session due to TwelveData's daily quota being exhausted before this session reached
them: Item 0's live cron verification, and Item 3's actual backfill run + spot-checks. Everything else
in the acceptance criteria (constraint-violation tests, multi-tenancy pure-function proof, ladder-cell
unit tests, in-browser UI checks) has been verified directly, not assumed.

PR opened from `claude/week1-integrity-guardrails` into `staging` — **not merged**, per the spec's own
instruction and this repo's standing PR-approval rule.
