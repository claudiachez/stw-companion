# Follow-up — per-leg weight backfill (`stw_leg_weights_2026.sql`)

`supabase/stw_backfill_2026.sql` (the validated backfill of record) deliberately left **per-leg
`weight` NULL** on opening events — only holding-level weight was captured (Section 1
`holding_transactions`, which drives `holdings.current_weight`/`initial_weight` via trigger 031).
So `legs.weight` is NULL for open legs and the app's weighted-avg headline P&L
(`holdingPnlPct` in `packages/shared/src/utils/legs.ts`) can't roll up yet.

This is a **separate, deferred step**, owned by the agent that has the full Discord history (it
re-derives real per-leg weights from the source messages, 90/10 split only as fallback). Output is
a **new standalone SQL file `supabase/stw_leg_weights_2026.sql`** (UPDATEs), applied **after** the
main backfill — NOT edits to `stw_backfill_2026.sql`, NOT direct Supabase writes.

Mechanical note: it must `UPDATE legs.weight` **directly** (trigger 030 only derives on INSERT, not
on a `leg_transactions` UPDATE), and also update the opening `leg_transactions.weight` for event-log
fidelity. Scope = only the `weight` columns on `legs` + `leg_transactions`; OPEN legs primarily
(closed legs keep weight 0). Idempotent. Multi-share-lot holdings (AMKR/VIAV/HII have an original
lot + an exercise-spawned lot at `opened_at='2026-03-20'`) need an explicit split decision.

---

## Hand-off prompt (give to the history agent verbatim)

> You previously built `supabase/stw_backfill_2026.sql` (STW Companion repo, branch
> `claude/schema-multi-leg`) — the Dec 2025–Jun 2026 trade-history backfill for the **size-less,
> %-P&L** schema (migrations 029/030: `legs` + the quantity-free `leg_transactions` event log).
> It's validated and the backfill of record. **Read its header comment first.**
>
> In that file, **per-leg `weight` was deliberately left NULL** on opening events (only holding-level
> weight was captured, in Section 1's `holding_transactions`). As a result `legs.weight` is NULL for
> open legs, so the app's weighted-average headline P&L (`holdingPnlPct` in
> `packages/shared/src/utils/legs.ts`) can't roll up.
>
> **Your task: produce a NEW standalone SQL file** — `supabase/stw_leg_weights_2026.sql` — that
> populates the per-leg weights. Do **not** edit `stw_backfill_2026.sql`, and do **not** write to
> Supabase by any other means (REST/API). The output is a reviewable `.sql` file of `UPDATE`
> statements, meant to run **after** the main backfill.
>
> **Re-derive the real per-leg weights from the Discord source messages** (you have access to the
> full history — that's the authoritative source). For each leg, use the weight the host actually
> stated for that leg. Only when he never stated a per-leg split, fall back to his convention:
> **mixed** = 90% shares / 10% split across option legs; **options-only** = even split;
> **shares-only** = 100% (split between lots if there are multiple, e.g. an original lot + an
> exercise-spawned lot). The holding-level anchor weight is in Section 1 of the main file /
> `holdings.current_weight`.
>
> **What to write, per leg:**
> 1. `UPDATE legs SET weight = <per-leg %> WHERE …` — this is the operative column the app reads
>    (trigger 030 does **not** re-derive it on a `leg_transactions` UPDATE, so set it directly here).
> 2. `UPDATE leg_transactions SET weight = <per-leg %> WHERE …` on that leg's **opening BUY**
>    event(s) — keeps the event log faithful so a future clean replay reproduces the same
>    `legs.weight`.
>
> Target each leg with the same disambiguators the main file uses. Example:
> ```sql
> -- option leg
> UPDATE legs SET weight = 1.25
> WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW')
>   AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-09-18';
> -- shares lot (disambiguate multiple lots by opened_at)
> UPDATE legs SET weight = 90.0   -- (relative; the rollup normalizes)
> WHERE ticker='ENS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW')
>   AND instrument_type='SHARES' AND opened_at='2025-12-19';
> ```
>
> **Scope & rules:**
> - Touch **only** the `weight` columns on `legs` and `leg_transactions`. Change nothing else.
>   `holding_transactions.weight` and `holdings` weights are already correct — don't touch them.
> - Focus on **OPEN** legs (they drive current P&L). Closed/expired/exercised legs keep `weight = 0`;
>   only set a historical weight on a closed leg if the source clearly warrants it.
> - Make the file **idempotent** (absolute-value `UPDATE`s are naturally safe to re-run).
> - Handle the multi-share-lot holdings explicitly (AMKR, VIAV, HII each have an original lot **plus**
>   an exercise-spawned lot at `opened_at='2026-03-20'`) — derive their split from the messages if
>   stated, else note the assumption.
>
> **Optional validation** (don't write to Supabase otherwise): on the sandbox (ref
> `uolabcgbnrkhzpwuvzlk`, migrations 022–036; ask the user for the service-role key) — run
> `stw_backfill_2026.sql` first, then your `stw_leg_weights_2026.sql`, using the SQL editor's
> **"Run without RLS"** (the linter false-flags a nonexistent `shares` table). Acceptance: every OPEN
> leg has `legs.weight > 0`; for each multi-leg holding the open legs' weights sum to ≈ its current
> holding weight; `holdingPnlPct` returns a value for mixed holdings (e.g. ADEA).
>
> Deliver `supabase/stw_leg_weights_2026.sql` with a clear commit message, and flag any leg whose
> weight you couldn't source from the messages (fell back to the default).
