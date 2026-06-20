-- RFI workflow slice 3: automatic SLA escalation (day 7 / 14 / 21).
--
-- RFIs that sit open without a response need to escalate on a cadence rather
-- than relying on someone noticing. The urgency thresholds already exist
-- client-side (urgencyEngine: 7-day default response window) but nothing
-- *escalates* automatically. This adds a deterministic, server-authoritative
-- daily job that raises escalating in-app alerts as an open RFI ages:
--
--   * Day  7+  → "Response due"        (severity Medium)
--   * Day 14+  → "Overdue"             (severity High)
--   * Day 21+  → "Executive attention" (severity Critical)
--
-- Age is measured in days since the RFI was submitted (falling back to
-- created_at) for non-terminal RFIs (not Closed / Answered / Void). Idempotent:
-- the current tier is recorded in the alert metadata, so re-running the job does
-- nothing until the RFI crosses the next tier, at which point the prior
-- escalation is superseded and a single higher-severity alert replaces it.
--
-- Writes to the existing alerts table (surfaced by useAlerts / AlertsCenter).
-- The pre-drafted "nudge" email and the "Today's RFI Agenda" view from the spec
-- are later slices; this is the escalation backbone they hang off.
--
-- SECURITY DEFINER + pinned search_path; run by pg_cron (job owner retains
-- EXECUTE). EXECUTE revoked from anon/authenticated/public — not client-callable.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.escalate_rfi_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r          record;
  v_age      int;
  v_tier     int;
  v_prev     int;
  v_sev      text;
  v_label    text;
  v_ref      text;
  v_created  int := 0;
BEGIN
  FOR r IN
    SELECT id, project_id, project_name, rfi_number, title, question,
           ball_in_court, priority, status,
           (CURRENT_DATE - COALESCE(submitted_date, created_at::date)) AS age_days
      FROM public.rfis
     WHERE is_deleted IS NOT TRUE
       AND lower(COALESCE(status, '')) NOT IN ('closed', 'answered', 'void')
  LOOP
    v_age := r.age_days;
    IF v_age IS NULL OR v_age < 7 THEN
      CONTINUE;
    END IF;

    v_tier := CASE WHEN v_age >= 21 THEN 3 WHEN v_age >= 14 THEN 2 ELSE 1 END;

    -- Highest tier already escalated for this RFI (active alerts only).
    SELECT COALESCE(MAX((metadata -> 'sla' ->> 'tier')::int), 0)
      INTO v_prev
      FROM public.alerts
     WHERE entity_id = r.id
       AND alert_type = 'RFI_SLA_Escalation'
       AND is_dismissed = false;

    IF v_tier <= v_prev THEN
      CONTINUE;  -- already escalated to at least this tier
    END IF;

    v_sev   := CASE v_tier WHEN 3 THEN 'Critical' WHEN 2 THEN 'High' ELSE 'Medium' END;
    v_label := CASE v_tier WHEN 3 THEN 'Executive attention (21d+)'
                           WHEN 2 THEN 'Overdue (14d+)'
                           ELSE 'Response due (7d+)' END;
    v_ref   := 'RFI ' || COALESCE(NULLIF(btrim(r.rfi_number), ''), left(r.id::text, 8));

    -- Replace any lower-tier escalation so only the current tier is active.
    UPDATE public.alerts
       SET is_dismissed = true, dismissed_at = now(), status = 'Superseded'
     WHERE entity_id = r.id
       AND alert_type = 'RFI_SLA_Escalation'
       AND is_dismissed = false;

    INSERT INTO public.alerts (
      project_id, project_name, alert_type, severity, status,
      title, message, description,
      entity_type, entity_id, record_type, record_id,
      is_read, is_dismissed, metadata
    ) VALUES (
      r.project_id, r.project_name, 'RFI_SLA_Escalation', v_sev, 'Active',
      v_ref || ' — SLA: ' || v_label,
      v_ref || ' "' || COALESCE(NULLIF(btrim(r.title), ''), r.question, 'Untitled')
        || '" has been open ' || v_age || ' days'
        || COALESCE(' (ball in court: ' || NULLIF(btrim(r.ball_in_court), '') || ')', '') || '.',
      'RFI open ' || v_age || ' days without resolution',
      'rfi', r.id, 'rfi', r.id,
      false, false,
      jsonb_build_object('sla', jsonb_build_object('tier', v_tier, 'age_days', v_age))
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.escalate_rfi_sla() FROM PUBLIC, anon, authenticated;

-- Schedule daily at 13:00 UTC (idempotent).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escalate-rfi-sla') THEN
    PERFORM cron.unschedule('escalate-rfi-sla');
  END IF;
  PERFORM cron.schedule(
    'escalate-rfi-sla',
    '0 13 * * *',
    $cmd$SELECT public.escalate_rfi_sla();$cmd$
  );
END
$do$;
