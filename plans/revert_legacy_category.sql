-- REVERT the "Legacy Positions" category mistake (Legacy is a conviction tier, not a category).
-- Apply on SANDBOX. AMZN/HOOD/TSLA go back to Uncategorized; their Legacy status lives in
-- conviction = 0 (Tier 6), already set. Conviction is owned by the routines — untouched here.
begin;
update public.holdings set category_id = null, basket = null
  where ticker in ('AMZN','HOOD','TSLA') and basket = 'Legacy Positions';

delete from public.categories
  where name = 'Legacy Positions'
    and trader_id = '9ec36b89-6bf7-4ac7-a729-fe149d95d5c3'
    and not exists (select 1 from public.holdings h where h.category_id = categories.id);
commit;

select ticker, conviction, basket, category_id from public.holdings
  where ticker in ('AMZN','HOOD','TSLA');
