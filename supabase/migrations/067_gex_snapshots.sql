-- GEX snapshots: one row per session (am/pm) per underlying, holding the derived
-- gamma-exposure levels from FlashAlpha's GEX endpoint. Written only by the
-- `gex-snapshot` Netlify scheduled function (service-role key, ~twice each
-- weekday); subscribers read via the authenticated RLS grant below.
--
-- Why a scheduled writer + a table (not a per-browser proxy like `fred`): the
-- FlashAlpha free tier is 5 requests/DAY, so the browser can never call it
-- directly — the writer spends ~2 requests/day and every client reads Supabase.
--
-- The free tier serves SPY only (single expiry); `symbol` is stored so a future
-- paid-tier upgrade to SPX slots in without a schema change.

CREATE TABLE IF NOT EXISTS public.gex_snapshots (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date    date        NOT NULL,
  session          text        NOT NULL CHECK (session IN ('am', 'pm')),
  symbol           text        NOT NULL DEFAULT 'SPY',
  underlying_price numeric,
  gamma_flip       numeric,
  net_gex          numeric,
  net_gex_label    text        CHECK (net_gex_label IN ('positive', 'negative') OR net_gex_label IS NULL),
  call_wall        numeric,
  put_wall         numeric,
  -- GEX sleeve score (0–100) fed into the Market Regime composite, persisted so
  -- the macro-snapshot writer and the live UI agree on the same number.
  sleeve_score     integer,
  as_of            timestamptz,
  raw              jsonb,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (symbol, snapshot_date, session)
);

CREATE INDEX IF NOT EXISTS gex_snapshots_symbol_date_idx
  ON public.gex_snapshots (symbol, snapshot_date DESC, session);

-- Only authenticated users may read; no client writes (service-role only).
ALTER TABLE public.gex_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read gex snapshots"
  ON public.gex_snapshots
  FOR SELECT
  TO authenticated
  USING (true);
