-- 026: add `trader_id` to `holding_transactions` + `conviction_comments`; fix source enum.
--
-- ⚠️ APP-CODE CONSEQUENCE: after this migration `trader_id` is NOT NULL on both tables.
-- Every client-side insert must include `trader_id` — specifically the admin "+ Add Event"
-- form (holding_transactions) and the "+ Add Note" form (conviction_comments). These ship
-- as part of the Phase 1 app deploy at cutover. See Workstream 3.
--
-- `direction` lives on holding_transactions today and moves to `legs` in 029 — not added here.
--
-- Requires 022 + 025 applied.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- holding_transactions: add trader_id
alter table public.holding_transactions
  add column trader_id uuid;

update public.holding_transactions
set trader_id = (select id from public.traders where name = 'STW');

alter table public.holding_transactions
  alter column trader_id set not null;

alter table public.holding_transactions
  add constraint holding_transactions_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- conviction_comments: add trader_id
alter table public.conviction_comments
  add column trader_id uuid;

update public.conviction_comments
set trader_id = (select id from public.traders where name = 'STW');

alter table public.conviction_comments
  alter column trader_id set not null;

alter table public.conviction_comments
  add constraint conviction_comments_trader_id_fkey
    foreign key (trader_id) references public.traders(id);

-- Fix conviction_comments.source constraint
-- Live constraint allows: discord, streaming, manual
-- v1 plan incorrectly listed 'user' — corrected here
alter table public.conviction_comments
  drop constraint if exists conviction_comments_source_check;

alter table public.conviction_comments
  add constraint conviction_comments_source_check
    check (source in ('discord', 'streaming', 'manual'));

commit;
