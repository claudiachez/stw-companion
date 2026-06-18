-- 040: legs event-sourcing redesign — Phase 1 (schema + trigger 030 rewrite).
--
-- See plans/legs_event_sourcing_redesign.md. The editor will write ONLY `leg_transactions` (the diary);
-- `legs` becomes a pure projection the trigger derives by replaying the diary. This migration:
--   (a) adds the diary's editable display verb (`action_label`); the host's words use `notes`;
--   (b) adds `holdings.equity_pct` (per-position equity:options ratio; null → Config default);
--   (c) creates `app_config` (the admin Configuration page's tunable split defaults);
--   (d) rewrites the leg-sync trigger to fire on INSERT/UPDATE/DELETE and to book realized P&L on
--       trims (slice-weighted), so editing/deleting any diary row recomputes the scoreboard.
--
-- Current weight is NOT managed here — it's derived at read time via deriveLegWeights(holdings
-- .current_weight, …) honoring pins; `legs.weight` stores only the last-event/pinned weight.
--
-- Requires 029/030 AND 037 (legs.initial_weight — the trigger writes it) + 039 (legs.weight_overridden,
-- used app-side). The sandbox was at 036; apply 037 + 039 there first. Additive; safe alongside the
-- pending 034/035.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- ── (a) leg_transactions: an editable display verb (the host's words live in the existing `notes`
--        column — one notes field the routine writes and the admin can append to).
alter table public.leg_transactions
  add column if not exists action_label text;

alter table public.leg_transactions
  drop constraint if exists leg_transactions_action_label_check;
alter table public.leg_transactions
  add constraint leg_transactions_action_label_check check (
    action_label in ('New', 'Upsized', 'Trimmed', 'Closed', 'Exercised', 'Expired')
    or action_label is null
  );

-- ── (b) holdings: per-position equity:options ratio (equity share, 0–1; null → Config default) ──
alter table public.holdings
  add column if not exists equity_pct numeric;
alter table public.holdings
  drop constraint if exists holdings_equity_pct_check;
alter table public.holdings
  add constraint holdings_equity_pct_check check (
    equity_pct is null or (equity_pct >= 0 and equity_pct <= 1)
  );

