-- ================================================================
-- stw_leg_weights_2026.sql
-- Populate per-leg weight on OPEN legs for STW's 2026 portfolio.
--
-- RUN AFTER stw_backfill_2026.sql — this file depends on all legs
-- and leg_transactions already existing.
--
-- PURPOSE
-- -------
-- stw_backfill_2026.sql deliberately leaves legs.weight = NULL on
-- every opening BUY (per-leg sizing was never broadcast per-leg by
-- the host). This file fills those weights so that holdingPnlPct()
-- in legs.ts returns a value instead of null for every OPEN holding.
--
-- WHAT THIS FILE TOUCHES
-- ----------------------
--   • legs.weight              ← the column the app reads for P&L rollup
--   • leg_transactions.weight  ← opening BUY events (all BUYs on a leg)
--
-- WHAT IT DOES NOT TOUCH
-- ----------------------
--   • holdings                 (current_weight already correct)
--   • holding_transactions     (already correct)
--   • Any non-weight column
--   • Closed / expired / exercised legs (trigger 030 already set their
--     leg_transactions.weight=0 on the close event; legs.weight stays
--     NULL, which holdingPnlPct() treats the same as 0 via the
--     `w == null` guard)
--
-- WEIGHT DERIVATION RULES
-- -----------------------
-- 1. Use host-stated per-leg weight when Discord messages give it
--    explicitly (IRDM "~4%" after 6/11 trim; ARKK "1%" on open).
-- 2. Fall back to host convention otherwise:
--      mixed position   → 90% shares / 10% split evenly across option legs
--      options-only     → even split across legs (typically 1 leg = 100%)
--      shares-only      → 100% on shares leg (or even split across lots)
-- 3. For multi-lot shares (AMKR, VIAV — original Dec lot + exercise-
--    spawned Mar lot): 50/50 split (fallback; no per-lot statement by host).
-- 4. Holding-level anchor = latest holding_transactions.weight for the
--    ticker (Section 1 of stw_backfill_2026.sql).
--
-- FALLBACK FLAGS (legs whose weight was NOT sourced from Discord):
--   [FALLBACK-50/50]  AMKR share lots, VIAV share lots
--   [FALLBACK-90/10]  AMZN, HOOD, MITK, FIVN, ADEA, SHLS
--   [FALLBACK-STATED] Everything else (anchor stated directly in S1)
--
-- IDEMPOTENCY
-- -----------
-- All statements are absolute-value UPDATEs. Safe to re-run; each
-- execution converges to the same state.
--
-- DO NOT EXECUTE IN SUPABASE WITHOUT REVIEW — manual import only.
-- ================================================================


-- ================================================================
-- SECTION A: SHARES-ONLY HOLDINGS
-- leg weight = 100% of the holding-level anchor weight
-- ================================================================

-- ENS — 20.0% (S1 Hold 3/23)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 20.0
WHERE ticker = 'ENS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 20.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'ENS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- OSS — 9.5% (S1 New 12/19)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 9.5
WHERE ticker = 'OSS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 9.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'OSS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- NBIS — 4.5% (S1 New 12/19)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 4.5
WHERE ticker = 'NBIS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 4.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'NBIS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- LEU — 7.5% (S1 New 12/19)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 7.5
WHERE ticker = 'LEU'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 7.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'LEU'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- TSLA — 2.5% (S1 New 12/19)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 2.5
WHERE ticker = 'TSLA'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 2.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'TSLA'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- SYNA — 8.5% (S1 Closed 3/20 @ 8.5%; $85C Mar 26 expired, shares unchanged)
-- Position is now shares-only. Note: S1 2/19 Upsized stated 8.3% for the
-- mixed (shares+option) total; after the option expired worthless the S1
-- 3/20 anchor is 8.5%. Using 8.5% as the operative shares-leg weight.
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 8.5
WHERE ticker = 'SYNA'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-01-14';

-- Two BUY events: initial open 1/14 @ $85.78 and upsize 2/19 @ $87.00
UPDATE public.leg_transactions SET weight = 8.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'SYNA'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-01-14'
  )
  AND action_type = 'BUY';

-- CTS — 4.0% (S1 New 4/1)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 4.0
WHERE ticker = 'CTS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-04-01';

UPDATE public.leg_transactions SET weight = 4.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'CTS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-04-01'
  )
  AND action_type = 'BUY';

-- BDC — 4.5% (S1 New 4/24)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 4.5
WHERE ticker = 'BDC'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-04-24';

