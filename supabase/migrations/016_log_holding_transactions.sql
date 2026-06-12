-- 016: auto-log a holding_transactions row whenever a holdings position changes.
--
-- WHY: holding_transactions (the per-ticker Transaction History timeline) was previously
-- written only by the admin Edit form. The scheduled routines (Discord / Friday runs /
-- streaming) update `holdings` directly and never logged a transaction, so the timeline
-- stayed empty for nearly every real position change. A database trigger captures EVERY
-- writer — admin UI and external scripts alike — with zero changes to those scripts.
--
-- NOTE on migration 015: that retired a BEFORE-UPDATE trigger for *conviction* archiving
-- because it mis-stamped source/date and double-logged. Neither problem applies here:
-- a transaction's action + date come from explicit `holdings` columns (last_action,
-- action_date), there is no "source" attribution, and the dedupe guard below + making the
-- trigger the *sole* writer (the form's inline insert is removed) prevent double-logging.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/usmqbohcjcyszjxxvnqu/sql

CREATE OR REPLACE FUNCTION stw_log_holding_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_leg    INTEGER;
  v_leg        INTEGER;
  v_is_reentry BOOLEAN;
  v_exists     BOOLEAN;
BEGIN
  -- Only log real action events — never the implicit Hold state or the CASH balance row.
  IF NEW.last_action IS NULL OR NEW.last_action = 'Hold' OR NEW.ticker = 'CASH' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, fire only when the action or its date actually changed (weight-only Friday
  -- runs leave last_action/action_date untouched and must not produce a transaction).
  IF TG_OP = 'UPDATE'
     AND NEW.last_action IS NOT DISTINCT FROM OLD.last_action
     AND NEW.action_date IS NOT DISTINCT FROM OLD.action_date THEN
    RETURN NEW;
  END IF;

  -- Leg: a re-entry (New after a prior Closed) starts a fresh leg; otherwise the current
  -- max (default 1). Mirrors fetchMaxLeg + the re-entry logic in HoldingEditForm.
  SELECT COALESCE(MAX(leg), 1) INTO v_max_leg
  FROM holding_transactions WHERE ticker = NEW.ticker;

  v_is_reentry := (NEW.last_action = 'New' AND TG_OP = 'UPDATE' AND OLD.last_action = 'Closed');
  v_leg := CASE WHEN v_is_reentry THEN v_max_leg + 1 ELSE v_max_leg END;

  -- Dedupe: an idempotent script re-run writing the same action/date must not duplicate.
  SELECT EXISTS (
    SELECT 1 FROM holding_transactions
    WHERE ticker = NEW.ticker
      AND leg = v_leg
      AND action = NEW.last_action
      AND event_date = COALESCE(NEW.action_date, CURRENT_DATE)
  ) INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO holding_transactions
    (ticker, leg, action, event_date, weight, position_detail, price, pnl_pct, notes)
  VALUES (
    NEW.ticker,
    v_leg,
    NEW.last_action,
    COALESCE(NEW.action_date, CURRENT_DATE),
    NEW.current_weight,
    NEW.position_detail,
    NEW.last_price,
    CASE WHEN NEW.last_action = 'Closed' THEN NEW.exit_pnl_pct ELSE NULL END,
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_holding_transaction ON holdings;

CREATE TRIGGER trg_log_holding_transaction
  AFTER INSERT OR UPDATE ON holdings
  FOR EACH ROW
  EXECUTE FUNCTION stw_log_holding_transaction();
