-- 063: per-user REGIME_EXIT rule — makes the advisory de-risking policy
-- (docs/regime_exit_v0.md) a per-user setting instead of a single operator-owned
-- document (host decision, 2026-07-08). Each user gets their own trim / stop /
-- double-RED-gross values, edited in Settings (RiskConfigForm), and the regime
-- advisory (My Portfolio Risk tab + position detail + the RegimeLight) shows the
-- USER's own numbers instead of a one-size playbook.
--
-- Same additive "seed a placeholder default, let the user override" pattern as
-- migrations 055/059/060 — NOT NULL DEFAULT with the host-chosen starting values
-- (trim to 70% · tighten stops to 5% · double-RED gross to 30%). Existing rows
-- pick up the defaults via the DDL. Advisory / display-only, exactly like every
-- other value in this table — nothing here places, blocks, or adjusts a trade.
--
-- Run in the Supabase SQL editor, or via the Supabase MCP apply_migration.

alter table public.risk_config
  add column if not exists regime_trim_to_pct         numeric not null default 70,
  add column if not exists regime_stop_pct            numeric not null default 5,
  add column if not exists regime_doublered_gross_pct numeric not null default 30;

comment on column public.risk_config.regime_trim_to_pct is
  'REGIME_EXIT (advisory): on a single-RED regime, trim each open position to this % of current size. Display-only, never enforced.';
comment on column public.risk_config.regime_stop_pct is
  'REGIME_EXIT (advisory): on a single-RED regime, the alternative action — tighten stops to this %. Display-only, never enforced.';
comment on column public.risk_config.regime_doublered_gross_pct is
  'REGIME_EXIT (advisory): on a double-RED regime, reduce gross exposure to this %. Display-only, never enforced.';
