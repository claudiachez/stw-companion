-- PROD import part 1/9: clean-slate wipe. Run FIRST.
-- If ANY later part errors, just re-run from this file (it wipes everything clean).
begin;
-- Full clean slate: wipe ALL legs + diary so the end state is exactly the 42 imported legs
-- (matches SANDBOX = 25 tickers / 42 legs). PROD still carried 28 stale legs from the old
-- 029/030 system; the previous scoped delete would have left them orphaned with empty diaries.
-- Disable the sync trigger during the wipe so deleting each diary row does NOT replay the
-- trigger (109 replays = the likely cause of the SQL-editor "Failed to fetch" timeout).
-- Holdings rows are NOT deleted (kept for closed/legacy tickers) except the ZZ test rows.
alter table public.leg_transactions disable trigger trg_leg_transactions_sync;
delete from public.leg_transactions;
delete from public.legs;
delete from public.holdings where ticker in ('ZZADEA','ZZT1','ZZT2');
alter table public.leg_transactions enable trigger trg_leg_transactions_sync;
commit;
