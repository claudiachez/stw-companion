# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- All product code through PR #143 is on `staging`. **A `staging → main` promotion is PENDING**
  (host-approved required) — it carries: AM recap + GEX both at **8:32 ET** (#140), the GEX
  **QUICK READ** parser fix (#141), GEX **freshness guard + stale flag** (#142), the My Portfolio
  **Account Value (NLV) reconciliation line** (#143). None of the scheduled-fn changes take effect on
  prod until that promotion.
- **Migrations at `071`** on PROD + sandbox; none authored recently.
- CI (`.github/workflows/ci.yml`) runs typecheck/lint/test/fn-parity on every PR. Run `/stw-review`
  before opening one. Netlify functions de-duped into `@stw/functions` (parity-enforced).

## Next work (priority order)
1. **Drawdown-protection overhaul** — `plans/20260719_drawdown-protection-overhaul.md`. The host held
   deep single-name losses with NO warning; the ladder is account-level (was at −8.85%, under the
   −10% Rung 1) AND silent-until-fire AND runs off the synced NLV, not live prices. Four fixes,
   ordered: (1) show drawdown always + "near" warning [do first, contained]; (2) drive drawdown off
   LIVE prices; (3) rung alerts/notifications; (4) per-position stop alerts. Read the plan — it has the
   verified numbers + the formula + the design risks (esp. peak consistency for the live-NLV change).
2. **RegimeLight ↔ Macro trend one-source fix** — the Risk-tab regime light and the Macro
   Trend/Structure card show SPY differently (Momentum vs Healthy Pullback) because two independent
   fetches (`useTickerRegime` vs `useMacroTrendHistory`) get different-vintage closes. Unify the index
   daily-closes behind one cached source; stamp the RegimeLight structure with its real as-of (not the
   gate's date). Diagnosed this session, not yet built.

## Notes / smaller items
- `ibkr_nlv` DOES refresh on every sync (nightly cron + Sync button write it by default from the Flex
  NAV section) — `ibkr_nlv_at` tracks the sync. Only `cumulative_cashflow` is import-only (needs a
  full-history report). Optional follow-up: keep cumulative cash-flow current between imports.
- `risk_config.updated_at` is a stale/unrelated column — never use it as the NLV as-of (use `ibkr_nlv_at`).
