-- IMPORT: reconciled open positions (generated from STW Transaction Ledger.xlsx). Apply in SANDBOX.
-- The 040 trigger derives entry/exit/status/initial_weight/weight/realized from these diary rows.
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

-- ADEA
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',30.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.5,0.6,null,'2026-05-15 00:00:00','I''ve taken a 2% position in the $30C for June @ $1.50 and the $30C for September @ $3.58 avg Splitted the full 2% in 80% in the longer calls'),
  ('SELL','Closed',1.5,0,null,'2026-05-15 11:37:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',30.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.58,1.4,null,'2026-05-15 00:00:00','I''ve taken a 2% position in the $30C for June @ $1.50 and the $30C for September @ $3.58 avg Splitted the full 2% in 80% in the longer calls'),
  ('SELL','Closed',3.63,0,null,'2026-06-12 00:00:00','Portfolio update only shows: 5.3%: $ADEA @ $30.10 + $35C Sept ''26 @ $2.74, which suggest he closed the 30C Sep-2026 and converted to shares, since the previous full position size was 4.3%. Probably this was one of the changes we made on 6/11 but forgot to mention')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',30.1,0.6,null,'2026-05-15 00:00:00','Converting my $ADEA June calls into a very small lot of equalweight shares @$30.10 , keeping the Sept $30C in full size - Since he''s replacing, assuming the same 0.4% from original position - On 5/19/26, 1:24 AM he then posts: Equity:Options $SYNA: 80:20 $VPG: 70:30 $CTS: 85:15 $FPS: 60:40 $ADEA: 30:70'),
  ('BUY','New',30.1,1.4,null,'2026-06-12 00:00:00','This position change is implied by the portfolio updates numbers. Probably this was one of the changes we made on 6/11 but forgot to mention. I''ll also assume the same entry price since it what it shows in the portfolio update.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',35.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',2.74,2.0,null,'2026-06-01 00:00:00','Upsized $ADEA with $35C for September @ $2.74 avg. Doubles the weighting on this one to 2.5%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ARKK
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ARKK','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',70.0,'2026-06-18','PUT','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.83,1.0,null,'2026-06-11 11:07:00','Initiated hedge'),
  ('EXPIRED','Expired',0.0,0,'EXPIRED_WORTHLESS','2026-06-18 00:00:00','Expired Worthless')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ARRY
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ARRY','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',9.0,'2026-08-21','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.54,1.5,null,'2026-06-04 00:00:00','New position'),
  ('SELL','Closed',0.5,0,null,'2026-06-11 11:36:00','Fully closed; tactical trade loss / chart busted')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- BB
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BB','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',6.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.87,1.3,null,'2026-05-08 00:00:00','New position'),
  ('SELL','Closed',2.61,0,null,'2026-06-10 00:00:00','Fully closed position for +300% gain')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- BDC
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BDC','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',125.85,1.5,null,'2026-04-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BDC','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',120.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',8.68,0.5,null,'2026-06-02 13:20:00','Raised weighting above 1%; moved from prospective to active')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CRNC
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CRNC','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.98,2.5,null,'2026-06-11 11:36:00','Added shares; contract replacement principle'),
  ('BUY','Upsized',10.09,1.5,null,'2026-06-18 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CXDO
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',7.5,'2026-07-17','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.65,0.5,null,'2026-05-01 00:00:00','Opened OTM calls ahead of earnings'),
  ('SELL','Closed',0.42,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',10.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',2.24,3.4,null,'2026-06-01 13:37:00','Upsized $CXDO to 3.9% weighting by adding $10C for October at $2.24 avg. When he says "Upsized to XX%" weighting we need to reduce the previous position'),
  ('SELL','Closed',0.35,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.93,2.5,null,'2026-06-11 11:20:00','Added shares on $SHLS @ $9.41 avg. and added shares on $CXDO @ $6.93 avg. -- 2.5% weighting for each The share adds that I''m making today are replacing contracts. This is to reduce the volatility/beta of the portfolio.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- FIVN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',22.5,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',2.67,3.5,null,'2026-05-13 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',25.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.7,2.5,null,'2026-05-28 00:00:00','Upsizing $FIVN to 6.0% weighting by adding the $25 calls for Oct @ $3.70 avg. I will be keeping the existing $22.5C for October in full size as well.'),
  ('SELL','Closed',1.85,0,null,'2026-06-11 10:40:00','Added shares, replaced contracts')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',20.48,3.5,null,'2026-06-11 10:40:00','Added $FIVN shares @ $20.48 avg. Doing this to continue to reduce volatility/beta in the portfolio. These will replace the $25C for October, but I will be keeping the $22.5C in full size. Impact on weighting is net netural. Position Weight was deducted the following way: - He closed the Oct 25C leg, with initial 2.5% weighting on 6/11 - Next day, he posts his portfolio with 7.0% weight for the whole position - Since the original calls (Oct 22.5 C) have 3.5% already, then 7% from last portfolio update minus these calls, then 3.5%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- GDYN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',5.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.1,0.5,null,'2026-05-01 00:00:00',null),
  ('SELL','Closed',1.45,0,null,'2026-06-11 14:02:00','Replaced with shares')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',5.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.51,2.0,null,'2026-05-01 00:00:00',null),
  ('SELL','Closed',2.0,0,null,'2026-06-11 14:02:00','Replaced with shares')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.34,2.5,null,'2026-06-11 14:02:00','Added shares; replacing contracts')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- IRDM
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('IRDM','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',22.5,'2026-07-17','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.35,1.5,null,'2026-02-27 00:00:00',null),
  ('SELL','Trimmed',23.45,0.9,null,'2026-06-11 00:00:00','Trims to de-risk position. Current weight was at 6.5% at the time of trimming. Calls were up +700% from entry. Weighting now at ~ 4%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- MITK
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',13.28,2.9,null,'2026-02-25 11:54:00','Initiated position')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',12.5,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.77,1.8,null,'2026-05-21 00:00:00','Raised weighting from 2.9% to 4.7%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',17.5,'2027-01-15','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.55,0.7,null,'2026-06-18 00:00:00','Upsized $MITK with $17.5C January 2027 @ $3.55 avg. , raises weighting to 5.4%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- RNG
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('RNG','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',50.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.63,0.5,null,'2026-05-06 09:48:00','Earnings lotto; filled over prior two sessions'),
  ('EXPIRED','Expired',0.0,0,'EXPIRED_WORTHLESS','2026-06-12 00:00:00','Expired Worthless')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- SHLS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SHLS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',10.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.95,2.0,null,'2026-05-15 11:37:00','Opened position'),
  ('SELL','Closed',1.6,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SHLS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.41,2.5,null,'2026-06-11 11:20:00','Added shares on $SHLS @ $9.41 avg. and added shares on $CXDO @ $6.93 avg. -- 2.5% weighting for each The share adds that I''m making today are replacing contracts. This is to reduce the volatility/beta of the portfolio.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- SYNA
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SYNA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',85.78,3.0,null,'2026-01-14 11:50:00','Initiated position'),
  ('BUY','Upsized',86.32,1.5,null,'2026-02-06 00:00:00',null),
  ('BUY','Upsized',86.14,1.0,null,'2026-02-19 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SYNA','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',85.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.9,1.0,null,'2026-01-14 11:50:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- TE
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('TE','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',7.87,6.0,null,'2026-06-11 14:41:00','Opened all-share position')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- VLN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VLN','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.57,5.5,null,'2026-04-30 11:07:00','Initiated position'),
  ('SELL','Closed',2.115,0,null,'2026-06-05 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- LEU
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('LEU','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',96.94,2.5,null,'2026-05-21 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- OSS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('OSS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',4.71,4.5,null,'2025-11-26 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- AMKR
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('AMKR','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',26.35,4.5,null,'2025-09-05 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- VPG
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VPG','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',53.16,1.0,null,'2026-04-22 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VPG','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',50.0,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.2,0.5,null,'2026-04-22 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CTS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CTS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',51.26,1.0,null,'2026-04-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CTS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',50.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.28,0.5,null,'2026-05-15 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- VIAV
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VIAV','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',14.63,3.0,null,'2025-10-24 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- NBIS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('NBIS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',23.92,7.0,null,'2025-05-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ENS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ENS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',116.63,5.0,null,'2025-10-13 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- FPS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FPS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',34.31,1.0,null,'2026-04-21 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FPS','9ec36b89-6bf7-4ac7-a729-fe149d95d5c3','OPTION',35.0,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',8.64,1.0,null,'2026-05-15 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- current_weight from todays portfolio update
update public.holdings set current_weight=11.3 where ticker='OSS';
update public.holdings set current_weight=7.6 where ticker='VPG';
update public.holdings set current_weight=5.3 where ticker='SYNA';
update public.holdings set current_weight=2.0 where ticker='CTS';
update public.holdings set current_weight=13.3 where ticker='VIAV';
update public.holdings set current_weight=5.1 where ticker='NBIS';
update public.holdings set current_weight=3.1 where ticker='BDC';
update public.holdings set current_weight=2.2 where ticker='GDYN';
update public.holdings set current_weight=8.3 where ticker='ENS';
update public.holdings set current_weight=6.6 where ticker='TE';
update public.holdings set current_weight=3.8 where ticker='SHLS';
update public.holdings set current_weight=2.8 where ticker='FPS';
update public.holdings set current_weight=13.0 where ticker='AMKR';
update public.holdings set current_weight=4.3 where ticker='ADEA';
update public.holdings set current_weight=5.9 where ticker='FIVN';
update public.holdings set current_weight=3.9 where ticker='CRNC';
update public.holdings set current_weight=3.1 where ticker='CXDO';
update public.holdings set current_weight=5.8 where ticker='MITK';
update public.holdings set current_weight=2.9 where ticker='IRDM';
update public.holdings set current_weight=1.7 where ticker='LEU';
update public.holdings set current_weight=0 where ticker='ARKK';
update public.holdings set current_weight=0 where ticker='ARRY';
update public.holdings set current_weight=0 where ticker='BB';
update public.holdings set current_weight=0 where ticker='RNG';
update public.holdings set current_weight=0 where ticker='VLN';
update public.holdings set current_weight=0.7 where ticker='AMZN';
update public.holdings set current_weight=0.9 where ticker='HOOD';
update public.holdings set current_weight=0.7 where ticker='TSLA';
commit;