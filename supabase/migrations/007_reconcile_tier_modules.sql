-- 007_reconcile_tier_modules.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Two migration lineages (web 002_user_access vs the old admin dashboard) seeded
-- `tiers.modules` with DIFFERENT values, so the live row reflected whichever ran
-- last. The web set is canonical (confirmed by the product owner). This forces the
-- tiers to the canonical module sets so the paywall (useTierAccess) is consistent.
-- Idempotent: safe to re-run.

UPDATE public.tiers SET modules = ARRAY['picks']                                   WHERE id = 'free';
UPDATE public.tiers SET modules = ARRAY['picks','signals']                         WHERE id = 'basic';
UPDATE public.tiers SET modules = ARRAY['picks','signals','portfolio','journal']   WHERE id = 'premium';
