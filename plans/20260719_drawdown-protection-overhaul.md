# Drawdown-protection overhaul (host-requested 2026-07-19)

## Why this exists
The host held several deep single-name losses this week (ADEA −16%, TE −32%, LEU −17%,
AVAV −24%) and got **no warning at all** from the drawdown ladder. Investigation found **no
math bug** — but four real design gaps that made the ladder useless in practice. This plan
fixes all four. Advisory/display-only stays the rule; nothing here blocks a trade.

## Diagnosis (verified against PROD, user 0d90bc89-…)
- Ladder is **account-level**, not per-position: it measures NLV vs its cash-flow-adjusted
  high-water, so individual −30% names don't trip it.
- Real numbers: `equity_peak 45,089.91`, `ibkr_nlv 41,098.92` (synced Jul 19 18:41),
  `flows-since-peak = 0` → **`cashflowAdjustedDrawdownPct` = −8.85%**. Ladder Rung 1 = −10%.
  So it correctly didn't fire — the account is 1.15% *under* the first rung.
- `cashflowAdjustedDrawdownPct(nlv, equity_peak, cum_cf, equity_peak_cf)` in
  `packages/shared/src/utils/limits.ts` is correct: `peakAdj = equity_peak + (cum_cf −
  equity_peak_cf)`; dd% = `(nlv − peakAdj)/peakAdj`. Historical −$60k withdrawal does NOT
  dilute it (flows-since-peak = 0). Keep this formula.
- The gaps: (1) drawdown % is computed but **never displayed** until a rung fires —
  invisible early warning; (2) ladder runs off the **synced `ibkr_nlv`**, not the live
  Finnhub-priced positions the user is staring at; (3) **no notifications** (display-only,
  Risk tab only); (4) **no per-position stops**.

Test case for all work: this account should read **−8.85% · NEAR (Rung 1 at −10% → 70% gross)**.

## Item 1 — Show drawdown always + "near" warning  [do first; contained, low-risk]
The clear immediate win — removes the silence.
- In `ViolationsSummary.tsx` (and mirror the summary on `RegimeLight.tsx` if it belongs there):
  always render the current `drawdownPct` + the next rung + its target, even when no rung is
  active. e.g. `Drawdown −8.85% · next rung −10% → 70% gross`.
- Add a **"near" tier** to the ladder, matching the 4-tier limits vocabulary (`ok|near|breach`):
  amber `near` when within ~2 percentage points of the next rung (host to confirm the band);
  red once a rung is crossed. Reuse `StatusPill`.
- Source + as-of stamp per convention: the drawdown is off `ibkr_nlv` (as of `ibkr_nlv_at`).
- Silent only while `drawdownPct` is null (no real NLV+peak yet) — keep that.

## Item 2 — Drive the drawdown off LIVE prices  [engine change; design carefully]
So the ladder tracks what the user sees, not the last sync.
- Compute a **live NLV** = Σ(live position market value via `useLiveQuotes`/`priceCache`) +
  **cash**, where cash = `ibkr_nlv − Σ(synced position MV)` (the residual from the last sync).
- Feed live NLV into `cashflowAdjustedDrawdownPct` for the DISPLAY/ladder read.
- **Consistency risk to resolve:** `equity_peak` is trigger-maintained off the SYNCED
  `ibkr_nlv` (migration 071). Using a live NLV for "now" vs a synced peak can flip signs at
  the margin. Decide: does the peak also move to live, or does live only drive the
  *current-drawdown read* while the peak stays synced (probably the latter — the peak should
  be a settled high-water, not an intraday spike). Document the decision in `docs/decisions.md`.
- **One-source note:** the locked decision is "account equity = `risk_config.ibkr_nlv`". A
  live-derived NLV for the drawdown read is a deliberate exception for responsiveness — get
  host sign-off and record it; keep `ibkr_nlv` as the equity denominator for the % limits.
- Fall back to synced `ibkr_nlv` when live quotes are unavailable (market closed / uncached).

## Item 3 — Alerts when a rung is hit / approached  [largest; new capability]
Reaches the user off the Risk tab.
- No notification channel exists today. Decide the channel first (email is simplest — a
  Netlify fn → Anthropic-free transactional email via a provider; or in-app + a daily digest).
