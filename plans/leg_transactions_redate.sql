-- Re-date leg_transactions.executed_at to the true open dates (CLAUDE.md Next Steps #3).
--
-- WHY: the legs rebuild seeded `leg_transactions.executed_at` with *proxy* dates (mostly the
-- weekly-snapshot date, e.g. 2026-05-01 / 2026-06-11), while `legs.opened_at` was later corrected to
-- the true open date. The Transaction History (LegTimeline) reads `leg_transactions`, so its dates lag
-- the corrected `legs.opened_at`. This aligns the BUY (open) events to `legs.opened_at`.
--
-- SCOPE (verified against prod 2026-06-17):
--   * 0 legs have >1 BUY  → setting each BUY's executed_at to its leg.opened_at is unambiguous.
--   * 23 of 71 BUY rows differ from legs.opened_at  → only those are touched (idempotent guard below).
--   * SELL/EXPIRED (close) events: 0 mismatches — they ALREADY equal legs.closed_at, so no update
--     is needed on the close side. (Statement 2 is included for completeness / future re-runs; it is
--     a no-op today.)
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

begin;

-- 1) BUY (open) events → the leg's true open date.
update public.leg_transactions lt
set executed_at = l.opened_at
from public.legs l
where lt.leg_id = l.id
  and lt.action_type = 'BUY'
  and l.opened_at is not null
  and lt.executed_at is distinct from l.opened_at;   -- touches only the 23 stale rows; safe to re-run

-- 2) Close events (SELL / EXPIRED) → the leg's true close date. No-op today (already aligned),
--    kept so a future rebuild stays self-correcting.
update public.leg_transactions lt
set executed_at = l.closed_at
from public.legs l
where lt.leg_id = l.id
  and lt.action_type in ('SELL', 'EXPIRED')
  and l.closed_at is not null
  and lt.executed_at is distinct from l.closed_at;

commit;

-- VERIFY (expect 0 rows): any BUY still off its leg's open date —
--   select lt.id, l.ticker, lt.executed_at, l.opened_at
--   from public.leg_transactions lt join public.legs l on l.id = lt.leg_id
--   where lt.action_type = 'BUY' and lt.executed_at is distinct from l.opened_at;
