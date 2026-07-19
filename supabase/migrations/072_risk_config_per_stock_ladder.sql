-- 072: risk_config per-stock drawdown ladder + user-set near band — Item 4 of
-- plans/20260719_drawdown-protection-overhaul.md.
--
-- Two additive, advisory/display-only columns (same "seed a default, let the user
-- override" pattern as 055/059/060/063/065 — NOT NULL DEFAULT, no app change needed
-- to read a sane value):
--
--   per_stock_ladder     — the FULL per-stock drawdown ladder (host 2026-07-19). Keyed to a
--                          single position's drawdown from entry ((mark − avgCost)/avgCost);
--                          each rung is a reduce-to target as a % of the position's PEAK size
--                          (0 = exit). Default = trim a quarter of peak at each step, exit by
--                          −20% → hold ≤ 75/50/25/0 % (matches DEFAULT_PER_STOCK_LADDER in
--                          @stw/shared). A DIFFERENT axis from the account ladder / regime rule:
--                          it flags a NAME, sets no gross target, so it can't contradict them.
--   drawdown_near_band_pp — how many percentage points from the next rung the amber "near"
--                          early warning fires, for BOTH the account (Item 1) and per-stock
--                          ladders. Was a fixed constant; now the user's to set. Default 2.
--
-- The DEFAULT backfills every existing row on ALTER, so current users get the default
-- ladder + band immediately (unlike the account `ladder`, which app-seeds new rows only).
-- Advisory / display-only — nothing here places, blocks, or adjusts a trade.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

alter table public.risk_config
  add column if not exists per_stock_ladder jsonb not null default
    '[{"drawdownPct":-5,"holdFractionPct":75},{"drawdownPct":-10,"holdFractionPct":50},{"drawdownPct":-15,"holdFractionPct":25},{"drawdownPct":-20,"holdFractionPct":0}]',
  add column if not exists drawdown_near_band_pp numeric not null default 2;

comment on column public.risk_config.per_stock_ladder is
  'Per-stock drawdown ladder (advisory): [{ "drawdownPct": -10, "holdFractionPct": 50 }, ...] — at drawdown-from-entry drawdownPct, reduce the position to holdFractionPct % of its PEAK size (0 = exit). Compliance is checked against the peak reconstructed from user_executions. Display-only, never enforced.';
comment on column public.risk_config.drawdown_near_band_pp is
  'Percentage points from the next rung at which the amber "near" early warning fires, for both the account and per-stock drawdown ladders. Display-only.';
