-- PROD import part 3/9: legs+diary for BB, BDC, CRNC, CXDO. Run after the previous part.
begin;
-- BB
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BB','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',6.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.87,1.3,null,'2026-05-08 00:00:00','New position'),
  ('SELL','Closed',2.61,0,null,'2026-06-10 00:00:00','Fully closed position for +300% gain')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- BDC
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BDC','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',125.85,1.5,null,'2026-04-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('BDC','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',120.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',8.68,0.5,null,'2026-06-02 13:20:00','Raised weighting above 1%; moved from prospective to active')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CRNC
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CRNC','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.98,2.5,null,'2026-06-11 11:36:00','Added shares; contract replacement principle'),
  ('BUY','Upsized',10.09,1.5,null,'2026-06-18 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CXDO
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',7.5,'2026-07-17','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.65,0.5,null,'2026-05-01 00:00:00','Opened OTM calls ahead of earnings'),
  ('SELL','Closed',0.42,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',10.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',2.24,3.4,null,'2026-06-01 13:37:00','Upsized $CXDO to 3.9% weighting by adding $10C for October at $2.24 avg. When he says "Upsized to XX%" weighting we need to reduce the previous position'),
  ('SELL','Closed',0.35,0,null,'2026-06-11 11:20:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CXDO','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.93,2.5,null,'2026-06-11 11:20:00','Added shares on $SHLS @ $9.41 avg. and added shares on $CXDO @ $6.93 avg. -- 2.5% weighting for each The share adds that I''m making today are replacing contracts. This is to reduce the volatility/beta of the portfolio.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
