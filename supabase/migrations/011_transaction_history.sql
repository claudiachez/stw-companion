-- holding_transactions: full lifecycle of each position
-- action drives presentation: New=entry, Closed=exit, others=change
CREATE TABLE holding_transactions (
  id              BIGSERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  leg             INTEGER NOT NULL DEFAULT 1,
  action          TEXT NOT NULL CHECK (action IN ('New', 'Upsized', 'Trimmed', 'Hold', 'Closed')),
  event_date      DATE NOT NULL,
  weight          NUMERIC,
  position_detail TEXT,
  price           NUMERIC,
  pnl_pct         NUMERIC,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- conviction_comments: conviction evolution per ticker
CREATE TABLE conviction_comments (
  id              BIGSERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  event_date      DATE NOT NULL,
  conviction_level INTEGER NOT NULL CHECK (conviction_level BETWEEN 0 AND 5),
  comment         TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('discord', 'streaming', 'manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for holding_transactions
ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ht_authenticated_read" ON holding_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ht_admin_write" ON holding_transactions
  FOR ALL TO authenticated
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
  )
  WITH CHECK (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
  );

-- Add 'history' module to the premium tier (transaction + conviction timelines)
UPDATE public.tiers
  SET modules = array_append(modules, 'history')
  WHERE id = 'premium' AND NOT ('history' = ANY(modules));

-- RLS for conviction_comments
ALTER TABLE conviction_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_authenticated_read" ON conviction_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cc_admin_write" ON conviction_comments
  FOR ALL TO authenticated
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
  )
  WITH CHECK (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
  );
