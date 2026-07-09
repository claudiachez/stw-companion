# Week 1 Integrity Guardrails — Completion Report (2026-07-08)

Companion to the original plan [`20260706_integrity-guardrails.md`](20260706_integrity-guardrails.md)
and the first status report [`20260706_integrity-guardrails-report.md`](20260706_integrity-guardrails-report.md).
This report records the **final state** of the 7-item plan as of 2026-07-08 and — the point of the
document — **every deviation from the original spec**, so nothing silently drifted.

## Headline

**All 7 items are shipped.** Everything is on `staging`; the FRED/GICS re-platform + the whole
week-1 batch was promoted to production (`main`) via **PR #81** on 2026-07-08 and post-deploy-verified.
Two things are *not yet on `main`*: PR #82 (regime-daily schedule) and the per-user REGIME_EXIT
feature — both on `staging`, pending an approval-gated promotion. The `regime-daily` **daily cron only
begins firing once #82 reaches `main`** (Netlify runs scheduled functions on the production deploy
only — see "Deployment note" below).

## What shipped, per item

| Item | State | Where |
|---|---|---|
| 0 — macro-snapshot cron fix | ✅ live + verified on PROD (2026-07-08, `macro-snapshot-2.0.0`, real FRED scores, `run_log`) | `main` |
| 0.5 — closed-weight invariant | ✅ live (8 rows corrected + `fn_check_closed_weight_zero` guard) | `main` |
| 1 — integrity migration 054 + audit | ✅ live (`ops_log`, `weight NOT NULL`, provenance cols, midnight-UTC audit, `tradingDateET()`) | `main` |
| 2 — limits engine | ✅ live + **extended to subscribers** (Premium-gated) | `main` |
| 3 — regime_daily + gate + advisory light | ✅ built, **backfilled** (PROD 4,200 rows), **scheduled** (#82) + light mounted; cron fires post-promotion | `staging` |
| 4 — REGIME_EXIT | ✅ **converted from a static doc into a per-user feature** (migration 063) | `staging` |
| 5 — SKILL.md amendments | ✅ done (out-of-repo ingestion routines) | n/a |

## Deviations from the original plan (the important part)

1. **Item 0 root cause differed from the spec's theory.** The spec guessed the function wasn't
   discovered by Netlify; the real cause was a missing `timeout` override (the ~10-call function hit
   Netlify's short default). Fixed by adding `timeout = 60`.

2. **Item 0 engine superseded mid-stream by the FRED re-platform.** The spec targeted
   `macro-snapshot-1.1.0` on TwelveData indices; an interim data-feeds re-platform (PRs #78/#79)
   moved macro indices to **FRED**, so the shipped engine is **`macro-snapshot-2.0.0`** (FRED
   VIX/VIX3M/US10Y/HY-OAS). The TwelveData-quota failure mode the spec worried about is moot for
   indices now.

3. **Item 1 `snapshot_reconciled` detector.** The literal phrase the spec named ("reconciled from
   weekly snapshot") does not exist in any `notes`; the reconciliation rows were identified by their
   actual content instead (6 rows: ADEA ×2, RNG, MITK, ARKK, CRNC).

4. **Item 1 midnight-UTC audit scope.** The spec named 5 "confirmed" anomalies; the detector actually
   matched **36 of 80** rows, most of them ordinary older day-precision entries, not synthetic
   backdates. Host confirmed the calendar dates were already correct; rather than a Discord-research
   pass, all 36 (PROD) / 37 (sandbox) were stamped with an assumed **4:00pm ET** market-close time on
   their existing date (DST-adjusted). `tradingDateET()` special-cases exact-midnight timestamps to
   avoid the previous-day rollback bug.

5. **Item 2 expanded beyond "apps/admin only this week."** Host decision (2026-07-06): the limits
   engine was extended to **subscribers** the same week — per-user `risk_config`, a shared
   `LimitsPanel`/`ViolationsSummary`, Premium-gated, split so **config lives in Settings** and **live
   evaluation lives on My Portfolio → Risk** (standing rule: Settings holds setup, not live data).
   *Not done:* a second real auth account to prove DB-layer multi-tenancy (proven at the
   pure-function layer only).

6. **Item 3 is FRED-backed, not TwelveData.** VIX3M via FRED `VXVCLS` makes `vol_state` resolve
   instead of the spec-anticipated permanent `UNKNOWN`. US10Y via `DGS10` (already a percent, no ×10).

7. **Item 3 backfill happened 2026-07-08, not in the week-1 session** (TwelveData quota was exhausted
   then). Run via the local **esbuild-bundle harness** (the exact deploy artifact — zero logic drift),
   chunked with `?before=` walk-back. Result: PROD `regime_daily` = **4,200 rows, IWM/SPY/QQQ each
   2020-12-08 → present**. **Depth deviates from the spec's ~2000-present ask** — stopped at ~2020-12
   (covers all acceptance spot-checks + a full 2021 bull / 2022 bear base; deeper history is more
   `?before=` chunks if ever wanted; TwelveData's 5000-bar cap is the limiter, FRED has none).
   **Sandbox `regime_daily` left empty** (dev-only; the local env has only the sandbox anon key, which
   can't write past RLS).

8. **Item 3 advisory light was never actually mounted in week-1.** The first report claimed
   `RegimeLight` was "wired into the Limits tab," but it was exported and mounted **nowhere**. This
   session actually mounted it — on **My Portfolio → Risk** (all portfolio users) and the **admin
   LimitsPanel** — and made it presentational (dropped the hard `isAdmin` return-null; visibility is
   now decided by the mount site).

9. **Item 4 is the largest deviation — REGIME_EXIT became a per-user feature, not a signed document.**
   The spec scoped Item 4 as a static, operator-owned **document** (`docs/regime_exit_v0.md`) with
   "no enforcement code, no UI beyond optionally linking the doc." Host decision (2026-07-08):
   turn it into a **per-user, Settings-configurable rule** —
   - migration **063** adds `regime_trim_to_pct` (70), `regime_stop_pct` (5),
     `regime_doublered_gross_pct` (30) to `risk_config` (`NOT NULL DEFAULT`, host's values as the seed);
   - a pure `regimeExitAdvice(gate, rule)` in `@stw/shared` (6 unit tests);
   - a "Regime de-risking rule (advisory)" section in `RiskConfigForm` (Settings, Premium-gated to edit);
   - the rule is displayed to every portfolio user (defaults until overridden) in the RegimeLight, the
     Overview regime line, and each position's detail pane, replacing the old generic "STW's playbook" text.
   - The spec's operator-only governance ("version bump required, no change mid-drawdown") is
     **dropped** for the per-user model — it's now a personal advisory preference.
   - `docs/regime_exit_v0.md` was repurposed to document the concept + the shipped defaults, not a
     single signed policy.
   It remains advisory / display-only — nothing enforces it (the standing regime prohibition holds).

10. **Deployment note (a platform limitation, not a code deviation).** Items 0 and 3 are Netlify
    **scheduled functions**, which run only on a site's **production (`main`) deploy** — not on
    `staging`. And a `schedule()`-wrapped function is **cron-only over HTTP** (its URL won't invoke it).
    Consequence: scheduled-function *logic* is verified off-cron (local esbuild-bundle harness /
    manual invocation), and the cron *trigger* is confirmed only after promotion (check `run_log`
    after the first tick). This is why `regime-daily`'s daily append does not start until #82 is
    promoted to `main`.

11. **CCXI unresolved (adjacent, from PR #79's `sector-map-sync`).** `sector-map-sync` can't
    auto-classify CCXI (the Agility Robotics SPAC shell — Finnhub returns no industry). It correctly
    leaves it `unevaluated` (never a breach). Fix pending: a `CCXI: 'Industrials'` `TICKER_GICS`
    override.

## Not yet live / outstanding

- **Promote `staging → main`** (approval-gated) — activates the `regime-daily` cron and ships the
  per-user REGIME_EXIT feature + the mounted RegimeLight to production.
- **In-browser verification** of the REGIME_EXIT feature on `staging` before promotion.
- **CCXI → Industrials** GICS override.
- Optional: sandbox `regime_daily` backfill (dev-only); a second-account DB multi-tenancy proof for
  Item 2; deeper `regime_daily` history.

## Migrations authored by this batch

`054` (integrity), `055`/`056` (limits + acks), `057` (regime_daily), `058` (limits Premium tier,
PROD-only — sandbox has no `tiers`), `059`/`060` (risk_config equity + option cap), `061` (regime
sleeve weights), `062` (GICS re-seed), **`063` (per-user REGIME_EXIT — applied to PROD + sandbox
2026-07-08, verified)**.
