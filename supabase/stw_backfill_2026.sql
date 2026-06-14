-- ================================================================
-- STW Portfolio Backfill — 2025-12-19 through 2026-06-12
-- ================================================================
-- DO NOT EXECUTE BLIND — apply on the Supabase PREVIEW BRANCH first, review, then prod.
-- ================================================================
-- Source:  Discord STW Updates (files 202512 through 202606)
-- Schema:  migrations 022–033 + 036 deployed (v4 SIZE-LESS, %-P&L multi-leg model).
--          NOT the original size-based 029/030 — see the rewrite notes below.
-- Trader:  STW (always resolved via subquery, never hardcoded UUID)
--
-- ── WHAT CHANGED FROM THE FIRST DRAFT (size-based → size-less %-model) ──
--   • legs/leg_transactions have NO share/contract counts. Dropped `current_size`,
--     `multiplier`, `avg_cost_basis`, `quantity`, `net_amount`. The only sizing signal
--     is per-leg `weight` (% of portfolio); P&L is a PERCENTAGE the trigger derives.
--   • legs no longer carry status/entry/opened state directly — the 030 trigger derives
--     entry_price/status/opened_at/exit_price/realized_pnl_pct/closed_at/close_reason from
--     the leg's events. We insert only the leg SHELL (instrument + option fields + a
--     disambiguating opened_at) and then its events.
--   • Option columns renamed: strike_price→option_strike, expiration_date→option_expiry.
--   • EXERCISE now SPAWNS a new SHARES leg (parent_leg_id, entry = strike + premium) — it
--     does NOT blend into the existing shares lot. The option leg goes EXERCISED / realized null.
--   • close_reason rides the closing leg_transaction (full-exit reasons only:
--     PROFIT_TARGET/STOP_HIT/THESIS_BROKEN/TRAIL_STOP/EXPIRED_WORTHLESS/EXERCISED, or NULL).
--     Trim-only reasons (PARTIAL_PROFIT/RISK_REDUCTION) ride the TRIM txn, never a closed leg.
--
-- ── PER-LEG WEIGHT POLICY (decided 2026-06-14: leave NULL where unstated) ──
--   • Open BUYs: weight = NULL (per-leg sizing is not stated in source; fill manually later).
--     ⇒ holdings' weighted-avg P&L (holdingPnlPct) is INCOMPLETE until these are filled.
--     Holding-level weight IS captured — in Section 1 (holding_transactions.weight → drives
--     holdings.current_weight via trigger 031).
--   • Closing SELL / EXPIRED / EXERCISED: weight = 0 (a STATE signal the trigger needs).
--   • Partial trims: the stated post-event HOLDING weight (from Section 1) — only AVAV/ENS/
--     AMKR/IRDM trims; needed so weight > 0 keeps the leg OPEN.
--
-- IMPORT ORDER — execute each section in sequence:
--   0. HOLDINGS              identity rows (FK target; trigger 031 only UPDATEs, never inserts)
--   1. HOLDING_TRANSACTIONS  (trigger 031 sets holdings last_action/action_date/current_weight)
--   2. LEGS                  (leg shells — trigger derives state from §3)
--   3. LEG_TRANSACTIONS      (trigger 030 derives each leg's entry/status/exit/realized %)
--
-- FLAGS:
--   • [EST] = approximated from context (date/price/strike not explicit in source).
--   • AMRC option strike is UNKNOWN — the size-less legs check constraint forbids a NULL
--     strike on an OPTION leg, so AMRC's leg + leg_transactions are COMMENTED OUT below
--     pending a real strike. Its holding_transactions (New→Closed) still import.
--   • Section 0 column set is defensive — confirm holdings' NOT NULL columns on the preview
--     branch; a failed identity insert there is harmless and reveals any missing column.
-- ================================================================


-- ================================================================
-- SECTION 0: HOLDINGS — identity rows (idempotent)
-- Creates a holdings row for every backfilled ticker so the legs FK resolves and trigger
-- 031 has a row to update. ON CONFLICT DO NOTHING preserves existing (currently-held) rows
-- and their thesis/category data; only missing (historical/closed) tickers get a bare row.
-- The real last_action/weight come from Section 1 via trigger 031.
-- ================================================================

INSERT INTO holdings (ticker, trader_id, current_weight, initial_weight, last_action)
SELECT t.ticker, (SELECT id FROM public.traders WHERE name='STW'), 0, 0, 'New'
FROM (VALUES
  ('ENS'),('PLPC'),('AMKR'),('VIAV'),('OSS'),('NBIS'),('THR'),('LEU'),('HII'),('KTOS'),
  ('HOOD'),('TSLA'),('AMZN'),('DPRO'),('AVAV'),('SYNA'),('GLDD'),('PANL'),('SQQQ'),('GME'),
  ('ITRI'),('MITK'),('IRDM'),('CTS'),('LUMN'),('CXDO'),('FIVN'),('BDC'),('AMSC'),('FPS'),
  ('RDCM'),('VPG'),('P'),('GDYN'),('VLN'),('BB'),('ADEA'),('AMRC'),('SHLS'),('BLDP'),
  ('CRNC'),('ARRY'),('ARKK'),('TE')
) AS t(ticker)
ON CONFLICT (ticker, trader_id) DO NOTHING;


-- ================================================================
-- SECTION 1: HOLDING_TRANSACTIONS
-- (One row per ticker per action event, chronological. Schema-compatible as-is; trigger
--  031 propagates last_action/action_date/current_weight to holdings. Optionally add
--  on_conflict=ticker,trader_id,action,event_date when applying via PostgREST.)
-- ================================================================

-- ── DEC 2025 BASELINE (portfolio snapshot 2025-12-19) ──────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 20.5,
   'Power Grid/Batteries basket. Shares ~$116.63 + $115C Mar 26. Core position.'),
  ('PLPC', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 4.5,
   'Shares only @ $192.16.'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 17.0,
   'Semiconductor. Shares @ $24.35 + $25C Mar 26 + $30C Jun 26.'),
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 8.5,
   'Shares @ $13.84 + $14C Mar 26.'),
  ('OSS',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 9.5,
   'Shares only @ $4.71.'),
  ('NBIS', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 4.5,
   'Shares only @ $23.92. Held since prior year.'),
  ('THR',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 2.5,
   'Shares only @ $36.59.'),
  ('LEU',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 7.5,
   'Shares only @ $96.94.'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 6.5,
   'Shares @ $236.40 + ITM calls Mar 26 (strike ~$285 [EST]).'),
  ('KTOS', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 4.5,
   'Shares @ $22.34 + $35C Jan 27 + $40C Jan 27.'),
  ('HOOD', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 2.5,
   'Shares only @ $19.74.'),
  ('TSLA', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 2.5,
   'Shares only @ $19.38.'),
  ('AMZN', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 2.5,
   'Shares @ $88.93 + $250C Jan 28 (LEAPS).'),
  ('DPRO', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 1.5,
   'New position 12/19. Shares only @ $6.50.'),
  ('AVAV', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2025-12-19', 0.7,
   'Lotto: $245C Jan 09 26 @ $9.60. 0.7% weighting.');

