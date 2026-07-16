# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- **`staging` and `main` are in sync — everything is on PRODUCTION** (promoted 2026-07-16, PR #138,
  host-approved: 124 commits). No pending promotion.
- **Migrations applied + verified through `071`** on PROD + sandbox (058 PROD-only — known sandbox gap).
  No migrations authored recently; the DB was already at 071 before the promotion.
- **CI is live** (`.github/workflows/ci.yml`): typecheck + lint + test + `check:fn-parity` on every PR.
  Run `/stw-review` before opening a PR.
- Scheduled fns now fire on prod: `ibkr-sync-cron` (nightly), regime-daily 5-day trailing-window
  (VIX self-heal), recap AM/PM retiming, gex/macro snapshot writers.

## Verify on prod (next session / as they occur)
- **Regime VIX self-heal:** confirm the nightly `regime-daily` now writes rows WITH `vix_close`
  (was null Jul 10–14 pre-fix; those were hand-patched). The Risk-pane regime should track the
  latest trading day, not freeze.
- **Macro econ-actuals + recap timing:** on a real release morning, Event Risk shows the just-released
  print + green/red favorability arrow; the AM recap lands ~7:50 (or 8:33 on an 8:30-release day).
- **`ibkr-sync-cron`:** confirm its first nightly tick populated/refreshed subscriber data (`run_log`).

## Next work
- **Week 3 — historical reconstruction** (`plans/20260709_integrity-guardrailsv2.md`, WEEK 3): ~60 weekly
  snapshots into staging tables; decide the regime trend-input question (200-day gate vs 9/21/200
  bucket). Standing prohibitions carry through (gate frozen 1.1.0, advisory-only, no gate/composite blend).
- Backlog (host-requested, unordered): multi-trader tailing (needs a link table + conflict rule — get
  the rule decided first), transcripts/episode-recap tab, global activity feed. See docs/session-history.md.
