# Launch Gates — blocking checklist before the FIRST external user account

**Status:** active, blocking. **Owner:** the host. **Created:** 2026-07-09 (Week-2 Item 0a,
[`plans/20260709_integrity-guardrailsv2.md`](../plans/20260709_integrity-guardrailsv2.md)).

## Why this file exists

The app currently has **zero external users — the operator is the sole account.** Several
subscriber-visible surfaces (the RegimeLight, the REGIME_EXIT advisory, the per-user limits
engine) are mounted as the operator's own **test configuration** for validating the future
user experience — not as an exposure to any real subscriber. That is correct *today*.

It stops being correct the moment a **second, external** account is created. Two risks that
cannot manifest in a single-user system become live at that point. This file is **structural
memory**: onboarding the first subscriber must trip over this checklist, rather than depend on
anyone recalling the 2026-07-08 decision to defer these items.

These are **not calendar items.** They activate when the operator decides to onboard the first
external user, whenever that is. Every gate below must pass **before** the first external
`auth.users` row is created.

---

## Gate 1 — Unvalidated-signal display decision

`RegimeLight` and the `REGIME_EXIT` advice are mounted on subscriber surfaces (My Portfolio →
Risk, position detail panes, the Overview regime line) as the operator's test configuration.
The two-component regime gate is **frozen and still under forward test** — its verdict does not
yet exist (see the plan's trigger-driven back half; the gate verdict needs n≥100 per bucket).

**Before any external user sees these surfaces, decide — against whatever gate-verdict evidence
exists at that time:**

- [ ] **Ship with the advisory label**, or **re-gate to admin-only** until the verdict lands.
- [ ] If shipping to subscribers: **the counsel question is answered first.** Claude-generated
      risk signals reaching a paying tier is jurisdiction-dependent investment-advice exposure
      that the host's current disclaimers do not cover. This is a legal/compliance check, not an
      engineering one — do not ship a generated signal to a paid tier without it.

Standing prohibition that remains in force regardless: **nothing enforces the regime multiplier
on any order path until Phase B** — everything here is advisory / display-only.

## Gate 2 — DB-layer multi-tenancy proof

Cross-tenant isolation has only ever been proven at the **pure-function layer**. Cross-tenant
bugs **cannot manifest in a single-user system** — so "never observed" is not "verified."

**Before the first external user, prove isolation through the live database with a second real
auth account:**

- [ ] RLS isolation verified on **every** per-user table: `risk_config`, `user_positions`,
      **`user_executions`** (Week-2 Item 1), `risk_violation_acks`, `regime_exit_audit`
      (Week-2 Item 0b), and the REGIME_EXIT columns on `risk_config`.
- [ ] **Independent limits evaluation** — account B's limits/violations reflect account B's
      positions only, never account A's.
- [ ] **No cross-read / cross-write under adversarial queries** — account B cannot select or
      mutate account A's rows by forging ids.

A throwaway second account costs about an hour and is recommended **opportunistically earlier**
(it de-risks every per-user feature). It is **mandatory here.**

---

## How to use this file

When onboarding work begins, treat each unchecked box as a release blocker. Record the outcome
(decision taken, evidence cited, date) inline as each box is checked, and add an `ops_log`
`flag_resolution` row pointing back to this file so the resolution is itself auditable.
