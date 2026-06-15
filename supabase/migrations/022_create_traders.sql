-- 022: create the `traders` table — multi-trader infrastructure.
--
-- WHY: every downstream table (channels, categories, holdings, legs, signals, log
-- tables) becomes trader-scoped. STW and Graddox are the two seed traders. Subsequent
-- migrations resolve trader IDs at runtime via:
--   (select id from public.traders where name = 'STW')
--   (select id from public.traders where name = 'Graddox')
--
-- Apply 022 FIRST, then run the post-apply seed below and record the returned UUIDs.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.traders (
  id               uuid        not null default gen_random_uuid(),
  name             text        not null,
  discord_user_id  text,
  created_at       timestamptz not null default now(),
  constraint traders_pkey primary key (id)
);

alter table public.traders enable row level security;

create policy "traders_select" on public.traders
  for select to authenticated using (true);

create policy "traders_write_admin" on public.traders
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;

-- ============================================================================
-- POST-APPLY SEED — run separately and RECORD both returned UUIDs.
-- Every subsequent migration resolves these via the subquery form above.
-- ============================================================================
-- insert into public.traders (name, discord_user_id)
-- values ('STW', null)
-- returning id;
--
-- insert into public.traders (name, discord_user_id)
-- values ('Graddox', null)
-- returning id;
