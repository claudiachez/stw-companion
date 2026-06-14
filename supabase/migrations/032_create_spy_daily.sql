-- 032: create the `spy_daily` table — SPY benchmark series.
--
-- WHY: backs the "trader cumulative return vs SPY" benchmark delta. Population is a
-- separate lightweight daily cron after market close (fetch SPY close from Finnhub, upsert
-- here); daily_return_pct = (today_close − yesterday_close) / yesterday_close × 100.
-- This migration only creates the table.
--
-- Independent — no migration prerequisites.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

create table public.spy_daily (
  id               uuid    not null default gen_random_uuid(),
  price_date       date    not null,
  close_price      numeric not null,
  daily_return_pct numeric,
  constraint spy_daily_pkey primary key (id),
  constraint spy_daily_price_date_unique unique (price_date)
);

alter table public.spy_daily enable row level security;

create policy "spy_daily_select" on public.spy_daily
  for select to authenticated using (true);

create policy "spy_daily_write_admin" on public.spy_daily
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

commit;
