-- PROD import part 7/9: legs+diary for VPG, CTS, VIAV, NBIS, ENS. Run after the previous part.
begin;
-- VPG
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VPG','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',53.16,1.0,null,'2026-04-22 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VPG','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',50.0,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',9.2,0.5,null,'2026-04-22 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- CTS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CTS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',51.26,1.0,null,'2026-04-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('CTS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',50.0,'2026-10-16','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',6.28,0.5,null,'2026-05-15 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- VIAV
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('VIAV','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',14.63,3.0,null,'2025-10-24 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- NBIS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('NBIS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',23.92,7.0,null,'2025-05-09 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ENS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ENS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',116.63,5.0,null,'2025-10-13 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
