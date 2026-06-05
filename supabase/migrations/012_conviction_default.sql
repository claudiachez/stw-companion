-- Set conviction default to 3 (Moderate) so new holdings without an explicit
-- conviction level don't fall into the unrendered null bucket or appear as Legacy.
ALTER TABLE public.holdings
  ALTER COLUMN conviction SET DEFAULT 3;

-- Patch holdings where conviction was never set (null) — treat as Moderate.
UPDATE public.holdings
  SET conviction = 3
  WHERE conviction IS NULL;
