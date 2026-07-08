-- PROD import part 5/9: legs+diary for MITK, RNG, SHLS. Run after the previous part.
begin;
-- MITK
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',13.28,2.9,null,'2026-02-25 11:54:00','Initiated position')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',12.5,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.77,1.8,null,'2026-05-21 00:00:00','Raised weighting from 2.9% to 4.7%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('MITK','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',17.5,'2027-01-15','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',3.55,0.7,null,'2026-06-18 00:00:00','Upsized $MITK with $17.5C January 2027 @ $3.55 avg. , raises weighting to 5.4%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- RNG
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('RNG','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',50.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.63,0.5,null,'2026-05-06 09:48:00','Earnings lotto; filled over prior two sessions'),
  ('EXPIRED','Expired',0.0,0,'EXPIRED_WORTHLESS','2026-06-12 00:00:00','Expired Worthless')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- SHLS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SHLS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',10.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.95,2.0,null,'2026-05-15 11:37:00','Opened position'),
  ('SELL','Closed',1.6,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SHLS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.41,2.5,null,'2026-06-11 11:20:00','Added shares on $SHLS @ $9.41 avg. and added shares on $CXDO @ $6.93 avg. -- 2.5% weighting for each The share adds that I''m making today are replacing contracts. This is to reduce the volatility/beta of the portfolio.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
