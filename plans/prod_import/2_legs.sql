-- PROD import part 2/9: legs+diary for ADEA, ARKK, ARRY. Run after the previous part.
begin;
-- ADEA
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',30.0,'2026-06-19','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.5,0.6,null,'2026-05-15 00:00:00','I''ve taken a 2% position in the $30C for June @ $1.50 and the $30C for September @ $3.58 avg Splitted the full 2% in 80% in the longer calls'),
  ('SELL','Closed',1.5,0,null,'2026-05-15 11:37:00',null)
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',30.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',3.58,1.4,null,'2026-05-15 00:00:00','I''ve taken a 2% position in the $30C for June @ $1.50 and the $30C for September @ $3.58 avg Splitted the full 2% in 80% in the longer calls'),
  ('SELL','Closed',3.63,0,null,'2026-06-12 00:00:00','Portfolio update only shows: 5.3%: $ADEA @ $30.10 + $35C Sept ''26 @ $2.74, which suggest he closed the 30C Sep-2026 and converted to shares, since the previous full position size was 4.3%. Probably this was one of the changes we made on 6/11 but forgot to mention')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','SHARES',null,null,null,'long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',30.1,0.6,null,'2026-05-15 00:00:00','Converting my $ADEA June calls into a very small lot of equalweight shares @$30.10 , keeping the Sept $30C in full size - Since he''s replacing, assuming the same 0.4% from original position - On 5/19/26, 1:24 AM he then posts: Equity:Options $SYNA: 80:20 $VPG: 70:30 $CTS: 85:15 $FPS: 60:40 $ADEA: 30:70'),
  ('BUY','New',30.1,1.4,null,'2026-06-12 00:00:00','This position change is implied by the portfolio updates numbers. Probably this was one of the changes we made on 6/11 but forgot to mention. I''ll also assume the same entry price since it what it shows in the portfolio update.')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ADEA','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',35.0,'2026-09-18','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','Upsized',2.74,2.0,null,'2026-06-01 00:00:00','Upsized $ADEA with $35C for September @ $2.74 avg. Doubles the weighting on this one to 2.5%')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ARKK
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ARKK','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',70.0,'2026-06-18','PUT','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',0.83,1.0,null,'2026-06-11 11:07:00','Initiated hedge'),
  ('EXPIRED','Expired',0.0,0,'EXPIRED_WORTHLESS','2026-06-18 00:00:00','Expired Worthless')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);

-- ARRY
with l as (insert into public.legs (ticker,trader_id,instrument_type,option_strike,option_expiry,option_right,direction) values ('ARRY','64a779f9-13ba-4cb4-824b-d70dcab3a49b','OPTION',9.0,'2026-08-21','CALL','long') returning id)
insert into public.leg_transactions (leg_id,trader_id,action_type,action_label,price,weight,close_reason,executed_at,notes)
select l.id,'64a779f9-13ba-4cb4-824b-d70dcab3a49b'::uuid,v.action_type,v.action_label,v.price::numeric,v.weight::numeric,v.close_reason,v.executed_at::timestamptz,v.notes from l cross join (values
  ('BUY','New',1.54,1.5,null,'2026-06-04 00:00:00','New position'),
  ('SELL','Closed',0.5,0,null,'2026-06-11 11:36:00','Fully closed; tactical trade loss / chart busted')
) as v(action_type,action_label,price,weight,close_reason,executed_at,notes);
commit;