UPDATE public.leg_transactions SET weight = 4.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'BDC'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-04-24'
  )
  AND action_type = 'BUY';

-- FPS — 4.0% (S1 New 4/24)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 4.0
WHERE ticker = 'FPS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-04-24';

UPDATE public.leg_transactions SET weight = 4.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'FPS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-04-24'
  )
  AND action_type = 'BUY';

-- VPG — 4.5% (S1 New 4/24; "Shares @ $53.16. Also holds calls.")
-- VPG calls are PENDING exercise (host noted 6/11 he will exercise ~6/12
-- or 6/20). The VPG option leg is NOT in stw_backfill_2026.sql (strike/
-- expiry unknown). Treating as shares-only until that leg is added.
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 4.5
WHERE ticker = 'VPG'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-04-24';

UPDATE public.leg_transactions SET weight = 4.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'VPG'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-04-24'
  )
  AND action_type = 'BUY';

-- TE — 6.0% (S1 New 6/11)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 6.0
WHERE ticker = 'TE'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 6.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'TE'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';

-- CXDO shares — 2.5% (S1 Upsized 6/11 @ 2.5%; both option legs closed 6/11)
-- Option legs ($10C Oct 16, opened 4/15 and 6/1) are CLOSED in backfill via
-- SELL events at weight=0. Shares leg carries full holding weight.
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 2.5
WHERE ticker = 'CXDO'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 2.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'CXDO'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';

-- CRNC shares — 2.5% (S1 Upsized 6/11 @ 2.5%; $10C Aug 21 closed 6/11)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 2.5
WHERE ticker = 'CRNC'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 2.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'CRNC'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';

-- GDYN shares — 2.5% (S1 Upsized 6/11 @ 2.5%; $7C Oct 16 closed 6/11)
-- [FALLBACK-STATED]
UPDATE public.legs SET weight = 2.5
WHERE ticker = 'GDYN'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 2.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'GDYN'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';


-- ================================================================
-- SECTION B: MULTI-LOT SHARES HOLDINGS (two open share legs each)
-- AMKR and VIAV each have: original Dec 2025 lot + exercise-spawned
-- Mar 2026 lot. Per the exercise model, the spawned lot is a separate
-- leg (parent_leg_id points to the exercised option). No per-lot
-- allocation was stated by host → 50/50 fallback.
-- ================================================================

-- AMKR — holding 13.0% (S1 Trimmed 3/27 @ 13%)
-- All AMKR option legs are CLOSED (AMKR $25C exercised 3/20;
-- AMKR $30C Jun sold 3/27). Two shares legs remain.
-- [FALLBACK-50/50] Lot entries: original $24.35 vs. exercise $27.50 ≈ 48%/52%
-- → using even split 6.5% each.

-- AMKR original lot (opened 12/19)
UPDATE public.legs SET weight = 6.5
WHERE ticker = 'AMKR'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 6.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'AMKR'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- AMKR exercise-spawned lot (opened 3/20; parent = AMKR $25C Mar 26)
UPDATE public.legs SET weight = 6.5
WHERE ticker = 'AMKR'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-03-20';

UPDATE public.leg_transactions SET weight = 6.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'AMKR'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-03-20'
  )
  AND action_type = 'BUY';

-- VIAV — holding 9.0% (S1 Hold 3/23 @ 9%)
-- VIAV $14C Mar 26 exercised 3/20. Two shares legs remain.
-- [FALLBACK-50/50] Lot entries: original $13.84 vs. exercise $15.20 ≈ 48%/52%
-- → using even split 4.5% each.

-- VIAV original lot (opened 12/19)
UPDATE public.legs SET weight = 4.5
WHERE ticker = 'VIAV'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 4.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'VIAV'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

-- VIAV exercise-spawned lot (opened 3/20; parent = VIAV $14C Mar 26)
UPDATE public.legs SET weight = 4.5
WHERE ticker = 'VIAV'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-03-20';

UPDATE public.leg_transactions SET weight = 4.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'VIAV'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-03-20'
  )
  AND action_type = 'BUY';


-- ================================================================
-- SECTION C: MIXED HOLDINGS (shares + option legs)
-- Per-leg split never explicitly stated by host → 90/10 fallback:
--   shares legs collectively get 90% of holding weight
--   option legs collectively get 10%, split evenly across them
-- ================================================================

-- ── AMZN — holding 2.5% (S1 New 12/19 @ 2.5%) ──
-- Legs: SHARES (opened 12/19) + AMZN $250C Jan 28 (opened 12/19)
-- 90/10 fallback: shares=2.25%, LEAPS=0.25%
-- [FALLBACK-90/10]

