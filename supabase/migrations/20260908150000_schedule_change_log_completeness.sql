-- Schedule change log — cover deletes, and snapshot the fields that matter
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §1.3, §7.6).
--
-- CORRECTION to the audit: §1.3 says the schedule has "zero audit trail". That
-- is wrong. `record_planner_action_event` has been logging every schedule_tasks
-- INSERT and UPDATE to `planner_action_events` since 2026-08-05, with
-- before/after state and the acting user — 410 updates (86 of which moved a
-- start or finish date), 206 creates, across 257 distinct tasks. The audit
-- counted `activities` rows with entity_type = 'schedule_task', but logActivity
-- writes the LABEL ('ScheduleTask'); the 245 rows that query missed are all
-- reparents and cross-link edits, which is why the underlying conclusion — that
-- no date-bearing write was recoverable — still held.
--
-- Being a database trigger, it already covers every write path: the Gantt drag,
-- the bulk toolbars, CSV/MPP import, the MCP server, and psql. And because
-- planner_action_events has a SELECT policy but NO insert policy, the only
-- writer is this SECURITY DEFINER function — the trail cannot be forged or
-- suppressed from a client. That is strictly better evidence than the app-side
-- logActivity calls the audit proposed adding, so this migration completes the
-- trigger instead of building a second, weaker trail beside it.
--
-- Three gaps closed:
--   1. DELETE was not covered at all. A deleted task simply vanished, which is
--      the single most important event to be able to explain in a delay claim.
--   2. The snapshot omitted duration, dependencies, wbs_code, phase and
--      parent_task_id — so "the logic changed" and "the durations were
--      compressed" were both invisible.
--   3. The new actuals columns were not captured.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_planner_action_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_project_id    uuid;
  v_entity_type   text;
  v_entity_id     uuid;
  v_event_type    text;
  v_before_state  jsonb;
  v_after_state   jsonb;
  v_actor_user_id uuid := (SELECT auth.uid());
  -- On DELETE there is no NEW row; every identity field must come from OLD.
  v_row           record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF TG_TABLE_NAME = 'action_items' THEN
    v_project_id  := v_row.project_id;
    v_entity_type := 'action_item';
    v_entity_id   := v_row.id;
    v_event_type  := CASE TG_OP
                       WHEN 'INSERT' THEN 'action_created'
                       WHEN 'DELETE' THEN 'action_deleted'
                       ELSE 'action_updated'
                     END;
    v_before_state := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'title', OLD.title,
      'status', OLD.status,
      'priority', OLD.priority,
      'due_date', OLD.due_date,
      'workstream', OLD.workstream,
      'action_date', OLD.action_date,
      'follow_up_date', OLD.follow_up_date,
      'impact_date', OLD.impact_date,
      'waiting_on', OLD.waiting_on,
      'assigned_user_id', OLD.assigned_user_id,
      'source_entity_type', OLD.source_entity_type,
      'source_entity_id', OLD.source_entity_id,
      'completed_at', OLD.completed_at,
      'archived_at', OLD.archived_at
    ) END;
    -- NULL after-state on a delete: the row is gone, and an after-state echoing
    -- the before-state would read as an edit that changed nothing.
    v_after_state := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'title', NEW.title,
      'status', NEW.status,
      'priority', NEW.priority,
      'due_date', NEW.due_date,
      'workstream', NEW.workstream,
      'action_date', NEW.action_date,
      'follow_up_date', NEW.follow_up_date,
      'impact_date', NEW.impact_date,
      'waiting_on', NEW.waiting_on,
      'assigned_user_id', NEW.assigned_user_id,
      'source_entity_type', NEW.source_entity_type,
      'source_entity_id', NEW.source_entity_id,
      'completed_at', NEW.completed_at,
      'archived_at', NEW.archived_at
    ) END;

  ELSIF TG_TABLE_NAME = 'schedule_tasks' THEN
    v_project_id  := v_row.project_id;
    v_entity_type := 'schedule_task';
    v_entity_id   := v_row.id;
    v_event_type  := CASE TG_OP
                       WHEN 'INSERT' THEN 'schedule_task_created'
                       WHEN 'DELETE' THEN 'schedule_task_deleted'
                       ELSE 'schedule_task_updated'
                     END;
    v_before_state := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'task_name', OLD.task_name,
      'wbs_code', OLD.wbs_code,
      'phase', OLD.phase,
      'status', OLD.status,
      'start_date', OLD.start_date,
      'end_date', OLD.end_date,
      -- Added: without these, "the durations were compressed" and "the logic
      -- changed" are both invisible in the trail.
      'duration', OLD.duration,
      'dependencies', OLD.dependencies,
      'parent_task_id', OLD.parent_task_id,
      'actual_start_date', OLD.actual_start_date,
      'actual_finish_date', OLD.actual_finish_date,
      'percent_complete', OLD.percent_complete,
      'assigned_to', OLD.assigned_to,
      'priority', OLD.priority,
      'blockers', OLD.blockers
    ) END;
    v_after_state := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'task_name', NEW.task_name,
      'wbs_code', NEW.wbs_code,
      'phase', NEW.phase,
      'status', NEW.status,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'duration', NEW.duration,
      'dependencies', NEW.dependencies,
      'parent_task_id', NEW.parent_task_id,
      'actual_start_date', NEW.actual_start_date,
      'actual_finish_date', NEW.actual_finish_date,
      'percent_complete', NEW.percent_complete,
      'assigned_to', NEW.assigned_to,
      'priority', NEW.priority,
      'blockers', NEW.blockers
    ) END;

  ELSE
    RAISE EXCEPTION 'Planner action event trigger does not support table %', TG_TABLE_NAME;
  END IF;

  IF v_actor_user_id IS NOT NULL
     AND NOT public.user_has_project_role_at_least(v_project_id, 'field') THEN
    RAISE EXCEPTION 'Planner event write requires field project access'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.planner_action_events (
    project_id, entity_type, entity_id, event_type,
    before_state, after_state, actor_user_id
  ) VALUES (
    v_project_id, v_entity_type, v_entity_id, v_event_type,
    v_before_state, v_after_state, v_actor_user_id
  );

  -- An AFTER trigger's return value is ignored, but returning NEW on a DELETE
  -- would return NULL and read as a suppressed row to anyone skimming this.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- The existing trigger covers INSERT OR UPDATE; add DELETE as its own trigger
-- so the original is left exactly as it is.
DROP TRIGGER IF EXISTS record_planner_schedule_task_delete ON public.schedule_tasks;
CREATE TRIGGER record_planner_schedule_task_delete
  AFTER DELETE ON public.schedule_tasks
  FOR EACH ROW EXECUTE FUNCTION public.record_planner_action_event();

COMMENT ON FUNCTION public.record_planner_action_event() IS
  'Append-only change log for schedule_tasks and action_items. planner_action_events has a SELECT policy but no INSERT policy, so this SECURITY DEFINER function is the only writer — the trail cannot be forged or suppressed from a client. Being a trigger, it covers every write path including imports, the MCP server and direct SQL.';

-- Reading a task''s history is "this project, this entity, newest first".
CREATE INDEX IF NOT EXISTS planner_action_events_entity_idx
  ON public.planner_action_events (project_id, entity_id, occurred_at DESC);

COMMIT;
