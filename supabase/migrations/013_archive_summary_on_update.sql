-- 013: auto-archive summary + bullets into conviction_comments when holdings.summary changes.
--
-- Source determination — set before each block of holdings UPDATEs inside the routine:
--
--   Morning / afternoon routines call this before updating from each source:
--     SELECT set_run_source('streaming');  -- when processing a Zoom recording
--     SELECT set_run_source('discord');    -- when processing Discord messages
--
--   If not set (fallback), the trigger defaults to 'discord'.
--   Graddox, friday, and admin UI edits do not touch summary so this never fires for them.

-- Helper: lets routines set the session variable without raw SQL
CREATE OR REPLACE FUNCTION set_run_source(source TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('stw.run_source', source, false); -- false = session-scoped
END;
$$;

-- Trigger function: archives old summary+bullets before they're overwritten
CREATE OR REPLACE FUNCTION stw_archive_holding_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source TEXT;
  v_comment TEXT;
BEGIN
  -- Skip if old summary is blank or unchanged
  IF OLD.summary IS NULL OR OLD.summary = '' THEN
    RETURN NEW;
  END IF;
  IF OLD.summary IS NOT DISTINCT FROM NEW.summary THEN
    RETURN NEW;
  END IF;

  -- Read source from session variable; default to 'discord' if not set
  v_source := COALESCE(NULLIF(current_setting('stw.run_source', true), ''), 'discord');

  -- Build archived comment: summary + bullets appended as a list
  v_comment := OLD.summary;
  IF OLD.bullets IS NOT NULL AND jsonb_array_length(OLD.bullets) > 0 THEN
    SELECT v_comment || E'\n\n' || string_agg('• ' || elem, E'\n' ORDER BY ord)
    INTO v_comment
    FROM jsonb_array_elements_text(OLD.bullets) WITH ORDINALITY AS t(elem, ord);
  END IF;

  INSERT INTO conviction_comments (ticker, event_date, conviction_level, comment, source, user_id)
  VALUES (
    OLD.ticker,
    CURRENT_DATE,
    OLD.conviction,
    v_comment,
    v_source,
    NULL  -- public note, same as admin notes
  );

  RETURN NEW;
END;
$$;

-- Fire before summary is overwritten so we capture OLD values
CREATE TRIGGER trg_archive_holding_summary
  BEFORE UPDATE OF summary ON holdings
  FOR EACH ROW
  EXECUTE FUNCTION stw_archive_holding_summary();