UPDATE public.legs SET weight = 2.25
WHERE ticker = 'AMZN'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 2.25
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'AMZN'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

UPDATE public.legs SET weight = 0.25
WHERE ticker = 'AMZN'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 250.00
  AND option_expiry = '2028-01-21';

UPDATE public.leg_transactions SET weight = 0.25
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'AMZN'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 250.00
      AND option_expiry = '2028-01-21'
  )
  AND action_type = 'BUY';

-- ── HOOD — holding 3.5% (S1 Upsized 4/1 @ 3.5%) ──
-- Legs: SHARES (opened 12/19 @ $19.74) + HOOD $80C Jun 19 26 (opened 4/1)
-- 90/10 fallback: shares=3.15%, $80C=0.35%
-- Note: $80C Jun 19 expires 2026-06-19 — 5 days out as of file creation.
-- [FALLBACK-90/10]

UPDATE public.legs SET weight = 3.15
WHERE ticker = 'HOOD'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2025-12-19';

UPDATE public.leg_transactions SET weight = 3.15
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'HOOD'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2025-12-19'
  )
  AND action_type = 'BUY';

UPDATE public.legs SET weight = 0.35
WHERE ticker = 'HOOD'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 80.00
  AND option_expiry = '2026-06-19';

UPDATE public.leg_transactions SET weight = 0.35
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'HOOD'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 80.00
      AND option_expiry = '2026-06-19'
  )
  AND action_type = 'BUY';

-- ── MITK — holding 4.7% (S1 Upsized 5/21 @ 4.7%) ──
-- Legs: SHARES (opened 2/25) + $12.5C Jul 17 (opened 2/25) + $12.5C Nov 20 (opened 4/1)
-- 90% to shares, 10% split evenly across 2 option legs (5% each)
-- [FALLBACK-90/10] shares=4.23%, each option leg=0.235%

UPDATE public.legs SET weight = 4.23
WHERE ticker = 'MITK'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-02-25';

UPDATE public.leg_transactions SET weight = 4.23
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'MITK'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-02-25'
  )
  AND action_type = 'BUY';

-- MITK $12.5C Jul 17 26 (opened 2/25)
UPDATE public.legs SET weight = 0.235
WHERE ticker = 'MITK'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 12.50
  AND option_expiry = '2026-07-17';

UPDATE public.leg_transactions SET weight = 0.235
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'MITK'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 12.50
      AND option_expiry = '2026-07-17'
  )
  AND action_type = 'BUY';

-- MITK $12.5C Nov 20 26 (opened 4/1; second BUY added at upsize 5/21)
UPDATE public.legs SET weight = 0.235
WHERE ticker = 'MITK'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 12.50
  AND option_expiry = '2026-11-20';

-- Updates both the initial 4/1 BUY and the 5/21 upsize BUY
UPDATE public.leg_transactions SET weight = 0.235
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'MITK'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 12.50
      AND option_expiry = '2026-11-20'
  )
  AND action_type = 'BUY';

-- ── FIVN — holding 7.0% (S1 Upsized 6/11 @ 7.0%) ──
-- Legs: SHARES (opened 6/11) + $22.5C Oct 16 (opened 4/28)
-- Note: $25C Oct 16 was CLOSED 6/11 (explicit SELL at weight=0 in backfill).
-- 90/10 fallback: shares=6.3%, $22.5C=0.7%
-- [FALLBACK-90/10]

UPDATE public.legs SET weight = 6.3
WHERE ticker = 'FIVN'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 6.3
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'FIVN'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';

UPDATE public.legs SET weight = 0.7
WHERE ticker = 'FIVN'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 22.50
  AND option_expiry = '2026-10-16';

UPDATE public.leg_transactions SET weight = 0.7
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'FIVN'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 22.50
      AND option_expiry = '2026-10-16'
  )
  AND action_type = 'BUY';

-- ── SHLS — holding 2.5% (S1 Upsized 6/11 @ 2.5%) ──
-- Legs: SHARES (opened 6/11) + $10C Oct 16 (opened 5/15 — see note below)
-- The $10C Oct 16 leg has NO explicit SELL event in the backfill even though
-- the host said shares were "replacing contracts" on 6/11. Leg is OPEN in DB
-- but economically replaced. Shares leg carries the full holding weight.
-- The option leg is explicitly zeroed in Section D below.
-- [FALLBACK-90/10 → effectively shares-only since option is de-facto closed]

