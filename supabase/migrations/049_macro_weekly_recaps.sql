-- Migration 049: macro_weekly_recaps — persisted weekly AI recap (Module 10).
-- Replaces the per-browser localStorage cache with one cross-device row per ISO
-- week, written only by the `macro-recap` Netlify function (apps/web/netlify/functions/macro-recap.ts)
-- using its service-role key. The function now hard-rejects regeneration requests
-- from anyone but the editor (cc@claudiachez.com) — subscribers only ever read this
-- table, never trigger generation. `admin_note` carries the optional steering text
-- the editor typed in for that regeneration ("focus more on credit this week", etc.).

CREATE TABLE IF NOT EXISTS public.macro_weekly_recaps (
  week_key     TEXT PRIMARY KEY,
  recap        JSONB NOT NULL,
  admin_note   TEXT,
  model        TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.macro_weekly_recaps ENABLE ROW LEVEL SECURITY;

-- Read-only for any authenticated subscriber (same data every user sees on the
-- Macro tab); writes happen only via the function's service-role key, which
-- bypasses RLS — no write policy is needed or granted here.
CREATE POLICY "macro_weekly_recaps_read" ON public.macro_weekly_recaps
  FOR SELECT TO authenticated
  USING (true);
