CREATE OR REPLACE FUNCTION public.escalate_rfi_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    SELECT COALESCE(MAX((metadata -> 'sla' ->> 'tier')::int), 0)
      INTO v_prev
      FROM public.alerts
     WHERE entity_id = r.id
       AND alert_type = 'RFI_SLA_Escalation'
       AND is_dismissed = false;

    IF v_tier <= v_prev THEN
      CONTINUE;
    END IF;

    v_sev   := CASE v_tier WHEN 3 THEN 'Critical' WHEN 2 THEN 'High' ELSE 'Medium' END;
    v_label := CASE v_tier WHEN 3 THEN 'Executive attention (21d+)'
                           WHEN 2 THEN 'Overdue (14d+)'
                           ELSE 'Response due (7d+)' END;
    v_ref   := 'RFI ' || COALESCE(NULLIF(btrim(r.rfi_number), ''), left(r.id::text, 8));

    -- Retire the lower-tier alert. `status` is intentionally NOT set here:
    -- see supabase/migrations/20260905120000_fix_alerts_superseded_status.sql.
    UPDATE public.alerts
       SET is_dismissed = true, dismissed_at = now()
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
$function$;


CREATE OR REPLACE FUNCTION public.notify_rfi_bic_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_due      date    := COALESCE(NEW.due_date, NEW.date_required);
  v_overdue  boolean := (v_due IS NOT NULL AND v_due < CURRENT_DATE);
  v_to       text    := NULLIF(btrim(NEW.ball_in_court), '');
  v_from     text    := NULLIF(btrim(OLD.ball_in_court), '');
  v_ref      text    := 'RFI ' || COALESCE(NULLIF(btrim(NEW.rfi_number), ''), left(NEW.id::text, 8));
  v_severity text;
BEGIN
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

  -- Retire the previous hand-off alert. `status` is intentionally NOT set
  -- here. This is the statement that made a second ball-in-court change on
  -- the same RFI fail outright.
  UPDATE public.alerts
     SET is_dismissed = true, dismissed_at = now()
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
$function$;