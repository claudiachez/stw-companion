-- 062: re-seed ticker_sector_map from Finnhub labels to canonical GICS-11.
--
-- The map was seeded with Finnhub's finnhubIndustry labels (Technology /
-- Semiconductors / Electrical Equipment / …). This folds them to the 11 GICS
-- sectors, mirroring resolveSector()/FINNHUB_GICS in @stw/shared exactly. New
-- tickers are handled going forward by the sector-map-sync scheduled function.
--
-- One-off data migration (no schema change). Idempotent: re-running is a no-op
-- once values are already GICS (GICS labels don't match the Finnhub `in (...)`
-- lists). Apply to BOTH prod and sandbox.

-- Information Technology ← Technology, Semiconductors
update public.ticker_sector_map set sector = 'Information Technology'
  where sector in ('Technology', 'Semiconductors');

-- Industrials ← Electrical Equipment, Aerospace & Defense, Construction, Marine
update public.ticker_sector_map set sector = 'Industrials'
  where sector in ('Electrical Equipment', 'Aerospace & Defense', 'Construction', 'Marine');

-- Consumer Discretionary ← Retail, Automobiles
update public.ticker_sector_map set sector = 'Consumer Discretionary'
  where sector in ('Retail', 'Automobiles');

-- Communication Services ← Communications, Telecommunication
update public.ticker_sector_map set sector = 'Communication Services'
  where sector in ('Communications', 'Telecommunication');

-- Financials ← Banking, Financial Services
update public.ticker_sector_map set sector = 'Financials'
  where sector in ('Banking', 'Financial Services');

-- Energy stays Energy (already a valid GICS sector — no change).

-- Per-ticker override: Viavi is comms/test EQUIPMENT → GICS Information Technology,
-- not Communication Services (Finnhub's ambiguous "Communications" folded it there
-- in the update above). Matches TICKER_GICS in @stw/shared. Run LAST.
update public.ticker_sector_map set sector = 'Information Technology' where ticker = 'VIAV';