UPDATE public.legs SET weight = 2.5
WHERE ticker = 'SHLS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-06-11';

UPDATE public.leg_transactions SET weight = 2.5
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'SHLS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-06-11'
  )
  AND action_type = 'BUY';

-- ── ADEA — holding 2.5% (S1 Upsized 6/1 @ 2.5%) ──
-- Legs: SHARES (opened 5/15, from June call conversion) +
--       $30C Sep 18 (opened 5/11, kept from original) +
--       $35C Sep 18 (opened 6/1, added as upsize)
-- Note: $30C Jun 19 (opened 5/11) CLOSED 5/15 (SELL at weight=0 in backfill).
-- 90% to shares, 10% split evenly across 2 remaining option legs (5% each)
-- [FALLBACK-90/10] shares=2.25%, each option leg=0.125%

UPDATE public.legs SET weight = 2.25
WHERE ticker = 'ADEA'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'SHARES'
  AND opened_at = '2026-05-15';

UPDATE public.leg_transactions SET weight = 2.25
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'ADEA'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'SHARES'
      AND opened_at = '2026-05-15'
  )
  AND action_type = 'BUY';

-- ADEA $30C Sep 18 26 (opened 5/11; kept in full size after June call conversion)
UPDATE public.legs SET weight = 0.125
WHERE ticker = 'ADEA'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 30.00
  AND option_expiry = '2026-09-18';

UPDATE public.leg_transactions SET weight = 0.125
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'ADEA'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 30.00
      AND option_expiry = '2026-09-18'
  )
  AND action_type = 'BUY';

-- ADEA $35C Sep 18 26 (opened 6/1 as upsize; "doubles weighting to 2.5%")
UPDATE public.legs SET weight = 0.125
WHERE ticker = 'ADEA'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 35.00
  AND option_expiry = '2026-09-18';

UPDATE public.leg_transactions SET weight = 0.125
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'ADEA'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 35.00
      AND option_expiry = '2026-09-18'
  )
  AND action_type = 'BUY';


-- ================================================================
-- SECTION D: OPTIONS-ONLY HOLDINGS
-- ================================================================

-- IRDM — 4.0% (S1 Trimmed 6/11 @ 4.0%; SELL event in backfill also
-- carries weight=4.0 confirming this is the remaining position size
-- after partial trim at +700% gain ahead of SpaceX IPO)
-- [FALLBACK-STATED — weight confirmed in both S1 and leg_transaction]

UPDATE public.legs SET weight = 4.0
WHERE ticker = 'IRDM'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 22.50
  AND option_expiry = '2026-07-17';

UPDATE public.leg_transactions SET weight = 4.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'IRDM'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 22.50
      AND option_expiry = '2026-07-17'
  )
  AND action_type = 'BUY';

-- ARKK — 1.0% (S1 New 6/11 @ 1%; portfolio hedge via $70P Jun 18 26)
-- [FALLBACK-STATED]

UPDATE public.legs SET weight = 1.0
WHERE ticker = 'ARKK'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 70.00
  AND option_expiry = '2026-06-18';

UPDATE public.leg_transactions SET weight = 1.0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'ARKK'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 70.00
      AND option_expiry = '2026-06-18'
  )
  AND action_type = 'BUY';


-- ================================================================
-- SECTION E: ZERO-WEIGHT DE-FACTO CLOSED LEGS
-- These legs are OPEN in the DB (no explicit SELL event in the
-- backfill) but their contracts were economically replaced by shares
-- on 6/11. Setting weight=0 ensures holdingPnlPct() skips them via
-- the `w === 0` guard and they don't distort the holding's P&L.
-- ================================================================

-- SHLS $10C Oct 16 26 (opened 5/15) — "replacing contracts" 6/11
-- No SELL event in backfill. Zeroed here to prevent stale option P&L
-- from polluting the SHLS holding's weight-averaged return.
UPDATE public.legs SET weight = 0
WHERE ticker = 'SHLS'
  AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND instrument_type = 'OPTION'
  AND option_strike = 10.00
  AND option_expiry = '2026-10-16';

UPDATE public.leg_transactions SET weight = 0
WHERE leg_id = (
    SELECT id FROM public.legs
    WHERE ticker = 'SHLS'
      AND trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
      AND instrument_type = 'OPTION'
      AND option_strike = 10.00
      AND option_expiry = '2026-10-16'
  )
  AND action_type = 'BUY';


-- ================================================================
-- VALIDATION QUERIES (run these after applying the file to confirm
-- acceptance criteria are met)
-- ================================================================

