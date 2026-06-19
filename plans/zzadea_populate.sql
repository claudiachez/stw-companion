-- Populate the ZZADEA test holding to mirror real ADEA, so the holding-level fields
-- (Status / Last Action Date / Initial Weight / Equity %) and the Notes column aren't empty.
-- These live on `holdings` / `leg_transactions.notes` — they're set by the routine/import in
-- production; this just seeds the test fixture. Run in the SANDBOX SQL editor.

-- 1) Holding-level fields
update public.holdings set
  last_action    = 'Upsized',       -- Status
  action_date    = '2026-06-01',    -- Last Action Date (the $35C upsize)
  current_weight = 5.3,             -- Current = the live weight the routines restate weekly
  equity_pct     = 0.30             -- ADEA equity:options = 30:70
where ticker = 'ZZADEA';
-- Note: initial_weight is no longer displayed — Initial now derives from Σ the open legs' lots
-- (the diary), not a hand-typed holdings field. Left untouched here.

-- 2) The host's words into each event's Notes (matched by leg + action + date)
update public.leg_transactions lt set notes = c.note
from public.legs l
join (values
  (30::numeric, '2026-06-19'::date, 'BUY',  '2026-05-15'::date, 'Took a ~2% position: $30C Jun @ $1.50 + $30C Sep @ $3.58 (20/80 short/long)'),
  (30,          '2026-06-19',       'SELL', '2026-05-15',       'Closed June calls — converting to equalweight shares @ $30.10'),
  (30,          '2026-09-18',       'BUY',  '2026-05-15',       'Longer-dated $30C Sep, kept in full size'),
  (30,          '2026-09-18',       'SELL', '2026-06-12',       'Closed 30C Sep, converted to shares (per the 6/12 portfolio update)'),
  (35,          '2026-09-18',       'BUY',  '2026-06-01',       'Upsized with $35C Sep @ $2.74 — doubles weighting to ~2.5%'),
  (null,        null,               'BUY',  '2026-05-15',       'Shares from the June-call conversion @ $30.10 (small lot)'),
  (null,        null,               'BUY',  '2026-06-12',       'Added shares @ $30.10 — implied by the 6/12 portfolio update')
) as c(strike, expiry, atype, edate, note)
  on  coalesce(l.option_strike, -1)            = coalesce(c.strike, -1)
  and coalesce(l.option_expiry, '1900-01-01')  = coalesce(c.expiry, '1900-01-01')
where lt.leg_id = l.id and l.ticker = 'ZZADEA'
  and lt.action_type = c.atype and lt.executed_at::date = c.edate;

-- 3) Real exit prices on the "convert to shares" closes (host decision 2026-06-18: a conversion is a
-- genuine cash sale → book the option's actual sale value as realized, NOT $0). The 040 trigger
-- re-derives legs.exit_price + realized_pnl_pct. (Illustrative test values; real positions get true
-- prices from the Excel import.) $30C Jun 1.50→2.40 = +60%; $30C Sep 3.58→2.90 = −19%; weighted by
-- initial lot (0.6 / 1.4) → Closed P&L ≈ +4.7%.
update public.leg_transactions lt set price = c.exit
from public.legs l
join (values
  (30::numeric, '2026-06-19'::date, '2026-05-15'::date, 2.40::numeric),
  (30,          '2026-09-18',       '2026-06-12',       2.90)
) as c(strike, expiry, edate, exit)
  on l.option_strike = c.strike and l.option_expiry = c.expiry
where lt.leg_id = l.id and l.ticker = 'ZZADEA'
  and lt.action_type = 'SELL' and lt.executed_at::date = c.edate;
