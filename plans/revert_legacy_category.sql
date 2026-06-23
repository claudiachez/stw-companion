-- Remove the "Legacy Positions" category (Legacy is a CONVICTION tier, not a category).
-- Env-agnostic (trader resolved by name) — run on SANDBOX *and* PROD. On PROD the category is
-- pre-existing from the old system; AMZN/HOOD/TSLA reference it and go back to Uncategorized.
-- Their Legacy status lives in conviction (Tier 6 / c0). Conviction is owned by the routines.
begin;
-- null out every holding still pointing at a Legacy Positions category (by name, any trader)
update public.holdings set category_id = null, basket = null
  where category_id in (select id from public.categories where name = 'Legacy Positions')
     or basket = 'Legacy Positions';

delete from public.categories
  where name = 'Legacy Positions'
    and not exists (select 1 from public.holdings h where h.category_id = categories.id);
commit;

select ticker, conviction, basket, category_id from public.holdings
  where ticker in ('AMZN','HOOD','TSLA');
