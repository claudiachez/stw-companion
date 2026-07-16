# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- **Everything is on `staging`, nothing new on `main`.** A `staging → main` promotion is
  **PENDING and approval-gated** — do not open one without explicit host approval.
- **Migrations applied + verified through `071`** (`071_risk_config_cashflow_drawdown.sql`) on
  PROD + sandbox (058 is PROD-only — known permanent sandbox gap).
- **CI is live** (`.github/workflows/ci.yml`): typecheck + lint + test + `check:fn-parity` on every PR.
- Nightly `ibkr-sync-cron` + the recap-timing / regime-cron changes are scheduled fns → dormant
  until the promotion (Netlify runs cron only on the `main` deploy).

## Pending host actions
- **`staging → main` promotion** (gates all recently-merged work into production).
- Post-promotion, the `regime-daily` trailing-window fix self-heals VIX; until then PROD daily rows
  land null-VIX (the Jul 10–14 rows were patched by hand → the Risk pane reads "as of Jul 14").
- Verify Macro econ-actuals on a real release morning (Event Risk reaction overlay + the AM recap
  retiming, which only fires on prod).

## Next work
- **Week 3 — historical reconstruction** (`plans/20260709_integrity-guardrailsv2.md`, WEEK 3 section):
  ~60 weekly snapshots into staging tables; the regime trend-input discussion (200-day gate vs
  9/21/200 bucket) is decided here. Standing prohibitions carry through (gate frozen 1.1.0,
  advisory-only, no gate/composite blend).
- **Reconcile `macro-recap.ts`** — the web/admin copies genuinely drifted (allow-listed in
  `check-fn-parity`); align the shared prompt/logic, keep only the real per-site auth difference.
- **Optional:** physical de-dup of the paired Netlify functions into a shared module — carries
  Netlify per-app bundling risk; verify against a real deploy before relying on it (the parity
  check already removes the drift risk without it).
