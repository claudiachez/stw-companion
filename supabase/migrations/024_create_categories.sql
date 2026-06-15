-- 024: create the `categories` table — trader-scoped position categories.
--
-- WHY: replaces the free-text `holdings.basket` column with a real FK target.
-- Seeded from existing distinct `holdings.basket` values for STW.
--
-- Requires 022 applied + traders seeded.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.categories (
  id          uuid        not null default gen_random_uuid(),
  trader_id   uuid        not null,
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  constraint categories_pkey primary key (id),
  constraint categories_trader_id_fkey
    foreign key (trader_id) references public.traders(id),
  constraint categories_trader_name_unique unique (trader_id, name)
);

alter table public.categories enable row level security;

create policy "categories_select" on public.categories
  for select to authenticated using (true);

create policy "categories_write_admin" on public.categories
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;

-- ============================================================================
-- POST-APPLY SEED — seed from existing holdings.basket values.
-- ============================================================================
-- insert into public.categories (trader_id, name)
-- select distinct
--   (select id from public.traders where name = 'STW'),
--   basket
-- from public.holdings
-- where basket is not null
-- on conflict do nothing;
