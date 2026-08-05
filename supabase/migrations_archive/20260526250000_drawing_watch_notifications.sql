-- 20260526250000_drawing_watch_notifications.sql
-- Watched-sheet notifications (Drawing Control module, Phase 3). When a sheet
-- with >=1 watcher (drawing_watchers) gets a new revision, is released, or gets
-- a new impact, generate a project alert that surfaces in the bell. The alerts
-- table is project-wide (no per-recipient column), so one alert per change is
-- created; only WATCHED sheets generate them, so unwatched drawing activity
-- stays quiet. Trigger functions are SECURITY DEFINER (read drawing_watchers +
-- write alerts) with fixed search_path; they take no args / return trigger and
-- are not RPC-exposed. Applied live via Supabase MCP.

CREATE OR REPLACE FUNCTION public.drawing_watch_notify_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_watchers int;
  v_sheet text;
BEGIN
  SELECT count(*) INTO v_watchers FROM public.drawing_watchers w WHERE w.drawing_id = NEW.drawing_id;
  IF v_watchers = 0 THEN RETURN NEW; END IF;
  v_sheet := COALESCE(NEW.sheet_number, '(sheet)');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
      entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
    VALUES (NEW.project_id, 'Drawing_Revision', 'Medium', 'Active',
      'Watched sheet: new revision',
      v_sheet || ' Rev ' || COALESCE(NEW.revision_code, '') || ' received',
      'A new revision was logged on a sheet you are watching.',
      'drawing', NEW.drawing_id, 'drawing', NEW.drawing_id, false, false,
      jsonb_build_object('drawing_id', NEW.drawing_id, 'revision_id', NEW.id,
                         'revision_code', NEW.revision_code, 'watchers', v_watchers));
  ELSIF TG_OP = 'UPDATE'
        AND NEW.release_status IS DISTINCT FROM OLD.release_status
        AND NEW.release_status LIKE 'released_%' THEN
    INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
      entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
    VALUES (NEW.project_id, 'Drawing_Released', 'Medium', 'Active',
      'Watched sheet released',
      v_sheet || ' -> ' || replace(NEW.release_status, '_', ' '),
      'A sheet you are watching was released.',
      'drawing', NEW.drawing_id, 'drawing', NEW.drawing_id, false, false,
      jsonb_build_object('drawing_id', NEW.drawing_id, 'revision_id', NEW.id,
                         'release_status', NEW.release_status, 'watchers', v_watchers));
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.drawing_watch_notify_impact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_watchers int; v_drawing uuid; v_sheet text; v_sev text;
BEGIN
  SELECT r.drawing_id, r.sheet_number INTO v_drawing, v_sheet
    FROM public.drawing_revisions r WHERE r.id = NEW.drawing_revision_id;
  IF v_drawing IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_watchers FROM public.drawing_watchers w WHERE w.drawing_id = v_drawing;
  IF v_watchers = 0 THEN RETURN NEW; END IF;
  v_sev := CASE NEW.priority WHEN 'critical' THEN 'Critical' WHEN 'high' THEN 'High' ELSE 'Medium' END;

  INSERT INTO public.alerts (project_id, alert_type, severity, status, title, message, description,
    entity_type, entity_id, record_type, record_id, is_read, is_dismissed, metadata)
  VALUES (NEW.project_id, 'Drawing_Impact', v_sev, 'Active',
    'Watched sheet: new impact',
    replace(NEW.impact_type, '_', ' ') || ' on ' || COALESCE(v_sheet, '(sheet)'),
    NEW.title,
    'drawing', v_drawing, 'drawing', v_drawing, false, false,
    jsonb_build_object('drawing_id', v_drawing, 'impact_id', NEW.id,
                       'impact_type', NEW.impact_type, 'priority', NEW.priority, 'watchers', v_watchers));
  RETURN NEW;
END $fn$;

CREATE OR REPLACE TRIGGER trg_drawing_watch_notify_revision
  AFTER INSERT OR UPDATE OF release_status ON public.drawing_revisions
  FOR EACH ROW EXECUTE FUNCTION public.drawing_watch_notify_revision();

CREATE OR REPLACE TRIGGER trg_drawing_watch_notify_impact
  AFTER INSERT ON public.drawing_impacts
  FOR EACH ROW EXECUTE FUNCTION public.drawing_watch_notify_impact();
