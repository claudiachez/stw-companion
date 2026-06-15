-- 027: promote `run_log.channel` (text) to `channel_id` FK → channels.
--
-- ⚠️ BREAKING — do NOT apply to production individually. The routine `run_log` write
-- references the dropped `channel` text column and fails on the next cron run. Cut over
-- in the coordinated window only.
--
-- Backfill matches on `discord_channel_id`, not channel name, to avoid ambiguity.
-- `live-notes-portfolio` maps to exactly one channels row (morning + afternoon both read
-- it; routine identity lives in run_log.run_type).
--
-- Requires 023 applied + channels seeded.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- Step 1: add new FK column alongside old text column
alter table public.run_log
  add column channel_id uuid;

-- Step 2: deterministic backfill using discord_channel_id
update public.run_log rl
set channel_id = c.id
from public.channels c
where c.discord_channel_id = case rl.channel
  when 'live-notes-portfolio' then '1229546005788098580'
  when 'updates-portfolio'    then '1503874839599911073'
  when 'stream-library-stw'  then '1441560421822627860'
  when 'graddox'         then '1149448308293632110'
  else null
end;

-- Step 3: add FK constraint (nullable — old unmatched rows stay null, not an error)
alter table public.run_log
  add constraint run_log_channel_id_fkey
    foreign key (channel_id) references public.channels(id);

-- Step 4: manual verification — run this before Step 5
-- select count(*) from run_log
-- where channel_id is null and ran_at > now() - interval '90 days';
-- Must return 0 before dropping the old column.

-- Step 5: drop old text column
alter table public.run_log
  drop column channel;

commit;