-- ── (c) app_config: tunable defaults edited from the admin Configuration page ───────────────────
create table if not exists public.app_config (
  key        text        not null primary key,
  value      numeric     not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('equity_options_default',     0.90),   -- mixed positions: equity share (0.90 = 90:10)
  ('options_short_long_default', 0.20)    -- options bucket, 2 legs: short-dated share (0.20 = 20:80)
on conflict (key) do nothing;

alter table public.app_config enable row level security;
drop policy if exists "app_config_select" on public.app_config;
create policy "app_config_select" on public.app_config
  for select to authenticated using (true);
drop policy if exists "app_config_write_admin" on public.app_config;
create policy "app_config_write_admin" on public.app_config
  for all to authenticated
  using  (auth.jwt() ->> 'email' = 'cc@claudiachez.com')
  with check (auth.jwt() ->> 'email' = 'cc@claudiachez.com');

-- ── (d) trigger rewrite: replay the diary → derive the leg (now incl. trims + UPDATE/DELETE) ────
-- Replays ALL of a leg's events in (executed_at, id) order, so it is order-independent and
-- replay-safe (an edit or delete recomputes from scratch).
--   entry_price/opened_at = first BUY ; status/exit/closed = the latest closing event
--   initial_weight        = first BUY lot (tracks the diary; edit the opening row to change it)
--   weight                = Σ BUY lots − sells (the leg's CURRENT total weight). BUYs ADD their lot;
--                           a SELL's weight is the leg's remaining weight (0 on a full close).
--   realized_pnl_pct      = slice-weighted avg over SELL/EXPIRED events (slice = prior weight − this weight),
--                           so a trimmed-but-open leg carries realized from its trims
create or replace function fn_sync_leg_from_transaction()
returns trigger language plpgsql as $$
declare
  v_leg     uuid := coalesce(new.leg_id, old.leg_id);
  v_dir     text;
  v_sign    numeric;
  v_entry   numeric := null;
  v_opened  timestamptz := null;
  v_init    numeric := null;
  v_run     numeric := 0;   -- running leg weight: BUYs ADD their lot; SELL sets the remaining amount
  v_status  text := 'OPEN';
  v_exit    numeric := null;
  v_closed  timestamptz := null;
  v_reason  text := null;
  v_rtotal  numeric := 0;   -- Σ slice_weight × slice_pct
  v_rweight numeric := 0;   -- Σ slice_weight
  v_realized numeric := null;
  v_slice   numeric;
  v_first   boolean := true;
  r         public.leg_transactions%rowtype;
begin
  select direction into v_dir from public.legs where id = v_leg;
  if not found then
    return coalesce(new, old);   -- leg already gone (cascade); nothing to sync
  end if;
  v_sign := case when v_dir = 'short' then -1 else 1 end;

  for r in
    select * from public.leg_transactions where leg_id = v_leg order by executed_at, id
  loop
    if r.action_type = 'BUY' then
      -- a BUY ADDS its lot to the running leg weight (multiple buys accumulate). The per-row
      -- weight is that lot's size as the host stated it, never a running total.
      if v_first then
        v_entry := r.price; v_opened := r.executed_at; v_init := r.weight; v_first := false;
      end if;
      v_status := 'OPEN'; v_exit := null; v_closed := null; v_reason := null;
      v_run := v_run + coalesce(r.weight, 0);

    elsif r.action_type = 'SELL' then
      -- a SELL's weight is the leg's REMAINING weight after the sell (0 on a full close); the
      -- slice sold = running − remaining, and that slice books realized %.
      if v_entry is not null and v_entry <> 0 then
        v_slice := greatest(0, v_run - coalesce(r.weight, 0));
        if v_slice > 0 then
          v_rtotal  := v_rtotal + v_slice * ((r.price - v_entry) / v_entry * 100 * v_sign);
          v_rweight := v_rweight + v_slice;
        end if;
      end if;
      v_run := coalesce(r.weight, 0);
      if v_run = 0 then
        v_status := 'CLOSED'; v_exit := r.price; v_closed := r.executed_at; v_reason := r.close_reason;
      else
        v_status := 'OPEN'; v_exit := null; v_closed := null; v_reason := null;  -- trim
      end if;

    elsif r.action_type = 'EXPIRED' then
      if v_entry is not null and v_entry <> 0 and v_run > 0 then
        v_rtotal  := v_rtotal + v_run * ((0 - v_entry) / v_entry * 100 * v_sign);  -- −100% long
        v_rweight := v_rweight + v_run;
      end if;
      v_run    := 0;
      v_status := 'EXPIRED_WORTHLESS'; v_exit := 0; v_closed := r.executed_at;
      v_reason := coalesce(r.close_reason, 'EXPIRED_WORTHLESS');

    elsif r.action_type = 'EXERCISED' then
      v_run    := 0;
      v_status := 'EXERCISED'; v_exit := null; v_closed := r.executed_at; v_reason := 'EXERCISED';
      -- realized stays null: value transfers to the spawned shares leg
    end if;
  end loop;

  if v_rweight > 0 then v_realized := v_rtotal / v_rweight; end if;

  update public.legs set
    entry_price      = v_entry,
    opened_at        = v_opened,
    initial_weight   = v_init,   -- = first BUY's lot; edit the opening row to change it
    weight           = v_run,    -- = Σ BUY lots − sells (the leg's current total weight)
    status           = v_status,
    exit_price       = v_exit,
    realized_pnl_pct = v_realized,
    closed_at        = v_closed,
    close_reason     = v_reason
  where id = v_leg;

  return coalesce(new, old);
end;
$$;

-- Recreate the trigger to fire on every mutation of the diary (was: AFTER INSERT only).
drop trigger if exists trg_leg_transactions_sync on public.leg_transactions;
create trigger trg_leg_transactions_sync
  after insert or update or delete on public.leg_transactions
  for each row execute function fn_sync_leg_from_transaction();

commit;
