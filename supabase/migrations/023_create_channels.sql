-- 023: create the `channels` table — one row per Discord channel ID.
--
-- WHY: `routine_type` is NOT a column on `channels`. A Discord channel is a channel —
-- the morning and afternoon routines both read `live-notes-portfolio` (one channel, two
-- routines). The routine identity already lives in `run_log.run_type`. Making it part of
-- channel identity caused a non-deterministic backfill in v1.
--
-- Requires 022 applied + traders seeded.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.channels (
  id                  uuid        not null default gen_random_uuid(),
  trader_id           uuid        not null,
  discord_channel_id  text        not null,
  channel_name        text        not null,
  created_at          timestamptz not null default now(),
  constraint channels_pkey primary key (id),
  constraint channels_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint channels_discord_id_unique unique (discord_channel_id)
);

alter table public.channels enable row level security;

create policy "channels_select" on public.channels
  for select to authenticated using (true);

create policy "channels_write_admin" on public.channels
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;

-- ============================================================================
-- POST-APPLY SEED — seed all four channels.
-- ============================================================================
-- insert into public.channels (trader_id, discord_channel_id, channel_name)
-- values
--   ((select id from public.traders where name = 'Graddox'),
--    '1149448308293632110', 'graddox'),
--   ((select id from public.traders where name = 'STW'),
--    '1229546005788098580', 'live-notes-portfolio'),
--   ((select id from public.traders where name = 'STW'),
--    '1503874839599911073', 'updates-portfolio'),
--   ((select id from public.traders where name = 'STW'),
--    '1441560421822627860', 'stream-library-stw');
