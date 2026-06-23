-- PROD import part 4/9: legs+diary for FIVN, GDYN, IRDM. Run after the previous part.
begin;
-- FIVN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',22.5,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',2.67,3.5,null,'2026-05-13 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',25.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.7,2.5,null,'2026-05-28 00:00:00','Upsizing $FIVN to 6.0% weighting by adding the $25 calls for Oct @ $3.70 avg. I will be keeping the existing $22.5C for October in full size as well.'),
  ('SELL','Closed',1.85,0,null,'2026-06-11 10:40:00','Added shares, replaced contracts')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FIVN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',20.48,3.5,null,'2026-06-11 10:40:00','Added $FIVN shares @ $20.48 avg. Doing this to continue to reduce volatility/beta in the portfolio. These will replace the $25C for October, but I will be keeping the $22.5C in full size. Impact on weighting is net netural. Position Weight was deducted the following way: - He closed the Oct 25C leg, with initial 2.5% weighting on 6/11 - Next day, he posts his portfolio with 7.0% weight for the whole position - Since the original calls (Oct 22.5 C) have 3.5% already, then 7% from last portfolio update minus these calls, then 3.5%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- GDYN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',5.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.1,0.5,null,'2026-05-01 00:00:00',null),
  ('SELL','Closed',1.45,0,null,'2026-06-11 14:02:00','Replaced with shares')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',5.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.51,2.0,null,'2026-05-01 00:00:00',null),
  ('SELL','Closed',2.0,0,null,'2026-06-11 14:02:00','Replaced with shares')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('GDYN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.34,2.5,null,'2026-06-11 14:02:00','Added shares; replacing contracts')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- IRDM
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('IRDM','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',22.5,'2026-07-17','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.35,1.5,null,'2026-02-27 00:00:00',null),
  ('SELL','Trimmed',23.45,0.9,null,'2026-06-11 00:00:00','Trims to de-risk position. Current weight was at 6.5% at the time of trimming. Calls were up +700% from entry. Weighting now at ~ 4%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
