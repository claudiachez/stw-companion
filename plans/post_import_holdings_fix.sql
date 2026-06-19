-- POST-IMPORT HOLDINGS FIX (Next Step #2). Apply in SANDBOX after import_open_positions.sql.
-- The import set current_weight only; this restates the holding-level fields it left wrong.
--   Item 1: last_action + action_date  = each ticker's LATEST diary event (tie -> keep-open action).
--   Item 4: basket / category_id from the 6/18 portfolio update's sector groupings.
-- last_action ∈ {New,Upsized,Trimmed,Hold,Closed} (no "Expired" -> Expired diary rows map to Closed).
-- Conviction is owned by the routines (set in the streaming run), so it is NOT touched here.
-- "Legacy" is a conviction tier (Tier 6 / c0), NOT a sector — AMZN/HOOD/TSLA stay Uncategorized.
-- AMZN/HOOD/TSLA have no imported legs, so Item 1 skips them too (nothing for this seed to do).
-- Idempotent: re-running produces the same end state.

do $$
declare
  tid uuid := '9ec36b89-6bf7-4ac7-a729-fe149d95d5c3';  -- STW trader
begin
  ---------------------------------------------------------------------------
  -- Item 4a: ensure the three new sector categories exist (match by exact name)
  ---------------------------------------------------------------------------
  insert into public.categories (trader_id, name)
  select tid, v.n from (values
    ('AI Fraud / Verified Identity'),
    ('Space & Satellite'),
    ('Nuclear')
  ) as v(n)
  where not exists (
    select 1 from public.categories c where c.trader_id = tid and c.name = v.n
  );

  ---------------------------------------------------------------------------
  -- Item 1: last_action + action_date (latest diary event per ticker)
  ---------------------------------------------------------------------------
  update public.holdings set last_action='New',     action_date='2026-06-12' where ticker='ADEA';
  update public.holdings set last_action='Closed',  action_date='2026-06-18' where ticker='ARKK';  -- Expired
  update public.holdings set last_action='Closed',  action_date='2026-06-11' where ticker='ARRY';
  update public.holdings set last_action='Closed',  action_date='2026-06-10' where ticker='BB';
  update public.holdings set last_action='Upsized',  action_date='2026-06-02' where ticker='BDC';
  update public.holdings set last_action='Upsized',  action_date='2026-06-18' where ticker='CRNC';
  update public.holdings set last_action='New',      action_date='2026-05-15' where ticker='CTS';
  update public.holdings set last_action='New',      action_date='2026-06-11' where ticker='CXDO'; -- conv. to shares (tie)
  update public.holdings set last_action='New',      action_date='2025-10-13' where ticker='ENS';
  update public.holdings set last_action='New',      action_date='2026-06-11' where ticker='FIVN'; -- conv. to shares (tie)
  update public.holdings set last_action='New',      action_date='2026-05-15' where ticker='FPS';
  update public.holdings set last_action='New',      action_date='2026-06-11' where ticker='GDYN'; -- conv. to shares (tie)
  update public.holdings set last_action='Trimmed',  action_date='2026-06-11' where ticker='IRDM';
  update public.holdings set last_action='New',      action_date='2026-05-21' where ticker='LEU';
  update public.holdings set last_action='Upsized',  action_date='2026-06-18' where ticker='MITK';
  update public.holdings set last_action='New',      action_date='2025-05-09' where ticker='NBIS';
  update public.holdings set last_action='New',      action_date='2025-11-26' where ticker='OSS';
  update public.holdings set last_action='Closed',   action_date='2026-06-12' where ticker='RNG';  -- Expired
  update public.holdings set last_action='New',      action_date='2026-06-11' where ticker='SHLS'; -- conv. to shares (tie)
  update public.holdings set last_action='Upsized',  action_date='2026-02-19' where ticker='SYNA';
  update public.holdings set last_action='New',      action_date='2026-06-11' where ticker='TE';
  update public.holdings set last_action='New',      action_date='2025-10-24' where ticker='VIAV';
  update public.holdings set last_action='Closed',   action_date='2026-06-05' where ticker='VLN';
  update public.holdings set last_action='New',      action_date='2026-04-22' where ticker='VPG';
  update public.holdings set last_action='New',      action_date='2025-09-05' where ticker='AMKR';

  ---------------------------------------------------------------------------
  -- Item 4b: basket + category_id from the 6/18 sector groupings
  -- (category_id is authoritative in the UI; basket text kept in sync.)
  ---------------------------------------------------------------------------
  update public.holdings h set basket='Robotics + Edge AI',
    category_id=(select id from public.categories where trader_id=tid and name='Robotics + Edge AI' order by id limit 1)
    where h.ticker in ('OSS','VPG','SYNA','CTS');
  update public.holdings h set basket='Datacenter + AI Infrastructure',
    category_id=(select id from public.categories where trader_id=tid and name='Datacenter + AI Infrastructure' order by id limit 1)
    where h.ticker in ('VIAV','NBIS','BDC','GDYN');
  update public.holdings h set basket='Power Infrastructure',
    category_id=(select id from public.categories where trader_id=tid and name='Power Infrastructure' order by id limit 1)
    where h.ticker in ('ENS','TE','SHLS','FPS');
  update public.holdings h set basket='U.S. Chips Supply Chain',
    category_id=(select id from public.categories where trader_id=tid and name='U.S. Chips Supply Chain' order by id limit 1)
    where h.ticker in ('AMKR','ADEA');
  update public.holdings h set basket='Telecom + Voice AI',
    category_id=(select id from public.categories where trader_id=tid and name='Telecom + Voice AI' order by id limit 1)
    where h.ticker in ('FIVN','CRNC','CXDO');
  update public.holdings h set basket='AI Fraud / Verified Identity',
    category_id=(select id from public.categories where trader_id=tid and name='AI Fraud / Verified Identity' order by id limit 1)
    where h.ticker in ('MITK');
  update public.holdings h set basket='Space & Satellite',
    category_id=(select id from public.categories where trader_id=tid and name='Space & Satellite' order by id limit 1)
    where h.ticker in ('IRDM');  -- moves from Defense per the 6/18 grouping
  update public.holdings h set basket='Nuclear',
    category_id=(select id from public.categories where trader_id=tid and name='Nuclear' order by id limit 1)
    where h.ticker in ('LEU');
  -- AMZN/HOOD/TSLA: no sector basket. "Legacy" is their conviction tier (owned by the routines).
end $$;

-- Verify
select ticker, last_action, action_date, conviction, basket, current_weight
from public.holdings
where ticker in ('OSS','VPG','SYNA','CTS','VIAV','NBIS','BDC','GDYN','ENS','TE','SHLS','FPS',
                 'AMKR','ADEA','FIVN','CRNC','CXDO','MITK','IRDM','LEU','AMZN','HOOD','TSLA',
                 'ARKK','RNG')
order by basket, current_weight desc;
