-- Backfill conviction_comments.prev_conviction_level for the 2026-06-24 streaming batch (the
-- "where I bought, why I still own it" portfolio-recap episode). Without this, the Overview's
-- Conviction Changes block reverse-engineers the delta from prior comment rows and gets it wrong
-- (e.g. AMKR shows a phantom 4→5 from a stale May comment; CTS/MITK upgrades are invisible because
-- they have no prior comment). Source of truth = the routine's own report for this episode:
--
--   MITK 3→4, FPS 2→4, CTS 3→4   (conviction bumped on explicit signal)
--   everything else              reaffirmed / thesis-refreshed → prev = current level
--
-- Requires migration 043_conviction_prev_level.sql. Run on PROD (the batch lives there).

update conviction_comments set prev_conviction_level = case ticker
    when 'MITK' then 3
    when 'FPS'  then 2
    when 'CTS'  then 3
    else conviction_level   -- reaffirmed / thesis-refreshed: no conviction move
  end
where source = 'streaming' and user_id is null and event_date = '2026-06-24'
  and trader_id = (select id from traders where name = 'STW')
  and prev_conviction_level is null
returning ticker, conviction_level, prev_conviction_level;
