-- PROD import part 8/9: legs+diary for FPS. Run after the previous part.
begin;
-- FPS
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FPS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',34.31,1.0,null,'2026-04-21 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('FPS','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',35.0,'2026-11-20','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',8.64,1.0,null,'2026-05-15 00:00:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
