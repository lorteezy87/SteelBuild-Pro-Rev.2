-- Operational alerts engine — server-side generation for the Alerts Center.
--
-- Before this, only RFIs had server-side alert generation (escalate_rfi_sla,
-- daily cron). Delivery and submittal alerts were created by page-visit side
-- effects in the browser (RFIs.jsx / Deliveries.tsx), so nothing fired unless
-- someone happened to open those pages — and the Alerts Center "Refresh"
-- honestly reloaded existing rows only.
--
-- This adds a deterministic rule engine that runs on a schedule AND on demand
-- (scoped, access-gated) from the Refresh button:
--
--   1. Delivery_Overdue    — scheduled but past date, not delivered/cancelled.
--                            High when > 7 days late, else Medium.
--   2. Submittal_Overdue   — required_date passed while still unreturned
--                            (Draft/Submitted/Under Review/R&R). High.
--   3. Submittal_Stalled   — sitting in Submitted/Under Review untouched for
--                            14+ days (no date discipline needed to catch it).
--                            High at 30+ days, else Medium.
--
-- Dedupe: one live (undismissed) alert per (alert_type, related_record_id).
-- Dismissing an alert suppresses regeneration for that record+type — the
-- browser generators use the same related_record_id convention, so client and
-- server never double-create.

BEGIN;

-- ── Core engine (not callable by end users directly) ────────────────────────