-- ── JAN 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('AVAV', (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-01-05', 0.1,
   'Sold majority of $245C position. Up +500% ($9.60 → ~$55). Kept small remainder.'),
  ('DPRO', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-01-12', 0.0,
   'Full exit. +53% from $6.50 entry.'),
  ('AVAV', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-01-13', 0.0,
   'Closed remaining AVAV calls. [EST — sold remainder shortly after majority trim]'),
  ('SYNA', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-01-14', 6.0,
   'New position. Shares @ $85.78 + $85C Mar 26.'),
  ('GLDD', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-01-15', 4.5,
   'New position. Shares @ $13.95 + $12.5C Mar 26 @ $1.75 avg.'),
  ('PANL', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-01-22', 4.0,
   'Greenland basket. Shares @ $7.23 + small $7.5C May 26.');

-- ── FEB 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('GLDD', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-02-12', 0.0,
   'Buyout/acquisition announced. Closed position.'),
  ('SQQQ', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-02-13', 1.5,
   'Hedge: $75C Mar 20 26 @ $5.95.'),
  ('GME',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-02-13', 0.4,
   'Lotto: $24C Mar 20 26 @ $1.80.'),
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-02-13', 18.0,
   'Indiscriminate options trim — sold long option legs across book. Cash raised ~9%.'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-02-13', 15.0,
   'Indiscriminate options trim — partial reduction in options exposure.'),
  ('SYNA', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-02-19', 8.3,
   'Added shares at market. Weight 7.3% → 8.3%. Blended CB $85.78 → $86.14.'),
  ('ITRI', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-02-20', 5.5,
   'New position. Shares only @ $99.10.'),
  ('MITK', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-02-25', 5.5,
   'New position. Shares @ $13.28 + $12.5C Jul 17 26 @ $1.77 avg.'),
  ('THR',  (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-02-26', 0.0,
   'Full exit. +50% from $36.59. Merger with CECO announced 2/24.'),
  ('IRDM', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-02-27', 1.5,
   'Options-only position. $22.5C Jul 17 26 @ $3.35 avg.');

-- ── MAR 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('PANL', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-03-13', 0.0,
   'Full exit. Shipping/fuel concern on Greenland thesis.'),
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-03-13', 17.0,
   'Indiscriminate options trim — $115C Mar 26 sold. Options ratio brought to ~6%.'),
  ('SQQQ', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-03-20', 0.0,
   '$75C Mar 20 expired worthless.'),
  ('GME',  (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-03-20', 0.0,
   '$24C Mar 20 expired worthless.'),
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-03-20', 9.0,
   '$14C Mar 26 exercised. New shares added at strike. Blended CB → $14.63.'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-03-20', 16.0,
   '$25C Mar 26 exercised. New shares at strike. Blended CB → $26.35.'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-03-20', 7.5,
   'ITM calls Mar 26 exercised. New shares added. Blended CB → $292.94.'),
  ('SYNA', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-03-20', 8.5,
   '$85C Mar 26 expired worthless. Shares position unchanged.'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-03-27', 13.0,
   '$30C Jun 26 trimmed/sold as part of broader options reduction. Options to ~2%.'),
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'Hold', '2026-03-23', 20.0,
   'Portfolio update 3/23 — 16 positions, 97:3 equity:options ratio. ENS held.'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'Hold', '2026-03-23', 16.0,
   'Portfolio update 3/23. Cash -4.3%.'),
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'Hold', '2026-03-23', 9.0,
   'Portfolio update 3/23.');

