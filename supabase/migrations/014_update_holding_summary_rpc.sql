-- 014: wrapper RPC for routines to update holdings.summary with correct source attribution.
--
-- WHY: Supabase uses PgBouncer in transaction-pooling mode by default. A plain
-- set_run_source() RPC followed by a separate UPDATE gets two separate transactions
-- on potentially different connections — the trigger would see an empty session var
-- and fall back to 'discord'. This wrapper sets the source transaction-locally and
-- performs the UPDATE in the same call, so the trigger always sees the right source.
--
-- ROUTINE USAGE:
--   supabase.rpc('update_holding_summary', {
--     'p_ticker':  ticker,
--     'p_summary': summary_text,
--     'p_bullets': bullets_jsonb,   # list of strings as JSON array, e.g. '["bullet1","bullet2"]'
--     'p_source':  'streaming'      # or 'discord'
--   }).execute()

CREATE OR REPLACE FUNCTION update_holding_summary(
  p_ticker  TEXT,
  p_summary TEXT,
  p_bullets JSONB        DEFAULT '[]'::JSONB,
  p_source  TEXT         DEFAULT 'discord'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- true = local to current transaction; survives under connection pooling
  PERFORM set_config('stw.run_source', p_source, true);

  UPDATE holdings
    SET summary = p_summary,
        bullets = p_bullets
  WHERE ticker = p_ticker;
END;
$$;
