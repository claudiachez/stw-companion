-- 005_run_log.sql
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql
--
-- Per-channel high-water mark + audit trail for the STW scheduled routines. Each
-- run records, per Discord channel, the newest message it processed so later runs
-- skip already-covered channels. The dashboard reads recent rows (and, after 006,
-- the digest) for the Portfolio Overview "Latest Changes" panel.
--
-- Identity: scheduled skills authenticate with the service_role key (bypasses RLS);
-- the policy below only lets the dashboard admin read history. Ported from admin
-- lineage 008.

CREATE TABLE IF NOT EXISTS public.run_log (
  id                 BIGSERIAL PRIMARY KEY,
  run_type           TEXT NOT NULL,              -- 'morning' | 'afternoon' | 'friday' | 'gradoxx'
  channel            TEXT NOT NULL,              -- e.g. 'live-notes-portfolio'
  last_message_ts    TIMESTAMPTZ,               -- newest Discord message timestamp processed
  last_message_id    TEXT,                      -- newest Discord message id processed (if captured)
  messages_processed INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'skipped' | 'error'
  summary            TEXT,                      -- one-line human summary of the run
  ran_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.run_log                 IS 'Per-channel high-water mark + audit trail for STW scheduled routines';
COMMENT ON COLUMN public.run_log.last_message_ts IS 'Timestamp of the newest Discord message processed for this channel/run';
COMMENT ON COLUMN public.run_log.status          IS 'ok = processed, skipped = nothing new since last mark, error = run failed';

CREATE INDEX IF NOT EXISTS run_log_channel_ts_idx
  ON public.run_log (channel, last_message_ts DESC);

CREATE INDEX IF NOT EXISTS run_log_ran_at_idx
  ON public.run_log (ran_at DESC);

ALTER TABLE public.run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_run_log" ON public.run_log;
CREATE POLICY "admin_read_run_log" ON public.run_log
  FOR SELECT TO authenticated
  USING (auth.email() = 'cc@claudiachez.com');
