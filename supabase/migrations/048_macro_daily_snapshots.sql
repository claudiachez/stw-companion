-- Migration 048: macro_daily_snapshots — standalone daily macro snapshot store.
-- Written once per weekday by the `macro-snapshot` Netlify Scheduled Function
-- (4:30pm ET / 21:30 UTC; see apps/web/netlify/functions/macro-snapshot.ts),
-- independent of any user opening the app. Backs the 5D/20D trend engine
-- (packages/ui/.../useMacroTrendHistory.ts) with cross-device history instead
-- of (or alongside) the existing per-browser localStorage fallback.
-- Schema per plans/macro_dashboard_spec.md "5D Trend Engine — v2 option".

CREATE TABLE IF NOT EXISTS public.macro_daily_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date    DATE NOT NULL UNIQUE,
  module_scores    JSONB NOT NULL DEFAULT '{}',
  indicator_scores JSONB NOT NULL DEFAULT '{}',
  event_risk       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.macro_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only for any authenticated subscriber (same data every user sees on
-- the Macro tab); writes happen only via the scheduled function's service-role
-- key, which bypasses RLS — no write policy is needed or granted here.
CREATE POLICY "macro_daily_snapshots_read" ON public.macro_daily_snapshots
  FOR SELECT TO authenticated
  USING (true);
