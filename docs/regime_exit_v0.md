# REGIME_EXIT v0 — Advisory De-Risking Policy

**Status:** template — not yet signed. Fill every blank and set the version/date before this
policy is considered active.

**Version:** v0 (unsigned)
**Date signed:** ___________
**Owner:** the operator (this is not an engineering decision)

## Scope

This document defines what the operator does, by hand, when the advisory regime light (Item 3,
`regimeGate()`) turns amber or red. **It is advisory only.** Nothing in this repo reads this
document or enforces it automatically — there is no code path that trims a position, adjusts a
stop, or reduces gross exposure on your behalf. The regime light and the limits engine (Item 2)
both flag; neither blocks.

Parameter changes require a version bump (v0 → v1, etc.) and a new signed date. **Parameters may
not change mid-drawdown** — decide the rule when calm, follow it when it matters.

## The rule

**When `vol_state = RED`** (VIX ≥ VIX3M — the term structure has inverted):

- Trim each open position to **______%** of its current size, OR
- Tighten stops to **______**

**When double-RED** (`trend_state = RED` AND `vol_state = RED` — both the proxy trend check and
the volatility term structure have flipped):

- Reduce gross exposure to **______%**

## Notes

- This is a single, frozen, pre-registered rule under forward test (per `regimeGate()`,
  `engine_version` in `packages/shared`) — not a validated signal. Treat a red light as a prompt
  to review, not an automatic trigger.
- If the rule proves wrong in practice, that's a v1 conversation for calm markets — not a reason
  to override it live.
