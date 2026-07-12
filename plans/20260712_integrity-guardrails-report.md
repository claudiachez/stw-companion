# STW Companion — Integrity Guardrails Report (2026-07-12)

**Session:** cash-flow-adjusted drawdown ladder + ladder↔regime reconciliation.
**Plan context:** `plans/20260709_integrity-guardrailsv2.md` (Week 2 → Autonomy).
**Disposition:** maintenance/correctness on the **already-shipped per-user limits engine**
(the plan's trigger table, subscriber-surfaces row 1: *"per-user limits engine — already
shipped, pending item-0b proof"*; item-0b passed, ops_log row 12). **Not** a new plan phase
and not on the validation track — the log still accrues, the analyzer is still unbuilt by design.

---

## 1. What shipped

### PR #114 — cash-flow-adjusted drawdown ladder (MERGED to `staging`; migration applied to PROD + sandbox)
The Risk-tab drawdown ladder fired a phantom **−60%** drawdown: migration 059's
`fn_risk_config_track_equity_peak` ratcheted `equity_peak` off the `account_equity`
**$100k placeholder**, never the real ~$40k live equity.

- **Migration `071_risk_config_cashflow_drawdown.sql`** — adds `cumulative_cashflow` /
  `cumulative_cashflow_at` / `equity_peak_cashflow`; rewrites the peak trigger to drive off
  **`ibkr_nlv`** (live broker equity) on a **cash-flow-adjusted high-water basis**; clears the
  phantom placeholder peaks. Applied + verified on **PROD and sandbox**.
- **Model** (`cashflowAdjustedDrawdownPct`, `@stw/shared`, +9 tests): drawdown counts only cash
  flow *since* the peak — `peakAdjustedToNow = equity_peak + (cumulative_cashflow −
  equity_peak_cashflow)`. Baseline-invariant: a historical withdrawal that predates the first NLV
  observation never reads as a loss; a deposit raises the bar; a real loss reports honestly.
- **`flex-core.ts`** — NLV write no longer sets the peak (the DB trigger owns it); `cumulative_cashflow`
  is written from `<ChangeInNAV>` `depositsWithdrawals` on the **import only** (a rolling daily-sync
  window can't be accumulated without double-counting).
- **Render nothing until real data exists** — null NLV / null peak → ladder silent, no phantom.

### PR #115 — form alignment + ladder↔regime reconciliation (open → `staging`)
- **Settings form alignment** — live account-equity value lines up with the input column; long field
  descriptors wrap in place.
- **Config coherence warning** — non-blocking Settings flag when the double-RED regime gross target is
  set *looser* than the deepest drawdown-ladder rung (a likely misconfig — the ladder would already
  de-risk further, so the regime target would never bind). Triggers stay **independent**, not auto-linked.
- **One binding gross target on both surfaces** — `bindingGrossTarget()` (`@stw/shared`, +5 tests) +
  `useBindingGrossTarget()` compute the tighter of {drawdown-ladder target, double-RED regime target}
  once per parent and pass it to both the gross-exposure card and the Regime light, so the two never
  show conflicting numbers. The Regime light adds a line only when the ladder binds *tighter* than the
  regime target (the one case its own advice number isn't operative).

## 2. Validation

- **Real PROD data:** after the operator's Last-Business-Day sync — `ibkr_nlv=$45,090`,
  `cumulative_cashflow=−60,000`, `equity_peak=$45,090` → **drawdown reads 0.00%**, not the phantom −60%.
  The ~$60k 2026-02-17 withdrawal is correctly neutralized.
- **Stress test — 12 scenarios**, all coherent: at-peak, above-peak (gain), calm-market drawdown,
  single-RED, double-RED, both-firing (regime-tighter and ladder-tighter), deep drawdown, equal targets,
  the loose-regime misconfig, and no-NLV-yet. One rough edge found and fixed (redundant / misleading
  Regime-light copy → gated to ladder-binds-tighter-only).
- Typecheck clean · **296 tests** · 0 lint errors throughout.

## 3. Standing-prohibition compliance (verified)

| Prohibition | Status |
|---|---|
| #1 — advisory/display only, no order-path enforcement | ✅ binding target, ladder, regime advice are all flags/notes |
| #2 — two-component gate and Macro composite never blend | ✅ Macro composite untouched; the reconciliation combines two *advisory de-risk policies* (account drawdown + regime exit advice), not the multiplier with the composite |
| #3 / #5 — gate frozen at 1.1.0, no new indicators | ✅ `regimeGate` untouched; only its existing `trend_state`/`vol_state` output is read |

## 4. Plan position after this session

- **Week 1** — on production. **Week 2** (items 0–4) — code-complete on `staging`; its data is now
  flowing (443 executions, NLV synced, drawdown live).
- **Week 3 (historical reconstruction) is the next substantive block — not started.**
- **Trigger-driven back half** — correctly zero work; waiting on data accrual.
- **Pending host decision:** a `staging → main` promotion (approval-gated) — Week 2 + all the above is
  **not on production**; the nightly `ibkr-sync-cron` stays dormant until it lands.

---

## 5. NEW discussion item for Week 3 — regime trend input: 200-day gate vs 9/21/200 structure bucket

**Origin:** the ⚑ deferred question (host, 2026-07-11), parked pending a decision.

**The question.** The Risk-tab Regime light already *displays* the finer 9/21/200 **structure bucket**
(`momentum` / `healthy_pullback` / `mid_caution` / `bear_rally` / `risk_off`) as its trend read, but the
**risk multiplier + REGIME_EXIT advice** are still driven by the frozen `regimeGate`'s coarse binary
trend (close vs 200-day SMA, engine v1.1.0). Should the multiplier/advice switch to the structure bucket?

**Why it belongs in Week 3, not sooner.** It is explicitly an **engine change** — it collides with the
standing "gate frozen at 1.1.0 / no new indicators enter the gate" prohibitions, so it cannot be done
casually. It needs (a) a **bucket → GREEN/RED (or a finer state) mapping** — `bear_rally` / `mid_caution`
don't map cleanly onto the binary gate; and (b) a **forward-validation baseline reset** (ship as engine
**v1.2.0**). Week 3 backfills `regime_daily` to ~2000 and Week 4 builds the analyzer — that is precisely
the evidence base needed to decide whether the structure bucket is a *better* trend input, by the numbers,
rather than by intuition. Adopting it before that evidence exists would be the exact failure mode the plan
is built to prevent (a new regime feature during the accrual window).

**Framing for the Week-3 discussion (decision deferred to then, not taken here):**
1. Define the bucket→state mapping candidates (e.g. `risk_off` → RED; `momentum`/`healthy_pullback` →
   GREEN; `mid_caution`/`bear_rally` → an intermediate state or held as GREEN pending evidence).
2. Backtest the mapped structure trend vs the 200-day gate trend over the extended `regime_daily`
   history (2000–present) once Week 3 lands it — same pre-registered kill/keep discipline as the gate
   verdict (n≥100 per bucket; a change requires the pre-registered evidence thresholds, never convenience).
3. If adopted: ship as **v1.2.0**, reset the forward-validation baseline, and record the change in
   `ops_log`. If not: the structure bucket stays a *display* refinement only and the gate stays 1.1.0.

**Prohibition note:** whichever way it goes, it does not relax prohibitions #3/#5 — it is a *replacement*
of the trend component's definition validated against pre-registered thresholds, not a *new* component
added alongside the existing two. The two-component (trend + vol) shape is preserved.