CREATE OR REPLACE FUNCTION public.generate_operational_alerts(p_project_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created integer := 0;
  v_batch   integer;
BEGIN
  -- 1. Overdue deliveries ----------------------------------------------------
  WITH candidates AS (
    SELECT d.id, d.project_id, d.vendor, d.po_number, d.scheduled_date, d.status,
           (CURRENT_DATE - d.scheduled_date) AS days_late,
           p.name AS project_name
      FROM public.deliveries d
      JOIN public.projects p ON p.id = d.project_id AND COALESCE(p.is_deleted, false) = false
     WHERE COALESCE(d.is_deleted, false) = false
       AND d.scheduled_date IS NOT NULL
       AND d.scheduled_date < CURRENT_DATE
       AND COALESCE(d.status, '') NOT IN ('Delivered', 'Received', 'Cancelled')
       AND (p_project_id IS NULL OR d.project_id = p_project_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.alerts a
          WHERE a.alert_type = 'Delivery_Overdue'
            AND a.related_record_id = d.id
            AND a.is_dismissed = false
       )
  )
  INSERT INTO public.alerts
    (project_id, project_name, alert_type, severity, title, description,
     entity_type, entity_id, related_record_id, metadata)
  SELECT c.project_id, c.project_name, 'Delivery_Overdue',
         CASE WHEN c.days_late > 7 THEN 'High' ELSE 'Medium' END,
         'Delivery from ' || COALESCE(NULLIF(btrim(c.vendor), ''), 'Unknown vendor')
           || ' is ' || c.days_late || 'd late',
         'Scheduled ' || c.scheduled_date || ' — PO: ' || COALESCE(c.po_number, 'TBD')
           || ' — Status: ' || COALESCE(c.status, 'Scheduled') || ' — Project: ' || COALESCE(c.project_name, ''),
         'delivery', c.id, c.id,
         jsonb_build_object('engine', 'operational_alerts', 'days_late', c.days_late)
    FROM candidates c;
  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_created := v_created + v_batch;

  -- 2. Submittals past their required date, still unreturned ------------------
  WITH candidates AS (
    SELECT s.id, s.project_id, s.submittal_number, s.title, s.required_date, s.status,
           (CURRENT_DATE - s.required_date) AS days_late,
           p.name AS project_name
      FROM public.submittals s
      JOIN public.projects p ON p.id = s.project_id AND COALESCE(p.is_deleted, false) = false
     WHERE COALESCE(s.is_deleted, false) = false
       AND s.required_date IS NOT NULL
       AND s.required_date < CURRENT_DATE
       AND s.status IN ('Draft', 'Submitted', 'Under Review', 'Revise and Resubmit')
       AND (p_project_id IS NULL OR s.project_id = p_project_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.alerts a
          WHERE a.alert_type = 'Submittal_Overdue'
            AND a.related_record_id = s.id
            AND a.is_dismissed = false
       )
  )
  INSERT INTO public.alerts
    (project_id, project_name, alert_type, severity, title, description,
     entity_type, entity_id, related_record_id, metadata)
  SELECT c.project_id, c.project_name, 'Submittal_Overdue', 'High',
         'Submittal ' || COALESCE(NULLIF(btrim(c.submittal_number), ''), left(c.id::text, 8))
           || ' is ' || c.days_late || 'd past required date',
         COALESCE(c.title, 'Untitled submittal') || ' — Required: ' || c.required_date
           || ' — Status: ' || c.status || ' — Project: ' || COALESCE(c.project_name, ''),
         'submittal', c.id, c.id,
         jsonb_build_object('engine', 'operational_alerts', 'days_late', c.days_late)
    FROM candidates c;
  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_created := v_created + v_batch;

  -- 3. Submittals stalled in review (no movement in 14+ days) -----------------
  WITH candidates AS (
    SELECT s.id, s.project_id, s.submittal_number, s.title, s.status, s.ball_in_court,
           EXTRACT(DAY FROM (now() - s.updated_at))::int AS days_idle,
           p.name AS project_name
      FROM public.submittals s
      JOIN public.projects p ON p.id = s.project_id AND COALESCE(p.is_deleted, false) = false
     WHERE COALESCE(s.is_deleted, false) = false
       AND s.status IN ('Submitted', 'Under Review')
       AND s.updated_at < now() - interval '14 days'
       AND (p_project_id IS NULL OR s.project_id = p_project_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.alerts a
          WHERE a.alert_type = 'Submittal_Stalled'
            AND a.related_record_id = s.id
            AND a.is_dismissed = false
       )
  )
  INSERT INTO public.alerts
    (project_id, project_name, alert_type, severity, title, description,
     entity_type, entity_id, related_record_id, metadata)
  SELECT c.project_id, c.project_name, 'Submittal_Stalled',
         CASE WHEN c.days_idle >= 30 THEN 'High' ELSE 'Medium' END,
         'Submittal ' || COALESCE(NULLIF(btrim(c.submittal_number), ''), left(c.id::text, 8))
           || ' stalled ' || c.days_idle || 'd in ' || c.status,
         COALESCE(c.title, 'Untitled submittal') || ' — Ball in court: '
           || COALESCE(c.ball_in_court, 'Unassigned') || ' — Project: ' || COALESCE(c.project_name, ''),
         'submittal', c.id, c.id,
         jsonb_build_object('engine', 'operational_alerts', 'days_idle', c.days_idle)
    FROM candidates c;
  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_created := v_created + v_batch;

  RETURN v_created;
END;
$$;

-- Cron/service only — end users go through the scoped wrapper below.
REVOKE ALL ON FUNCTION public.generate_operational_alerts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_operational_alerts(uuid) TO service_role;

-- ── Scoped on-demand wrapper (the Alerts Center Refresh button) ─────────────

CREATE OR REPLACE FUNCTION public.generate_project_alerts(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project id is required' USING ERRCODE = '22004';
  END IF;
  IF NOT public.user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;
  RETURN public.generate_operational_alerts(p_project_id);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_project_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_project_alerts(uuid) TO authenticated;

-- ── Schedule (guarded — no-ops when pg_cron is absent, e.g. local stacks) ────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Daily at 12:10 UTC (~5:10 AM MST) so the morning review has fresh alerts;
    -- rules are date-granular so more frequent runs add nothing.
    PERFORM cron.schedule('generate-operational-alerts', '10 12 * * *',
                          'SELECT public.generate_operational_alerts();');
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipped scheduling generate-operational-alerts';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'generate-operational-alerts scheduling skipped: %', sqlerrm;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
