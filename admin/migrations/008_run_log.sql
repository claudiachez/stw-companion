-- 008_run_log.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- What this does:
--   Adds a run_log table the scheduled routines use as a per-channel high-water
--   mark and audit trail. Each routine run records, per Discord channel touched,
--   the timestamp/id of the newest message it processed. A later run reads the
--   latest mark for a channel and only processes messages newer than it — so the
--   3pm run skips channels the 9am run already covered (no duplicate upserts).
--
-- Identity: the scheduled skills authenticate with the Supabase service_role key,
--   which bypasses RLS. The policies below only govern the dashboard (authenticated
--   admin) so it can surface run history later. service_role needs no policy.

CREATE TABLE IF NOT EXISTS public.run_log (
  id                 BIGSERIAL PRIMARY KEY,
  run_type           TEXT NOT NULL,            -- 'morning' | 'afternoon' | 'friday' | 'gradoxx'
  channel            TEXT NOT NULL,            -- e.g. 'live-notes-portfolio'
  last_message_ts    TIMESTAMPTZ,             -- newest Discord message timestamp processed
  last_message_id    TEXT,                    -- newest Discord message id processed (if captured)
  messages_processed INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'skipped' | 'error'
  summary            TEXT,                    -- one-line human summary of the run
  ran_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.run_log                    IS 'Per-channel high-water mark + audit trail for STW scheduled routines';
COMMENT ON COLUMN public.run_log.last_message_ts    IS 'Timestamp of the newest Discord message processed for this channel/run';
COMMENT ON COLUMN public.run_log.status             IS 'ok = processed, skipped = nothing new since last mark, error = run failed';

-- High-water-mark lookup: latest processed message per channel
CREATE INDEX IF NOT EXISTS run_log_channel_ts_idx
  ON public.run_log (channel, last_message_ts DESC);

-- Recent-runs lookup for the dashboard
CREATE INDEX IF NOT EXISTS run_log_ran_at_idx
  ON public.run_log (ran_at DESC);

-- RLS: enabled, dashboard admin can read; service_role (skills) bypasses RLS.
ALTER TABLE public.run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_run_log" ON public.run_log;
CREATE POLICY "admin_read_run_log" ON public.run_log
  FOR SELECT TO authenticated
  USING (auth.email() = 'cc@claudiachez.com');