- A scheduled fn (post-sync) evaluates each user's drawdown and sends an alert on
  cross/approach, with de-dup (don't re-alert the same rung daily). Store last-alerted state.
- Advisory copy only; never implies an executed action.

## Item 4 — Per-stock drawdown LADDER  [distinct from the account ladder]  — DESIGN LOCKED (host 2026-07-19)
The thing that would've flagged TE −32% directly. A full ladder (host), not a single stop.
- **Trigger** = drawdown-from-entry per STOCK position: `(mark_price − avg_cost)/avg_cost`,
  from `user_positions` (stable — a trim doesn't change the remaining shares' avg_cost).
  Scoped to STK legs for v1 (options have their own leverage/decay risk lens — out of scope).
- **Rung action = reduce-to a fraction of PEAK size** (host: "trim ¼ each"). Default ladder:
  `[{-5→75}, {-10→50}, {-15→25}, {-20→0}]` = hold ≤ 75/50/25/0 % of peak. Per-user, retunable.
- **Trim-aware via `user_executions`, NOT a new baseline table** (host asked; confirmed the data
  exists). Reconstruct the current open episode's PEAK quantity by cumulative-summing signed fills
  per underlying (append-only log survives a full close). `alreadyComplies = |curQty|/|peakQty| ≤
  target` → idempotent (a rung goes quiet once you've trimmed to it; no nagging, and Item 3 alerts
  only fire when NOT complied). **Completeness guard:** reconcile Σ(signed fills) against
  `user_positions.quantity`; on mismatch (pre-window/pre-sync fills missing) fall back to
  peak = current qty ("history incomplete"), never a wrong number.
- **Shared logic** (`@stw/shared`): `reconstructPositionEpisode(fills)` → `{peakQty, entryQty,
  reconciles}`; `perStockLadderStatus(drawdownPct, curQty, peakQty, ladder, nearBandPp)` →
  `{severity, activeRung, nextRung, targetHoldPct, alreadyComplies, distanceToNextPp}`. Same
  `ok|near|breach` + NEAR band vocabulary as the account ladder.
- **UI:** My Portfolio position row (chip) + detail pane section, CLEARLY distinguished from the
  account "Portfolio drawdown" card (host: three concepts must be visually distinct). Independent
  axis — flags a NAME, sets no gross target, so it cannot contradict the regime/portfolio ladder.
- **Settings + migration:** `risk_config` gains `per_stock_ladder` (jsonb) + `drawdown_near_band_pp`
  (numeric, default 2 — the Item-1 near band, now the user's to set). One migration, Claude-authors/
  host-applies. `RiskConfigForm` gains both editors.

## Item 3 — Alerts  [BUILT: in-app + email (Resend) + Discord-bot DM (test bot)]
- **In-app**: Overview chips surface the account-drawdown state + a count of names near/past a
  per-stock stop, linking to the Risk tab / stop-filtered Positions (so warnings aren't buried).
- **Email + Discord**: `apps/web/netlify/functions/drawdown-alerts-cron.ts` (web-only, `*/15 13-21 *
  * 1-5` = every 15 min during US market hours, holidays skipped) LIVE-PRICES each user's holdings
  server-side (Finnhub) and evaluates the account + per-stock ladders intraday — so it fires WHEN a
  rung is crossed, not at a fixed time. Sends via Resend + Discord DM on ESCALATION, **capped to one
  alert per user per trading day** (host rule: act ASAP, no spam): `risk_alert_state` (migration 073)
  holds `last_level` (is-it-new) + `last_alerted_at` (ET, the per-day cap); a held escalation fires as
  the next day's first alert; recovery deletes the row. Reuses the `@stw/shared` engine (cron ↔ screen
  agree). Respects `preferences.drawdownAlertsOptOut` + active status. **Dormant until a channel is
  configured** (email vars and/or Discord token) + `VITE_FINNHUB_KEY` for the live read.
- **Discord-bot DM** (test bot): the cron also DMs via a bot (`DISCORD_BOT_TOKEN`) when the user has
  linked their Discord ID in Settings → Alert delivery (`profiles.discord_user_id`, migration 074).
  Bot identity is the token only → swap the test bot for production from the **admin UI** (Config →
  Discord alert bot; `integration_secrets`, migration 075 — admin-only RLS, write-only), with the
  `DISCORD_BOT_TOKEN` env as fallback. Two Discord REST calls (open DM, post). Channel-agnostic
  de-dup; state advances if any channel delivers.
- **Still open**: a Discord OAuth link flow (replace the manual ID paste); a Settings opt-out toggle
  for email (the fn already honors `preferences.drawdownAlertsOptOut`). See docs/drawdown-alerts.md.

## Standing constraints
Advisory/display-only (never blocks). Regime gate frozen at engine 1.1.0; gate ↔ Macro
composite never blend. Every displayed value: source + `fmtDateTime` as-of + prior-period.
Reuse `StatusPill`/`KpiCard`/`DetailPane`. Migrations Claude-authors / host-applies. Run
`/stw-review` before each PR; CI must pass.
