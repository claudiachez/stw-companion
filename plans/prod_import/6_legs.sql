-- PROD import part 6/9: legs+diary for SYNA, TE, VLN, LEU, OSS, AMKR. Run after the previous part.
begin;
-- SYNA
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SYNA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',85.78,3.0,null,'2026-01-14 11:50:00','Initiated position'),
  ('BUY','Upsized',86.32,1.5,null,'2026-02-06 00:00:00',null),
  ('BUY','Upsized',86.14,1.0,null,'2026-02-19 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('SYNA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',85.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.9,1.0,null,'2026-01-14 11:50:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- TE
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('TE','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',7.87,6.0,null,'2026-06-11 14:41:00','Opened all-share position')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- VLN
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VLN','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.57,5.5,null,'2026-04-30 11:07:00','Initiated position'),
  ('SELL','Closed',2.115,0,null,'2026-06-05 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- LEU
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('LEU','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',96.94,2.5,null,'2026-05-21 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- OSS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('OSS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',4.71,4.5,null,'2025-11-26 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- AMKR
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('AMKR','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',26.35,4.5,null,'2025-09-05 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