-- 1. Every OPEN leg should now have weight > 0
--    (returns rows if any OPEN leg still has NULL or 0 weight)
/*
SELECT ticker, instrument_type, option_strike, option_expiry, opened_at, weight
FROM public.legs
WHERE trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND status = 'OPEN'
  AND (weight IS NULL OR weight = 0)
ORDER BY ticker;
*/

-- 2. Multi-leg holdings: weights should sum to ≈ holding weight
--    (check AMKR, VIAV, ADEA, MITK, FIVN, HOOD, AMZN)
/*
SELECT l.ticker, SUM(l.weight) AS total_leg_weight
FROM public.legs l
WHERE l.trader_id = (SELECT id FROM public.traders WHERE name = 'STW')
  AND l.status = 'OPEN'
  AND l.ticker IN ('AMKR','VIAV','ADEA','MITK','FIVN','HOOD','AMZN')
GROUP BY l.ticker
ORDER BY l.ticker;
*/

-- 3. ADEA sanity: holdingPnlPct should return a value (not null)
--    Requires a live or mark price to resolve legUnrealizedPnlPct.

-- ================================================================
-- WEIGHT SUMMARY (as of 2026-06-12)
-- ================================================================
/*
HOLDING  LEG                                 WEIGHT   SOURCE
-------- ----------------------------------- -------- ---------
ENS      Shares (Dec)                        20.00    stated
AMKR     Shares (Dec)                         6.50    fallback-50/50
AMKR     Shares (Mar exercise)                6.50    fallback-50/50
VIAV     Shares (Dec)                         4.50    fallback-50/50
VIAV     Shares (Mar exercise)                4.50    fallback-50/50
OSS      Shares (Dec)                         9.50    stated
NBIS     Shares (Dec)                         4.50    stated
LEU      Shares (Dec)                         7.50    stated
HOOD     Shares (Dec)                         3.15    fallback-90/10
HOOD     $80C Jun 19 26                       0.35    fallback-90/10
TSLA     Shares (Dec)                         2.50    stated
AMZN     Shares (Dec)                         2.25    fallback-90/10
AMZN     $250C Jan 28 27 (LEAPS)              0.25    fallback-90/10
SYNA     Shares (Jan)                         8.50    stated (3/20 post-expiry)
IRDM     $22.5C Jul 17 26                     4.00    stated (6/11 trim)
MITK     Shares (Feb)                         4.23    fallback-90/10
MITK     $12.5C Jul 17 26                     0.235   fallback-90/10
MITK     $12.5C Nov 20 26                     0.235   fallback-90/10
CTS      Shares (Apr)                         4.00    stated
BDC      Shares (Apr)                         4.50    stated
FPS      Shares (Apr)                         4.00    stated
VPG      Shares (Apr)                         4.50    stated (calls TBD)
FIVN     Shares (Jun)                         6.30    fallback-90/10
FIVN     $22.5C Oct 16 26                     0.70    fallback-90/10
ADEA     Shares (May, ex-June calls)          2.25    fallback-90/10
ADEA     $30C Sep 18 26                       0.125   fallback-90/10
ADEA     $35C Sep 18 26                       0.125   fallback-90/10
SHLS     Shares (Jun)                         2.50    stated (option replaced)
SHLS     $10C Oct 16 26 [OPEN in DB]          0.00    de-facto replaced 6/11
CXDO     Shares (Jun)                         2.50    stated (options closed)
CRNC     Shares (Jun)                         2.50    stated (options closed)
GDYN     Shares (Jun)                         2.50    stated (options closed)
TE       Shares (Jun)                         6.00    stated
ARKK     $70P Jun 18 26                       1.00    stated

CLOSED / EXERCISED / EXCLUDED (weight unchanged from backfill = 0 or NULL):
HII      Shares (both lots)                   —       CLOSED 6/1
AMKR     $25C Mar 26                          —       EXERCISED 3/20
AMKR     $30C Jun 19                          —       CLOSED 3/27
VIAV     $14C Mar 26                          —       EXERCISED 3/20
HII      $285C Mar 26                         —       EXERCISED 3/20
ADEA     $30C Jun 19                          —       CLOSED 5/15
FIVN     $25C Oct 16                          —       CLOSED 6/11
CXDO     $10C Oct 16 (both legs)              —       CLOSED 6/11
CRNC     $10C Aug 21                          —       CLOSED 6/11
GDYN     $7C Oct 16                           —       CLOSED 6/11
AMRC     option leg                           —       OMITTED from backfill (strike unknown)
*/
