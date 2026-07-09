# REGIME_EXIT — Advisory De-Risking Policy

**Status:** now a **per-user setting**, not a single signed document (host decision, 2026-07-08).
Each user's own values live on `risk_config` (migration 063) and are edited in **Settings → risk
config** (`RiskConfigForm`, Premium-gated to edit). The regime advisory surfaces the *viewer's own*
rule — see the Regime light on **My Portfolio → Risk**, the Overview regime line, and each position's
detail pane. This file now just documents the concept + the shipped **default** values below.

**Owner:** each user (the operator's book uses the same defaults until changed).

## Scope

Advisory only. Nothing in this repo reads this file or enforces the rule automatically — no code path
trims a position, adjusts a stop, or reduces gross exposure on anyone's behalf. The regime light and
the limits engine both **flag**; neither blocks (standing regime prohibition). The rule is surfaced
via `regimeExitAdvice()` in `packages/shared` from the frozen `regimeGate()` result + the user's stored values.

## The rule (shipped defaults)

These are the DB defaults (migration 063, `NOT NULL DEFAULT`); any user can override them in Settings.

**When single-RED** (exactly one of `trend_state` / `vol_state` is RED):

- Trim each open position to **70%** of its current size, OR
- Tighten stops to **5%**

**When double-RED** (`trend_state = RED` AND `vol_state = RED` — both the proxy trend check and the
volatility term structure have flipped):

- Reduce gross exposure to **30%**

## Notes

- The gate itself is a single, frozen, pre-registered rule under forward test (`regimeGate()`,
  `engine_version` in `packages/shared`) — not a validated signal. Treat a red light as a prompt to
  review, not an automatic trigger.
- Only the *response* values (trim / stop / gross) are per-user now; the gate logic stays frozen.