-- ── APR 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('CTS',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-01', 4.0,
   '[EST] Not marked NEW on 4/24 update → opened between 3/27 and 4/24. Shares @ $51.26.'),
  ('LUMN', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-01', 4.0,
   '[EST] Not marked NEW on 4/24 update → opened between 3/27 and 4/24. Options only: $8C Jul 26 + $7C Jan 27 + small $8C May 26.'),
  ('HOOD', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-04-01', 3.5,
   '[EST] Added $80C Jun 19 26 — appeared in 4/24 portfolio but not in 1/16 update.'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-15', 2.0,
   '[EST] Upsized to 3.9% on 6/1; 6/11 add replaced contracts → opened prior to 4/24. Options position.'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-28', 3.0,
   '[EST] $22.5C Oct 16 26. Was already a significant position by 5/28 when upsized to 6%.'),
  ('BDC',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 4.5,
   'NEW this week per 4/24 portfolio update. Shares @ $125.85.'),
  ('AMSC', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 4.0,
   'NEW this week per 4/24 portfolio update. Shares @ $41.22.'),
  ('FPS',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 4.0,
   'NEW this week per 4/24 portfolio update. Shares @ $34.31.'),
  ('RDCM', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 3.5,
   'NEW this week per 4/24 portfolio update. Shares @ $12.91.'),
  ('VPG',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 4.5,
   'NEW this week per 4/24 portfolio update. Shares @ $53.16. Also holds calls.'),
  ('P',    (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-24', 0.5,
   'New position: $75C Aug 21 26 @ $8.80. 0.5% initial weight.'),
  ('GDYN', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-28', 3.0,
   '[EST] Calls opened prior to 5/28 when 6/11 add was described as ''replacing contracts''.'),
  ('ITRI', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-04-28', 0.0,
   'Full exit after weak earnings guide. Thesis not progressing.'),
  ('VLN',  (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-04-30', 5.5,
   'New position. Shares only @ $1.57.'),
  ('P',    (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-04-30', 1.0,
   'Raised from 0.5% → 1.0% same $75C Aug 26 contracts. Added more contracts.');

-- ── MAY 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('BB',   (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-06', 1.5,
   'Swing trade. $6C Sep 18 26 @ $0.87. Alerted on May 6th per 5/29 message.'),
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-11', 1.25,
   'Original thesis posted 5/11. June $30C (later converted) + Sept $30C.'),
  ('AMRC', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-15', 2.0,
   '[EST] Mentioned as portfolio stock by 5/26; closed 6/5. Options entry.'),
  ('SHLS', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-15', 2.0,
   'New position. $10C Oct 16 26 @ $1.95.'),
  ('BLDP', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-15', 3.0,
   'New position. $4C Aug 21 26 @ $0.90 + $5C Aug 21 26 @ $0.60. 3% total.'),
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-05-15', 1.25,
   'Converted June calls into shares @ $30.10 (very small lot). Kept Sept $30C in full size.'),
  ('CRNC', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-05-22', 1.5,
   'New position. $10C Aug 21 26 @ $1.85 avg.'),
  ('MITK', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-05-21', 4.7,
   'Added more Nov $12.5C. Weight 2.9% → 4.7%. CB on Nov contracts $3.70 → $3.77.'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-05-28', 6.0,
   'Added $25C Oct 16 26 @ $3.70. Kept existing $22.5C Oct in full size. Weight → 6%.'),
  ('P',    (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-05-28', 0.0,
   'Fully closed $75C Aug 26. Thesis broken after earnings.');

-- ── JUN 2026 ───────────────────────────────────────────────────

INSERT INTO holding_transactions (ticker, trader_id, action, event_date, weight, notes)
VALUES
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-01', 2.5,
   'Added $35C Sep 18 26 @ $2.74 avg. Doubles weighting to 2.5%.'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-01', 3.9,
   'Added $10C Oct 16 26 @ $2.24 avg. Completed fill over Friday–Monday.'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-01', 0.0,
   'Full exit. Portfolio management / buying power.'),
  ('PLPC', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-03', 0.0,
   'Full exit. Doubled+ from $192.16 entry. Valuation stretched.'),
  ('KTOS', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-03', 0.0,
   'Full exit. Tripled+ from $22.34 entry.'),
  ('ARRY', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-06-04', 1.5,
   'Tactical solar trade. $9C Aug 21 26 @ $1.54.'),
  ('RDCM', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-05', 0.0,
   'Full exit. Position management / capital preservation.'),
  ('VLN',  (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-05', 0.0,
   'Full exit. Position management / capital preservation.'),
  ('AMSC', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-05', 0.0,
   'Full exit. Position management / capital preservation.'),
  ('AMRC', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-05', 0.0,
   'Full exit. Position management / capital preservation.'),
  ('BB',   (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-10', 0.0,
   'Full exit. +300% from $0.87 entry on $6C Sep 26.'),
  ('IRDM', (SELECT id FROM public.traders WHERE name='STW'), 'Trimmed', '2026-06-11', 4.0,
   'De-risked ahead of SpaceX IPO. Calls up +700%. Trimmed to ~4%.'),
  ('LUMN', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-11', 0.0,
   'Full exit. High debt, rate path concern. Closed all option legs.'),
  ('BLDP', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-11', 0.0,
   'Full exit. Chart breaking down.'),
  ('ARRY', (SELECT id FROM public.traders WHERE name='STW'), 'Closed', '2026-06-11', 0.0,
   'Full exit. Took a loss.'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-11', 7.0,
   'Added shares @ $20.48 avg. Replaced $25C Oct (closed that leg). Kept $22.5C Oct.'),
  ('SHLS', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-11', 2.5,
   'Added shares @ $9.41 avg, 2.5% weight. Replacing contracts.'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-11', 2.5,
   'Added shares @ $6.93 avg, 2.5% weight. Replacing contracts.'),
  ('CRNC', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-11', 2.5,
   'Added shares @ $9.98 avg, 2.5% weight. Replacing contracts.'),
  ('GDYN', (SELECT id FROM public.traders WHERE name='STW'), 'Upsized', '2026-06-11', 2.5,
   'Added shares @ $6.34 avg, 2.5% weight. Replacing contracts.'),
  ('ARKK', (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-06-11', 1.0,
   'Hedge. $70P Jun 18 26 @ $0.83. Portfolio hedge play.'),
  ('TE',   (SELECT id FROM public.traders WHERE name='STW'), 'New', '2026-06-11', 6.0,
   'New position. Shares @ $7.87. 6% weighting.');


-- ================================================================
-- SECTION 2: LEGS — leg shells only
-- (ticker, trader_id, instrument_type[, option fields], weight, opened_at[, parent_leg_id])
-- entry_price/status/exit/realized/closed_at/close_reason are DERIVED by trigger 030 from
-- Section 3 events. weight = NULL (per-leg sizing unstated). opened_at is kept purely to
-- disambiguate multiple legs of the same ticker+type in the §3 leg_id subqueries (the
-- trigger preserves a provided opened_at via coalesce).
-- ================================================================

-- ── DEC 2025 BASELINE — SHARES LEGS ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('PLPC', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('OSS',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('NBIS', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('THR',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('LEU',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('KTOS', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('HOOD', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('TSLA', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('AMZN', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19'),
  ('DPRO', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2025-12-19');

-- ── DEC 2025 BASELINE — OPTION LEGS ──
INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('AVAV', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 245.00, '2026-01-16', NULL, '2025-12-19'),
  ('ENS',  (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 115.00, '2026-03-20', NULL, '2025-12-19'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 25.00,  '2026-03-20', NULL, '2025-12-19'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 30.00,  '2026-06-19', NULL, '2025-12-19'),
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 14.00,  '2026-03-20', NULL, '2025-12-19'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 285.00, '2026-03-20', NULL, '2025-12-19'),  -- strike ~$285 [EST]
  ('KTOS', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 35.00,  '2027-01-15', NULL, '2025-12-19'),
  ('KTOS', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 40.00,  '2027-01-15', NULL, '2025-12-19'),
  ('AMZN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 250.00, '2028-01-21', NULL, '2025-12-19');

-- ── EXERCISE-SPAWNED SHARES LEGS (3/20 exercises → new lots at strike + premium) ──
-- parent_leg_id points back to the exercised option leg; opened_at = exercise date.
INSERT INTO legs (ticker, trader_id, instrument_type, parent_leg_id, weight, opened_at)
VALUES
  ('VIAV', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES',
   (SELECT id FROM public.legs WHERE ticker='VIAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=14.00 AND option_expiry='2026-03-20'),
   NULL, '2026-03-20'),
  ('AMKR', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES',
   (SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=25.00 AND option_expiry='2026-03-20'),
   NULL, '2026-03-20'),
  ('HII',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES',
   (SELECT id FROM public.legs WHERE ticker='HII' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=285.00 AND option_expiry='2026-03-20'),
   NULL, '2026-03-20');

-- ── JAN 2026 — NEW POSITIONS ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('SYNA', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-01-14'),
  ('GLDD', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-01-15'),
  ('PANL', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-01-22');

INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('SYNA', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 85.00,  '2026-03-20', NULL, '2026-01-14'),
  ('GLDD', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 12.50,  '2026-03-20', NULL, '2026-01-15'),
  ('PANL', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 7.50,   '2026-05-15', NULL, '2026-01-22');

-- ── FEB 2026 — NEW POSITIONS ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('ITRI', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-02-20'),
  ('MITK', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-02-25');

INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('SQQQ', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 75.00,  '2026-03-20', NULL, '2026-02-13'),
  ('GME',  (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 24.00,  '2026-03-20', NULL, '2026-02-13'),
  ('MITK', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 12.50,  '2026-07-17', NULL, '2026-02-25'),
  ('IRDM', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 22.50,  '2026-07-17', NULL, '2026-02-27');

-- ── APR 2026 — NEW POSITIONS ([EST] dates) ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('CTS',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-01'),
  ('BDC',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-24'),
  ('AMSC', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-24'),
  ('FPS',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-24'),
  ('RDCM', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-24'),
  ('VPG',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-24'),
  ('VLN',  (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-04-30');

INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('LUMN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 8.00,   '2026-07-17', NULL, '2026-04-01'),
  ('LUMN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 7.00,   '2027-01-15', NULL, '2026-04-01'),
  ('LUMN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 8.00,   '2026-05-15', NULL, '2026-04-01'),
  ('HOOD', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 80.00,  '2026-06-19', NULL, '2026-04-01'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 10.00,  '2026-10-16', NULL, '2026-04-15'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 22.50,  '2026-10-16', NULL, '2026-04-28'),
  ('GDYN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 7.00,   '2026-10-16', NULL, '2026-04-28'),  -- strike [EST]
  ('P',    (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 75.00,  '2026-08-21', NULL, '2026-04-24'),
  ('MITK', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 12.50,  '2026-11-20', NULL, '2026-04-01');

-- ── MAY 2026 — NEW POSITIONS ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-05-15');  -- converted from June calls @ $30.10

INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('BB',   (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 6.00,   '2026-09-18', NULL, '2026-05-06'),
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 30.00,  '2026-06-19', NULL, '2026-05-11'),
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 30.00,  '2026-09-18', NULL, '2026-05-11'),
  ('ADEA', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 35.00,  '2026-09-18', NULL, '2026-06-01'),
  ('SHLS', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 10.00,  '2026-10-16', NULL, '2026-05-15'),
  ('BLDP', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 4.00,   '2026-08-21', NULL, '2026-05-15'),
  ('BLDP', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 5.00,   '2026-08-21', NULL, '2026-05-15'),
  ('CRNC', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 10.00,  '2026-08-21', NULL, '2026-05-22'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 25.00,  '2026-10-16', NULL, '2026-05-28');
-- AMRC option leg OMITTED — strike unknown ([EST]); size-less legs check forbids NULL strike.
-- TODO: add real strike, then uncomment:
--   ('AMRC', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', <STRIKE>, '2026-09-18', NULL, '2026-05-15');

-- ── JUN 2026 — NEW POSITIONS / SHARE ADDITIONS ──
INSERT INTO legs (ticker, trader_id, instrument_type, weight, opened_at)
VALUES
  ('TE',   (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11'),
  ('FIVN', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11'),
  ('SHLS', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11'),
  ('CRNC', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11'),
  ('GDYN', (SELECT id FROM public.traders WHERE name='STW'), 'SHARES', NULL, '2026-06-11');

INSERT INTO legs (ticker, trader_id, instrument_type, option_right, option_strike, option_expiry, weight, opened_at)
VALUES
  ('ARRY', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 9.00,   '2026-08-21', NULL, '2026-06-04'),
  ('CXDO', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'CALL', 10.00,  '2026-10-16', NULL, '2026-06-01'),
  ('ARKK', (SELECT id FROM public.traders WHERE name='STW'), 'OPTION', 'PUT',  70.00,  '2026-06-18', NULL, '2026-06-11');


-- ================================================================
-- SECTION 3: LEG_TRANSACTIONS — events
-- (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
-- Trigger 030 derives each leg's entry/weight/status/exit/realized% from these.
-- weight: NULL on opens, 0 on full close / expire / exercise, stated holding weight on trims.
-- ================================================================

-- ── DEC 2025 BASELINE — OPENING BUYs (shares) ──
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ENS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 116.63, NULL, NULL, '2025-12-19', 'Baseline entry — Power Grid/Batteries basket'),
  ((SELECT id FROM public.legs WHERE ticker='PLPC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 192.16, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 24.35, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='VIAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 13.84, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='OSS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 4.71, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='NBIS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 23.92, NULL, NULL, '2025-12-19', 'Baseline entry — held since prior year'),
  ((SELECT id FROM public.legs WHERE ticker='THR'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 36.59, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='LEU'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 96.94, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 236.40, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 22.34, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='HOOD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 19.74, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='TSLA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 19.38, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='AMZN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 88.93, NULL, NULL, '2025-12-19', 'Baseline entry'),
  ((SELECT id FROM public.legs WHERE ticker='DPRO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 6.50, NULL, NULL, '2025-12-19', 'New 12/19 — small speculative position');

-- ── DEC 2025 BASELINE — OPTION opening BUYs ──
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='AVAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=245.00),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 9.60, NULL, NULL, '2025-12-19', 'Lotto $245C Jan 26 @ $9.60, 0.7% weight'),
  ((SELECT id FROM public.legs WHERE ticker='ENS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=115.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.50, NULL, NULL, '2025-12-19', '[EST cost basis] ENS $115C Mar 26 — part of original position'),
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=25.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.50, NULL, NULL, '2025-12-19', '[EST cost basis] AMKR $25C Mar 26'),
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.00, NULL, NULL, '2025-12-19', '[EST cost basis] AMKR $30C Jun 26'),
  ((SELECT id FROM public.legs WHERE ticker='VIAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=14.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.20, NULL, NULL, '2025-12-19', '[EST cost basis] VIAV $14C Mar 26'),
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=285.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 8.00, NULL, NULL, '2025-12-19', '[EST cost basis and strike] HII calls Mar 26'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=35.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.00, NULL, NULL, '2025-12-19', '[EST cost basis] KTOS $35C Jan 27'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=40.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.00, NULL, NULL, '2025-12-19', '[EST cost basis] KTOS $40C Jan 27'),
  ((SELECT id FROM public.legs WHERE ticker='AMZN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=250.00 AND option_expiry='2028-01-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 5.00, NULL, NULL, '2025-12-19', '[EST cost basis] AMZN $250C Jan 28 LEAPS');

-- ── JAN 2026 ──
-- 1/5: AVAV majority sell (trim, kept 1 contract) → weight 0.1 keeps leg OPEN
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='AVAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=245.00),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 55.00, 0.1, 'PARTIAL_PROFIT', '2026-01-05', 'Sold majority — up +500% from $9.60. Kept remainder.');
-- 1/12: DPRO full close (+53%)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='DPRO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 9.95, 0, 'PROFIT_TARGET', '2026-01-12', 'Full exit. +53% from $6.50 entry.');
-- 1/13: AVAV remainder closed [EST]
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='AVAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=245.00),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 50.00, 0, 'PROFIT_TARGET', '2026-01-13', '[EST] Closed remaining contract.');
-- 1/14: SYNA new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='SYNA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-14'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 85.78, NULL, NULL, '2026-01-14', 'New position — 6% weight'),
  ((SELECT id FROM public.legs WHERE ticker='SYNA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=85.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.00, NULL, NULL, '2026-01-14', '[EST cost basis] SYNA $85C Mar 26 — part of initial position');
-- 1/15: GLDD new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='GLDD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 13.95, NULL, NULL, '2026-01-15', 'New position — 4.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='GLDD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=12.50 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.75, NULL, NULL, '2026-01-15', 'GLDD $12.5C Mar 26 @ $1.75 avg');
-- 1/22: PANL new position (Greenland basket)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='PANL' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-22'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 7.23, NULL, NULL, '2026-01-22', 'Greenland basket — 4% weight'),
  ((SELECT id FROM public.legs WHERE ticker='PANL' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.50 AND option_expiry='2026-05-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.60, NULL, NULL, '2026-01-22', 'Small $7.5C May 26 position — [EST cost basis]');

-- ── FEB 2026 ──
-- 2/12: GLDD closed (acquisition)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='GLDD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 18.00, 0, 'PROFIT_TARGET', '2026-02-12', '[EST exit price] GLDD acquired — full exit'),
  ((SELECT id FROM public.legs WHERE ticker='GLDD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=12.50 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 5.50, 0, 'PROFIT_TARGET', '2026-02-12', '[EST exit price] GLDD $12.5C closed with acquisition');
-- 2/13: New hedge/lotto positions
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='SQQQ' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=75.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 5.95, NULL, NULL, '2026-02-13', 'Hedge: SQQQ $75C Mar 20 @ $5.95 — 1.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='GME'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=24.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.80, NULL, NULL, '2026-02-13', 'Lotto: GME $24C Mar 20 @ $1.80 — 0.4% weight');
-- 2/13: Indiscriminate options trim (partial reduces; legs stay OPEN → weight = holding wt)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ENS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=115.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 8.00, 18.0, 'PARTIAL_PROFIT', '2026-02-13', '[EST] Indiscriminate options trim — partial reduce'),
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.50, 15.0, 'RISK_REDUCTION', '2026-02-13', '[EST] Indiscriminate options trim — partial reduce');
-- 2/19: SYNA upsize (blends CB; leg stays OPEN, weight unstated per-leg → NULL)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='SYNA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-14'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 87.00, NULL, NULL, '2026-02-19', 'Upsize — weight 7.3% → 8.3%. Blended CB $85.78 → $86.14');
-- 2/20: ITRI new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ITRI' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-02-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 99.10, NULL, NULL, '2026-02-20', 'New position — 5.5% weight');
-- 2/25: MITK new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='MITK' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-02-25'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 13.28, NULL, NULL, '2026-02-25', 'New position — 5.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='MITK' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=12.50 AND option_expiry='2026-07-17'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.77, NULL, NULL, '2026-02-25', 'MITK $12.5C Jul 17 26 @ $1.77 avg');
-- 2/26: THR full close (+50%)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='THR'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 54.89, 0, 'PROFIT_TARGET', '2026-02-26', 'Full exit. +50% from $36.59. CECO merger announcement.');
-- 2/27: IRDM new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='IRDM' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=22.50 AND option_expiry='2026-07-17'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.35, NULL, NULL, '2026-02-27', 'IRDM $22.5C Jul 17 26 @ $3.35 avg — 1.5% weight');

-- ── MAR 2026 ──
-- 3/13: PANL full close (thesis broken)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='PANL' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-01-22'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 7.23, 0, 'THESIS_BROKEN', '2026-03-13', '[EST exit near entry] Full exit — shipping/fuel concern'),
  ((SELECT id FROM public.legs WHERE ticker='PANL' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.50 AND option_expiry='2026-05-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 0.30, 0, 'THESIS_BROKEN', '2026-03-13', '[EST] Small $7.5C May 26 closed with position');
-- 3/13: ENS $115C remaining sold (close of the trimmed leg)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ENS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=115.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 6.00, 0, 'PROFIT_TARGET', '2026-03-13', 'Indiscriminate options trim 3/13 — sold remaining ENS $115C');
-- 3/20: Expirations (SQQQ, GME, SYNA $85C)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='SQQQ' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=75.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXPIRED', 0.00, 0, 'EXPIRED_WORTHLESS', '2026-03-20', 'SQQQ $75C Mar 20 expired worthless'),
  ((SELECT id FROM public.legs WHERE ticker='GME'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=24.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXPIRED', 0.00, 0, 'EXPIRED_WORTHLESS', '2026-03-20', 'GME $24C Mar 20 expired worthless'),
  ((SELECT id FROM public.legs WHERE ticker='SYNA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=85.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXPIRED', 0.00, 0, 'EXPIRED_WORTHLESS', '2026-03-20', 'SYNA $85C Mar 26 expired worthless — stock near strike');
-- 3/20: EXERCISES — option leg EXERCISED (realized null); spawned shares leg BUY @ strike+premium
-- VIAV $14C: premium $1.20 + strike $14 → spawned shares entry $15.20
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='VIAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=14.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXERCISED', 14.00, 0, 'EXERCISED', '2026-03-20', 'VIAV $14C Mar 26 exercised → shares spawned at strike + premium'),
  ((SELECT id FROM public.legs WHERE ticker='VIAV' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 15.20, NULL, NULL, '2026-03-20', 'Spawned shares from $14C exercise — entry = strike $14 + premium $1.20');
-- AMKR $25C: premium $2.50 + strike $25 → spawned shares entry $27.50
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=25.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXERCISED', 25.00, 0, 'EXERCISED', '2026-03-20', 'AMKR $25C Mar 26 exercised → shares spawned'),
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 27.50, NULL, NULL, '2026-03-20', 'Spawned shares from $25C exercise — entry = strike $25 + premium $2.50');
-- HII $285C [EST strike]: premium $8.00 + strike $285 → spawned shares entry $293.00
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=285.00 AND option_expiry='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXERCISED', 285.00, 0, 'EXERCISED', '2026-03-20', '[EST strike] HII calls exercised → shares spawned'),
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 293.00, NULL, NULL, '2026-03-20', '[EST] Spawned shares from HII call exercise — entry = strike $285 + premium $8.00');
-- 3/27: AMKR $30C Jun trimmed/closed (options to ~2%) — full close of this leg
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='AMKR' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 4.50, 0, 'PROFIT_TARGET', '2026-03-27', '[EST exit price] Further options trim — AMKR $30C Jun sold. Options to 2%.');

-- ── APR 2026 ──
-- [EST] CTS, LUMN, HOOD $80C, MITK Nov, CXDO, FIVN, GDYN opening BUYs
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='CTS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-01'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 51.26, NULL, NULL, '2026-04-01', '[EST date] CTS shares @ $51.26'),
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=8.00 AND option_expiry='2026-07-17'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.17, NULL, NULL, '2026-04-01', '[EST date] LUMN $8C Jul 17 26 @ $1.17'),
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.63, NULL, NULL, '2026-04-01', '[EST date] LUMN $7C Jan 27 @ $2.63'),
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=8.00 AND option_expiry='2026-05-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.93, NULL, NULL, '2026-04-01', '[EST date] LUMN $8C May 26 @ $0.93 (small position)'),
  ((SELECT id FROM public.legs WHERE ticker='HOOD' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=80.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.00, NULL, NULL, '2026-04-01', '[EST date and cost basis] HOOD $80C Jun 19 26'),
  ((SELECT id FROM public.legs WHERE ticker='MITK' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=12.50 AND option_expiry='2026-11-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.70, NULL, NULL, '2026-04-01', '[EST date] MITK $12.5C Nov 20 26 @ $3.70 initial CB'),
  ((SELECT id FROM public.legs WHERE ticker='CXDO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-10-16' AND opened_at='2026-04-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.50, NULL, NULL, '2026-04-15', '[EST date and cost basis] CXDO initial options position'),
  ((SELECT id FROM public.legs WHERE ticker='FIVN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=22.50 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.00, NULL, NULL, '2026-04-28', '[EST date and cost basis] FIVN $22.5C Oct 16 26 — original position'),
  ((SELECT id FROM public.legs WHERE ticker='GDYN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.00 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.20, NULL, NULL, '2026-04-28', '[EST date, strike, and cost basis] GDYN calls — replaced with shares 6/11');
-- 4/24: New positions (BDC, AMSC, FPS, RDCM, VPG, P)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='BDC'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 125.85, NULL, NULL, '2026-04-24', 'New 4/24 — 4.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='AMSC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 41.22, NULL, NULL, '2026-04-24', 'New 4/24 — 4% weight'),
  ((SELECT id FROM public.legs WHERE ticker='FPS'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 34.31, NULL, NULL, '2026-04-24', 'New 4/24 — 4% weight'),
  ((SELECT id FROM public.legs WHERE ticker='RDCM' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 12.91, NULL, NULL, '2026-04-24', 'New 4/24 — 3.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='VPG'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 53.16, NULL, NULL, '2026-04-24', 'New 4/24 — 4.5% weight. Calls also held.'),
  ((SELECT id FROM public.legs WHERE ticker='P'    AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=75.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 8.80, NULL, NULL, '2026-04-24', 'New 4/24 — P $75C Aug 21 26 @ $8.80, 0.5% weight');
-- 4/28: ITRI full close (weak guide)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ITRI' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-02-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 95.00, 0, 'THESIS_BROKEN', '2026-04-28', '[EST exit price] Full exit after weak earnings guide.');
-- 4/30: VLN new position + P upsize (add contracts; leg stays OPEN)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='VLN'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-30'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.57, NULL, NULL, '2026-04-30', 'New position — 5.5% weight'),
  ((SELECT id FROM public.legs WHERE ticker='P'    AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=75.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 8.80, NULL, NULL, '2026-04-30', 'Raised P from 0.5% → 1%. Added same-strike contracts.');

-- ── MAY 2026 ──
-- 5/6: BB $6C Sep 26
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='BB'   AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=6.00 AND option_expiry='2026-09-18'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.87, NULL, NULL, '2026-05-06', 'BB $6C Sep 18 26 @ $0.87 — 1.5% swing trade');
-- 5/11: ADEA initial options position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.50, NULL, NULL, '2026-05-11', '[EST cost basis] ADEA June $30C — later converted to shares 5/15'),
  ((SELECT id FROM public.legs WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-09-18'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.00, NULL, NULL, '2026-05-11', '[EST cost basis] ADEA $30C Sep 18 26 — kept in full size');
-- 5/15: ADEA June calls → shares conversion; SHLS, BLDP, AMRC new positions
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=30.00 AND option_expiry='2026-06-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.50, 0, 'PROFIT_TARGET', '2026-05-15', '[EST] Converted ADEA June calls → shares. Sold calls, bought shares @$30.10'),
  ((SELECT id FROM public.legs WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-05-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 30.10, NULL, NULL, '2026-05-15', 'ADEA shares from June call conversion @ $30.10 — very small lot'),
  ((SELECT id FROM public.legs WHERE ticker='SHLS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.95, NULL, NULL, '2026-05-15', 'SHLS $10C Oct 16 26 @ $1.95 — 2% weight'),
  ((SELECT id FROM public.legs WHERE ticker='BLDP' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=4.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.90, NULL, NULL, '2026-05-15', 'BLDP $4C Aug 21 26 @ $0.90 — part of 3% weight'),
  ((SELECT id FROM public.legs WHERE ticker='BLDP' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=5.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.60, NULL, NULL, '2026-05-15', 'BLDP $5C Aug 21 26 @ $0.60 — part of 3% weight');
-- AMRC opening BUY OMITTED — strike unknown (its leg is omitted above). TODO: add with real strike.
-- 5/21: MITK upsize — add Nov $12.5C (leg stays OPEN)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='MITK' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=12.50 AND option_expiry='2026-11-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 4.00, NULL, NULL, '2026-05-21', '[EST add price] MITK Nov $12.5C upsize. Weight 2.9% → 4.7%, CB $3.70 → $3.77');
-- 5/22: CRNC $10C Aug
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='CRNC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.85, NULL, NULL, '2026-05-22', 'CRNC $10C Aug 21 26 @ $1.85 — 1.5% weight');
-- 5/28: FIVN upsize (add $25C Oct); P full close
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='FIVN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=25.00 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 3.70, NULL, NULL, '2026-05-28', 'FIVN upsize — added $25C Oct @ $3.70. Total now 6% weight.'),
  ((SELECT id FROM public.legs WHERE ticker='P'    AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=75.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.00, 0, 'THESIS_BROKEN', '2026-05-28', '[EST exit price] P $75C Aug 26 full close. Thesis broken after earnings.');

-- ── JUN 2026 ──
-- 6/1: ADEA upsize ($35C Sep); CXDO upsize ($10C Oct 6/1 leg); HII full close (both share lots)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ADEA' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=35.00 AND option_expiry='2026-09-18'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.74, NULL, NULL, '2026-06-01', 'ADEA $35C Sep 18 26 @ $2.74 avg — doubles weighting to 2.5%'),
  ((SELECT id FROM public.legs WHERE ticker='CXDO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-10-16' AND opened_at='2026-06-01'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 2.24, NULL, NULL, '2026-06-01', 'CXDO $10C Oct 16 26 @ $2.24 avg — upsize to 3.9% total'),
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 300.00, 0, NULL, '2026-06-01', '[EST exit price] HII original lot full exit — buying power'),
  ((SELECT id FROM public.legs WHERE ticker='HII'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-03-20'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 300.00, 0, NULL, '2026-06-01', '[EST exit price] HII exercised lot full exit — buying power');
-- 6/3: PLPC and KTOS full closes
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='PLPC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 410.00, 0, 'PROFIT_TARGET', '2026-06-03', '[EST exit price] Full exit. Doubled+ from $192.16.'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2025-12-19'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 75.00, 0, 'PROFIT_TARGET', '2026-06-03', '[EST exit price] Full exit. Tripled+ from $22.34.'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=35.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 50.00, 0, 'PROFIT_TARGET', '2026-06-03', '[EST exit price] KTOS $35C Jan 27 closed with position.'),
  ((SELECT id FROM public.legs WHERE ticker='KTOS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=40.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 38.00, 0, 'PROFIT_TARGET', '2026-06-03', '[EST exit price] KTOS $40C Jan 27 closed with position.');
-- 6/4: ARRY new position
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='ARRY' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=9.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 1.54, NULL, NULL, '2026-06-04', 'ARRY $9C Aug 21 26 @ $1.54 — tactical solar trade, 1.5% weight');
-- 6/5: Mass closes (RDCM, VLN, AMSC) — AMRC close omitted (leg omitted)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='RDCM' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 15.00, 0, NULL, '2026-06-05', '[EST exit price] Full exit — position management'),
  ((SELECT id FROM public.legs WHERE ticker='VLN'  AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-30'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 2.00, 0, NULL, '2026-06-05', '[EST exit price] Full exit — position management'),
  ((SELECT id FROM public.legs WHERE ticker='AMSC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-04-24'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 50.00, 0, NULL, '2026-06-05', '[EST exit price] Full exit — position management');
-- 6/10: BB full close (+300%)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='BB'   AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=6.00 AND option_expiry='2026-09-18'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.48, 0, 'PROFIT_TARGET', '2026-06-10', 'BB $6C Sep 26 full close. +300% from $0.87.');
-- 6/11: IRDM trim (calls up +700%; leg stays OPEN → weight 4.0)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='IRDM' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=22.50 AND option_expiry='2026-07-17'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 23.45, 4.0, 'PARTIAL_PROFIT', '2026-06-11', '[EST exit price] IRDM trim to ~4%. Calls up +700%, de-risking ahead of SpaceX IPO.');
-- 6/11: FIVN $25C Oct closed (replacing with shares)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='FIVN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=25.00 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 5.50, 0, 'PROFIT_TARGET', '2026-06-11', '[EST exit price] Closed $25C Oct leg — adding shares instead');
-- 6/11: Share additions (FIVN, SHLS, CXDO, CRNC, GDYN, TE) + ARKK hedge
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='FIVN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 20.48, NULL, NULL, '2026-06-11', 'FIVN shares @ $20.48 avg — replacing $25C Oct'),
  ((SELECT id FROM public.legs WHERE ticker='SHLS' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 9.41, NULL, NULL, '2026-06-11', 'SHLS shares @ $9.41 avg — replacing contracts'),
  ((SELECT id FROM public.legs WHERE ticker='CXDO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 6.93, NULL, NULL, '2026-06-11', 'CXDO shares @ $6.93 avg — replacing contracts'),
  ((SELECT id FROM public.legs WHERE ticker='CRNC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 9.98, NULL, NULL, '2026-06-11', 'CRNC shares @ $9.98 avg — replacing contracts'),
  ((SELECT id FROM public.legs WHERE ticker='GDYN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 6.34, NULL, NULL, '2026-06-11', 'GDYN shares @ $6.34 avg — replacing contracts'),
  ((SELECT id FROM public.legs WHERE ticker='TE'   AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='SHARES' AND opened_at='2026-06-11'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 7.87, NULL, NULL, '2026-06-11', 'TE shares @ $7.87 avg — 6% weight, new position'),
  ((SELECT id FROM public.legs WHERE ticker='ARKK' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=70.00 AND option_expiry='2026-06-18'),
   (SELECT id FROM public.traders WHERE name='STW'), 'BUY', 0.83, NULL, NULL, '2026-06-11', 'ARKK $70P Jun 18 26 @ $0.83 — portfolio hedge, 1%');
-- 6/11: CRNC + GDYN calls closed (replaced with shares)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='CRNC' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.00, 0, 'PROFIT_TARGET', '2026-06-11', '[EST] CRNC $10C Aug closed — replacing with shares'),
  ((SELECT id FROM public.legs WHERE ticker='GDYN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.00 AND option_expiry='2026-10-16'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 2.00, 0, 'PROFIT_TARGET', '2026-06-11', '[EST] GDYN calls closed — replacing with shares');
-- 6/11: LUMN, BLDP, ARRY full closes
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=8.00 AND option_expiry='2026-07-17'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 2.00, 0, 'THESIS_BROKEN', '2026-06-11', '[EST exit price] LUMN $8C Jul closed — thesis broken'),
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=7.00 AND option_expiry='2027-01-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 2.50, 0, 'THESIS_BROKEN', '2026-06-11', '[EST exit price] LUMN $7C Jan 27 closed — thesis broken'),
  ((SELECT id FROM public.legs WHERE ticker='BLDP' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=4.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 0.40, 0, 'STOP_HIT', '2026-06-11', '[EST exit price] BLDP $4C Aug closed — chart breaking down'),
  ((SELECT id FROM public.legs WHERE ticker='BLDP' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=5.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 0.20, 0, 'STOP_HIT', '2026-06-11', '[EST exit price] BLDP $5C Aug closed — chart breaking down'),
  ((SELECT id FROM public.legs WHERE ticker='ARRY' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=9.00 AND option_expiry='2026-08-21'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 0.80, 0, 'STOP_HIT', '2026-06-11', '[EST exit price] ARRY $9C Aug closed at a loss');
-- 6/11: CXDO option legs closed (both the 4/15 and 6/1 legs; replaced with shares)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='CXDO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-10-16' AND opened_at='2026-04-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.50, 0, 'PROFIT_TARGET', '2026-06-11', '[EST] CXDO original (4/15) option leg closed — replaced with shares'),
  ((SELECT id FROM public.legs WHERE ticker='CXDO' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=10.00 AND option_expiry='2026-10-16' AND opened_at='2026-06-01'),
   (SELECT id FROM public.traders WHERE name='STW'), 'SELL', 3.50, 0, 'PROFIT_TARGET', '2026-06-11', '[EST] CXDO 6/1 option leg closed — replaced with shares');

-- 5/15: LUMN $8C May 26 expired worthless (logged out-of-order in source)
INSERT INTO leg_transactions (leg_id, trader_id, action_type, price, weight, close_reason, executed_at, notes)
VALUES
  ((SELECT id FROM public.legs WHERE ticker='LUMN' AND trader_id=(SELECT id FROM public.traders WHERE name='STW') AND instrument_type='OPTION' AND option_strike=8.00 AND option_expiry='2026-05-15'),
   (SELECT id FROM public.traders WHERE name='STW'), 'EXPIRED', 0.00, 0, 'EXPIRED_WORTHLESS', '2026-05-15', 'LUMN $8C May 15 26 expired worthless');

-- ================================================================
-- END — POSITIONS PENDING RESOLUTION (as of 2026-06-12):
--   • VPG CALLS: STW noted 6/11 he will exercise some VPG calls (~6/12 or 6/20). Once
--     exercised: EXERCISED on the VPG option leg + spawned SHARES leg BUY at strike+premium
--     + holding_transaction 'Upsized' for VPG. (VPG option leg not yet in this backfill —
--     strike/expiry unknown.)
--   • ARKK $70P Jun 18 26: expires 2026-06-18 — add EXPIRED or SELL per outcome.
--   • AMZN $250C Jan 28: LEAPS — still open.  HOOD $80C Jun 19 26: expires 2026-06-19.
--   • AMRC option leg + events OMITTED — strike unknown; add a real strike then uncomment.
-- REMAINING OPEN POSITIONS: ENS, AMKR (shares ×2), VIAV (shares ×2), OSS, NBIS, LEU, TSLA,
--   AMZN (shares + Jan28C), HOOD (shares?+Jun80C), SYNA, MITK (shares + Jul26C + Nov26C),
--   IRDM ($22.5C Jul17), CTS, BDC, FPS, VPG (shares + calls), FIVN (shares + $22.5C Oct),
--   SHLS (shares), CXDO (shares), CRNC (shares), GDYN (shares), ADEA (shares + $30C/$35C Sep),
--   ARKK ($70P Jun18), TE.
-- ================================================================
