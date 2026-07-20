# Risk tab — build spec (My Portfolio → Risk)

Design: `design_handoff_stw_companion/Risk Tab - Redesigned.dc.html` (re-fetch via DesignSync when
building — save to `refs/`). Mounts in `PortfolioPage.tsx` under the `risk` SubNav tab (max-width 860).
The current implementation is `features/limits/ViolationsSummary.tsx` (551 lines) + `features/regime/
RegimeLight.tsx` — this is a re-layout of that live risk engine, NOT new logic. Reuse every existing
computation/hook; do not re-derive numbers.

## Sections (top→bottom), all advisory/display-only
1. **Risk verdict banner** (state-colored bg/border/text by worst severity): a pill
   ("N actions" / "Heads-up" / "All clear") + headline + right "Advisory only…" note, then an
   aggregated item list (dot + main sentence + sub sentence) — one item per breach/near across ALL
   guardrails (safety-net step crossed, invested over target/cap, each cap breach/near, each per-stock
   stop past/near). Empty state when nothing fires. This banner is the NEW aggregation layer over the
   data ViolationsSummary already computes.
2. **"The market right now" → Market health check** card: IWM/SPY/QQQ chip selector (drives
   `useRegimeInstrument`), Trend light (dot+label+note), Volatility light, Suggested sizing
   (×1.0 / ×0.5 / ×0.25 from one-red/both-red), red-market playbook callout (from `regimeExitAdvice`),
   and a "Show the numbers behind this" toggle (close vs 9/21/200 MAs + VIX vs VIX3M, sourced). This is
   the RegimeLight data re-presented. Regime gate FROZEN at 1.1.0 — read only, no new indicators.
3. **"Your account vs your plan"** — four cards:
   - **Account safety net**: drawdown pill (ok/near/breach) + big −X% + "−$ below peak" (live NLV) +
     sentence + the ladder viz (segments, "▼ you are here" on the active rung) + source stamp
     (`Finnhub · <t>` live / `IBKR · <sync>`). Uses `cashflowAdjustedDrawdownPct` + `drawdownLadderStatus`
     + the live-NLV read already computed in PortfolioPage/ViolationsSummary. **Honor `ladder_enabled`** —
     if off, show a muted "safety net is off" state, don't evaluate.
   - **How much you're invested**: gross pill + big gross% + "≈ $ of $account" + sentence + a bar with
     the cap marker (black) and today's target marker (amber, from the binding ladder target) + legend.
     Uses `useBindingGrossTarget` (the ladder↔regime "tightest binds" reconciliation) + `ibkr_nlv`
     denominator (NOT re-derived). **Honor `ladder_enabled`/`regime_enabled`** for the target marker.
   - **Size caps**: exceptions-first cap rows (name, kind, pct-of-cap, severity pill, bar with cap
     marker, over/room sub) + the ack ("Got it — I'll handle this") + glide-path plan input — reuse the
     EXISTING `risk_violation_acks` workflow (`useViolationAcks`/`useAcknowledgeViolation`). "Show the N
     within their caps" → chips. **Honor `caps_enabled`.** Options cap uses `max_option_position_pct`.
   - **Per-stock stops**: rows (ticker TickerLink, −down% from entry, near/breach pill, plan sentence,
     stops detail). Uses `usePerStockLadders`. **Honor `per_stock_enabled`, and use
     `per_stock_option_ladder` for OPTION positions vs `per_stock_ladder` for shares** (migration 078 —
     this is the deferred honoring from the Settings work).
4. **Glossary** card (toggle) — plain-English terms.

## Honoring the guardrail on/off flags (deferred from Settings — DO here)
`risk_config` now has `caps_enabled / ladder_enabled / per_stock_enabled / regime_enabled` (default
true) + `per_stock_option_ladder`. A disabled guardrail must NOT contribute banner items, must NOT
render a breach/near, and shows a muted "off" affordance instead. The per-stock evaluation must pick the
option ladder for option positions. (The alert cron honoring is separate — flag if not done here.)

## Data sources (reuse — one source, no re-derivation)
- Drawdown/live NLV: `useLiveNlv` + `cashflowAdjustedDrawdownPct` + `drawdownLadderStatus` (as in
  ViolationsSummary/PortfolioPage). `ibkr_nlv` is the concentration denominator; the live-NLV read is
  the signed-off drawdown exception — don't extend it to the caps.
- Binding gross target: `useBindingGrossTarget(config, instrument)` — computed ONCE in the parent.
- Regime: `useLatestRegime`/`regimeExitAdvice`/`useRegimeInstrument` (frozen gate).
- Caps/violations + acks: the `classifySeverity`/limits scorers + `useViolationAcks`.
- Per-stock: `usePerStockLadders`.
- Dollar amounts gated by `usePrivacyStore().showMoney` (the new privacy pref).

## Conventions
Tokens + primitives only (StatusPill for the pills — ok/near/warning/breach; KpiCard idiom for the big
numbers; TickerLink for tickers; AlertStrip for the playbook callout; the ladder viz mirrors the
Settings `LadderViz`). No literal hex/fontSize. Works ≤390px. The three de-risking surfaces stay
visually distinct (RegimeLight market card / account drawdown ladder / per-stock stops).

## Verification
typecheck + lint; boot. The authed page can't be screenshotted here — a logged-in pass on the Risk tab
is needed (toggle a guardrail off in Settings → confirm it drops from the Risk banner + cards).
