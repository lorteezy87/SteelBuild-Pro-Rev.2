-- RFI workflow slice 2: Ball-in-Court (BIC) auto-notifications.
--
-- When an RFI's ball_in_court changes, the active party should be notified
-- ("it's your turn"). Today the BIC field is tracked and displayed but nothing
-- fires on hand-off. This adds a server-authoritative, deterministic trigger so
-- the notification fires for EVERY update path (RFI page, drawing ZonePanel,
-- email inbox, bulk edits, or a direct DB change) rather than depending on one
-- client component to remember to do it.
--
-- The notification is an in-app `alerts` row (the existing notification surface
-- read by useAlerts / AlertsCenter). Channel-specific delivery (email nudges to
-- external A/E parties) is a later slice and intentionally out of scope here.
--
-- Behaviour:
--   * Fires only when ball_in_court actually changes (trigger WHEN clause).
--   * Skips when the new BIC is empty (no active party) or the RFI is terminal
--     (Closed / Void) — no point nudging on a closed item.
--   * Supersedes any prior open BIC alert for the same RFI so only the current
--     ball-in-court is active in the alert list (no pile-up on back-and-forth).
--   * Severity High when overdue or the RFI is Critical/High priority, else Medium.
--
-- SECURITY DEFINER with a pinned search_path so the alert insert is reliable on
-- every path (incl. service-role/system updates) and matches the hardened
-- trigger-function pattern (EXECUTE revoked from anon/authenticated/public — a
-- trigger function must never be REST-callable).

CREATE OR REPLACE FUNCTION public.notify_rfi_bic_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_due      date    := COALESCE(NEW.due_date, NEW.date_required);
  v_overdue  boolean := (v_due IS NOT NULL AND v_due < CURRENT_DATE);
  v_to       text    := NULLIF(btrim(NEW.ball_in_court), '');
  v_from     text    := NULLIF(btrim(OLD.ball_in_court), '');
  v_ref      text    := 'RFI ' || COALESCE(NULLIF(btrim(NEW.rfi_number), ''), left(NEW.id::text, 8));
  v_severity text;
BEGIN
  -- Only a genuine hand-off to an active party on a live RFI.
  IF v_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF lower(COALESCE(NEW.status, '')) IN ('closed', 'void') THEN
    RETURN NEW;
  END IF;

  v_severity := CASE
    WHEN v_overdue OR lower(COALESCE(NEW.priority, '')) IN ('critical', 'high') THEN 'High'
    ELSE 'Medium'
  END;

  -- Keep only the latest hand-off active for this RFI.
  UPDATE public.alerts
     SET is_dismissed = true, dismissed_at = now(), status = 'Superseded'
   WHERE entity_id = NEW.id
     AND alert_type = 'RFI_BIC_Handoff'
     AND is_dismissed = false;

  INSERT INTO public.alerts (
    project_id, project_name, alert_type, severity, status,
    title, message, description,
    entity_type, entity_id, record_type, record_id,
    is_read, is_dismissed, metadata
  ) VALUES (
    NEW.project_id, NEW.project_name, 'RFI_BIC_Handoff', v_severity, 'Active',
    v_ref || ' — ball in court: ' || v_to,
    v_ref || ' "' || COALESCE(NULLIF(btrim(NEW.title), ''), NEW.question, 'Untitled')
      || '" is now with ' || v_to
      || COALESCE(' (from ' || v_from || ')', '')
      || CASE WHEN v_due IS NOT NULL
              THEN '. Response due ' || to_char(v_due, 'YYYY-MM-DD')
                   || CASE WHEN v_overdue THEN ' (OVERDUE)' ELSE '' END || '.'
              ELSE '.' END,
    'Ball-in-court moved to ' || v_to,
    'rfi', NEW.id, 'rfi', NEW.id,
    false, false,
    jsonb_build_object('bic_handoff', jsonb_build_object(
      'from', v_from, 'to', v_to,
      'rfi_number', NEW.rfi_number, 'due_date', v_due, 'overdue', v_overdue
    ))
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_rfi_bic_handoff() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rfi_bic_handoff ON public.rfis;
CREATE TRIGGER trg_rfi_bic_handoff
  AFTER UPDATE OF ball_in_court ON public.rfis
  FOR EACH ROW
  WHEN (OLD.ball_in_court IS DISTINCT FROM NEW.ball_in_court)
  EXECUTE FUNCTION public.notify_rfi_bic_handoff();
