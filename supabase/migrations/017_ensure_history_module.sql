-- 017: re-assert the 'history' module on the premium tier (defensive).
--
-- WHY: migration 007 hardcodes the premium tier's modules WITHOUT 'history', while 011
-- appends it. If 007 is ever re-run after 011, premium subscribers silently lose the
-- Transaction History + Conviction timelines on the web app. This idempotent re-assert
-- guards against that ordering hazard. Safe to run repeatedly.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

UPDATE public.tiers
  SET modules = array_append(modules, 'history')
  WHERE id = 'premium' AND NOT ('history' = ANY(modules));
