-- ONE-TIME conviction fix — the 6/18 "stars" → tier 5.
--
-- Conviction is routine-owned going FORWARD (set in the streaming/transcripts run, and in the daily
-- runs only on an explicit host signal). This is a one-time backfill so the dashboard reflects the
-- 6/18 conviction stars now, rather than waiting for the next streaming run to restate them.
--
-- Host-confirmed (2026-06-19):
--   • The 8 SECTOR names below → conviction 5 (highest).
--   • AMZN / TSLA are also "starred" but are LEGACY (Tier 6 / c0 = conviction 0) — leave them at 0.
--     "Legacy" is a conviction tier, not a star; it is NOT promoted here.
--   • Legacy is mutable forward: a later explicit host signal can promote AMZN/TSLA — the routines own
--     that. This script only sets the 8 sector stars.
-- Idempotent: re-running produces the same end state.
--
-- Run in the Supabase SQL editor:
--   PROD:    https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--   SANDBOX: https://supabase.com/dashboard/project/uolabcgbnrkhzpwuvzlk/sql

do $$
declare
  tid uuid := (select id from public.traders where name = 'STW');  -- env-agnostic
begin
  update public.holdings
     set conviction = 5
   where trader_id = tid
     and ticker in ('OSS','VPG','SYNA','VIAV','NBIS','ENS','AMKR','LEU')
     and conviction is distinct from 5;
end $$;

-- Verify (expect the 8 names at 5; AMZN/TSLA still 0)
select ticker, conviction
from public.holdings
where trader_id = (select id from public.traders where name = 'STW')
  and ticker in ('OSS','VPG','SYNA','VIAV','NBIS','ENS','AMKR','LEU','AMZN','TSLA')
order by conviction desc, ticker;
