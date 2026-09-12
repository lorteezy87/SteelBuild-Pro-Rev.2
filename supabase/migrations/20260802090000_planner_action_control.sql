-- Planner Core: server-authoritative action-control fields and immutable events.

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS workstream text,
  ADD COLUMN IF NOT EXISTS action_date date,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS impact_date date,
  ADD COLUMN IF NOT EXISTS waiting_on text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_entity_type text,
  ADD COLUMN IF NOT EXISTS source_entity_id uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'action_items_source_entity_type_check'
      AND conrelid = 'public.action_items'::regclass
  ) THEN
    ALTER TABLE public.action_items
      ADD CONSTRAINT action_items_source_entity_type_check
      CHECK (source_entity_type IS NULL OR source_entity_type IN (
        'rfi', 'submittal', 'drawing_set', 'change_order', 'work_package',
        'delivery', 'schedule_task', 'meeting'
      ));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.planner_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planner_action_events_project_occurred_at_idx
  ON public.planner_action_events (project_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_planner_action_item_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Archiving is a non-destructive state on the action record.
  IF NEW.status IN ('Complete', 'Resolved', 'Closed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_planner_action_item_state ON public.action_items;
CREATE TRIGGER normalize_planner_action_item_state
BEFORE INSERT OR UPDATE ON public.action_items
FOR EACH ROW EXECUTE FUNCTION public.normalize_planner_action_item_state();

CREATE OR REPLACE FUNCTION public.record_planner_action_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_event_type text;
  v_before_state jsonb;
  v_after_state jsonb;
  v_actor_user_id uuid := (SELECT auth.uid());
BEGIN
  IF TG_TABLE_NAME = 'action_items' THEN
    v_project_id := NEW.project_id;
    v_entity_type := 'action_item';
    v_entity_id := NEW.id;
    v_event_type := CASE WHEN TG_OP = 'INSERT' THEN 'action_created' ELSE 'action_updated' END;
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
    v_after_state := jsonb_build_object(
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
    );
  ELSIF TG_TABLE_NAME = 'schedule_tasks' THEN
    v_project_id := NEW.project_id;
    v_entity_type := 'schedule_task';
    v_entity_id := NEW.id;
    v_event_type := CASE WHEN TG_OP = 'INSERT' THEN 'schedule_task_created' ELSE 'schedule_task_updated' END;
    v_before_state := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'task_name', OLD.task_name,
      'status', OLD.status,
      'start_date', OLD.start_date,
      'end_date', OLD.end_date,
      'percent_complete', OLD.percent_complete,
      'assigned_to', OLD.assigned_to,
      'priority', OLD.priority,
      'blockers', OLD.blockers
    ) END;
    v_after_state := jsonb_build_object(
      'task_name', NEW.task_name,
      'status', NEW.status,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'percent_complete', NEW.percent_complete,
      'assigned_to', NEW.assigned_to,
      'priority', NEW.priority,
      'blockers', NEW.blockers
    );
  ELSE
    RAISE EXCEPTION 'Planner action event trigger does not support table %', TG_TABLE_NAME;
  END IF;

  IF v_actor_user_id IS NOT NULL
     AND NOT public.user_has_project_role_at_least(v_project_id, 'field') THEN
    RAISE EXCEPTION 'Planner event write requires field project access'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.planner_action_events (
    project_id,
    entity_type,
    entity_id,
    event_type,
    before_state,
    after_state,
    actor_user_id
  ) VALUES (
    v_project_id,
    v_entity_type,
    v_entity_id,
    v_event_type,
    v_before_state,
    v_after_state,
    v_actor_user_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_planner_action_item_event ON public.action_items;
CREATE TRIGGER record_planner_action_item_event
AFTER INSERT OR UPDATE ON public.action_items
FOR EACH ROW EXECUTE FUNCTION public.record_planner_action_event();

DROP TRIGGER IF EXISTS record_planner_schedule_task_event ON public.schedule_tasks;
CREATE TRIGGER record_planner_schedule_task_event
AFTER INSERT OR UPDATE ON public.schedule_tasks
FOR EACH ROW EXECUTE FUNCTION public.record_planner_action_event();

CREATE OR REPLACE FUNCTION public.guard_planner_action_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Planner action events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS guard_planner_action_event_mutation ON public.planner_action_events;
CREATE TRIGGER guard_planner_action_event_mutation
BEFORE UPDATE OR DELETE ON public.planner_action_events
FOR EACH ROW EXECUTE FUNCTION public.guard_planner_action_event_immutable();

ALTER TABLE public.planner_action_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_action_events_select ON public.planner_action_events;
CREATE POLICY planner_action_events_select
ON public.planner_action_events
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

REVOKE ALL ON TABLE public.planner_action_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.planner_action_events TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.planner_action_events FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.normalize_planner_action_item_state()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_planner_action_event()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_planner_action_event_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
