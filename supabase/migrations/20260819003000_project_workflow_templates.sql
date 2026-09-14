-- Project workflow templates — one-call setup for a new steel job.
--
-- Every project starts empty today: no work packages, no schedule, so the
-- first hours on a new job are manual data entry that follows the same
-- pattern every time (award → detailing → approvals → procurement → fab by
-- sequence → ship → erect). This RPC applies a named template that pre-builds
-- the work-package skeleton and a dependency-ordered schedule scaffold,
-- offset from the project's start_date (falling back to today).
--
-- Templates are code-defined (versioned with the app, no template tables to
-- administer). First template: 'standard_steel' — a typical two-sequence
-- structural job with deck/misc follow-on. Cost codes are NOT touched here:
-- the 14 default steel cost codes are already seeded per project.
--
-- Safety:
--   * PM+ only (user_has_project_role_at_least).
--   * Fail-closed if the project already has live work packages or schedule
--     tasks — templates are for fresh projects, never a merge.
--   * All dates are date-typed offsets; no timezone math.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_project_template(
  p_project_id uuid,
  p_template_key text DEFAULT 'standard_steel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project      record;
  v_start        date;
  v_wp_count     integer := 0;
  v_task_count   integer := 0;
BEGIN
  IF NOT public.user_has_project_role_at_least(p_project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to apply a template to this project'
      USING ERRCODE = '42501';
  END IF;

  IF p_template_key IS DISTINCT FROM 'standard_steel' THEN
    RAISE EXCEPTION 'Unknown project template: %', p_template_key
      USING ERRCODE = '22023';
  END IF;

  SELECT id, name, start_date INTO v_project
    FROM public.projects
   WHERE id = p_project_id
     AND COALESCE(is_deleted, false) = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;

  -- Templates initialize fresh projects only — never merge into live data.
  IF EXISTS (
    SELECT 1 FROM public.work_packages
     WHERE project_id = p_project_id AND COALESCE(is_deleted, false) = false
  ) OR EXISTS (
    SELECT 1 FROM public.schedule_tasks
     WHERE project_id = p_project_id AND COALESCE(is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'Project already has work packages or schedule tasks — template not applied'
      USING ERRCODE = 'P0001';
  END IF;

  v_start := COALESCE(v_project.start_date, CURRENT_DATE);

  -- ── Work-package skeleton ──────────────────────────────────────────────
  INSERT INTO public.work_packages
    (project_id, project_name, wp_number, name, phase, status,
     scheduled_start_date, scheduled_end_date, sequence_number, notes)
  SELECT p_project_id, v_project.name, t.wp_number, t.name, t.phase, 'Not Started',
         v_start + t.start_off, v_start + t.end_off, t.seq,
         'Created from Standard Structural Steel template'
    FROM (VALUES
      ('WP-01', 'Anchor Bolts & Embeds',      'Fabrication', 14,  35, '0'),
      ('WP-02', 'Main Steel — Sequence 1',    'Fabrication', 45,  75, '1'),
      ('WP-03', 'Main Steel — Sequence 2',    'Fabrication', 60,  90, '2'),
      ('WP-04', 'Stairs, Rails & Misc Metals','Fabrication', 70, 100, '3'),
      ('WP-05', 'Joists & Deck',              'Delivery',    75, 105, '4')
    ) AS t(wp_number, name, phase, start_off, end_off, seq);
  GET DIAGNOSTICS v_wp_count = ROW_COUNT;

  -- ── Schedule scaffold (dependency-ordered, milestone-bracketed) ────────
  INSERT INTO public.schedule_tasks
    (project_id, project_name, task_name, task_type, phase, status,
     percent_complete, start_date, end_date, duration,
     is_milestone, milestone, sort_order, notes)
  SELECT p_project_id, v_project.name, t.task_name, 'Task', t.phase, 'Not Started',
         0, v_start + t.start_off, v_start + t.end_off,
         GREATEST(1, t.end_off - t.start_off),
         t.is_ms, t.is_ms, t.ord,
         'Created from Standard Structural Steel template'
    FROM (VALUES
      ('Project Kickoff / NTP',                'Detailing',    0,   0, true,  10),
      ('Detailing — Sequence 1',               'Detailing',    0,  30, false, 20),
      ('Detailing — Sequence 2',               'Detailing',   15,  45, false, 30),
      ('Shop Drawing Approval Cycle',          'Detailing',   14,  44, false, 40),
      ('Mill Order / Procurement',             'Fabrication', 14,  54, false, 50),
      ('Anchor Bolts & Embeds to Site',        'Fabrication', 14,  35, false, 60),
      ('Fabrication — Sequence 1',             'Fabrication', 45,  75, false, 70),
      ('Fabrication — Sequence 2',             'Fabrication', 60,  90, false, 80),
      ('Coatings / Galvanizing',               'Fabrication', 75,  92, false, 90),
      ('Shipping — Sequence 1',                'Delivery',    76,  82, false, 100),
      ('Erection — Sequence 1',                'Erection',    80, 100, false, 110),
      ('Shipping — Sequence 2',                'Delivery',    92,  98, false, 120),
      ('Erection — Sequence 2',                'Erection',    95, 115, false, 130),
      ('Joists & Deck Install',                'Erection',   100, 120, false, 140),
      ('Detail & Misc Steel Complete',         'Erection',   110, 125, false, 150),
      ('Steel Substantial Completion',         'Erection',   125, 125, true,  160)
    ) AS t(task_name, phase, start_off, end_off, is_ms, ord);
  GET DIAGNOSTICS v_task_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'template', p_template_key,
    'work_packages', v_wp_count,
    'schedule_tasks', v_task_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_project_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_project_template(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
