-- ============================================================================
-- One-shot application of the three 2026-08-19 migrations, for the Supabase
-- SQL Editor (no CLI required).
--
-- WHY THIS FILE EXISTS
--   These three migrations are committed to supabase/migrations/ but were never
--   applied to production. Running them through the SQL Editor applies the DDL
--   but does NOT record them in supabase_migrations.schema_migrations, so a
--   later `supabase db push` would try to apply them AGAIN. This script writes
--   those ledger rows itself (last section), keeping repo files and recorded
--   versions in lockstep — the discipline in ARCHITECTURE.md → Migrations that
--   exists because this repo previously drifted to 190 unapplied files.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste ALL of this → Run.
--   Safe to run more than once: every statement is guarded (IF NOT EXISTS /
--   CREATE OR REPLACE / DROP ... IF EXISTS / ON CONFLICT DO NOTHING).
--
-- WHAT IT DOES
--   1. 20260819001000  Org members get a configurable default project role.
--                      NOTE: on apply, existing org members immediately see all
--                      workspace projects READ-ONLY. To keep invite-only
--                      behaviour, set Team → "Default project access for
--                      members" to "No automatic access" afterwards, or run:
--                        UPDATE public.organizations
--                           SET member_default_project_role = NULL;
--   2. 20260819002000  Operational alerts engine + daily 12:10 UTC pg_cron job.
--                      First run backfills alerts for currently-overdue
--                      deliveries and submittals (deduped).
--   3. 20260819003000  apply_project_template RPC (standard steel workflow).
--
-- AFTER RUNNING
--   The final SELECT prints the recorded migration versions — confirm the three
--   20260819* rows are present. Then hard-refresh the app.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 20260819001000_org_member_default_project_access.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Org members currently see ZERO projects until someone also adds them to
-- user_projects per project (org owners/admins are the only exception, since
-- 20260727012111). For a new teammate that means a completely empty app on
-- first sign-in — the documented open decision in TECH_DEBT.md
-- ("Org → project access model").
--
-- Decision implemented here: org members implicitly hold a workspace-level
-- DEFAULT ROLE on every org project when they have no explicit user_projects
-- row. The default is configurable per organization:
--
--   organizations.member_default_project_role
--     'viewer' (default) — members see all org projects read-only
--     'field' / 'pm'     — members get that working role by default
--     NULL               — legacy invite-only behavior (no implicit access)
--
-- An explicit user_projects row always WINS over the default (it can grant
-- more OR restrict below the default), and org owners/admins keep their
-- existing unconditional access. Archived (is_deleted) projects stay
-- invisible on every branch. RLS write policies still gate through
-- user_has_project_role_at_least, so a 'viewer' default grants no writes.

BEGIN;

-- ── Column + constraint ──────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS member_default_project_role text DEFAULT 'viewer';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_org_member_default_project_role;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_member_default_project_role
  CHECK (
    member_default_project_role IS NULL
    OR member_default_project_role IN ('viewer', 'field', 'pm')
  );

-- Existing orgs get the new default too: the whole point is that the founding
-- workspace's next hire sees the org's projects instead of an empty app.
UPDATE public.organizations
   SET member_default_project_role = 'viewer'
 WHERE member_default_project_role IS NULL;

-- ── user_has_project_access: org default grants visibility ──────────────────
-- (keeps the is_deleted gate and initplan-safe (select auth.uid()) from
-- 20260727012111)

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.organization_members om
      ON om.org_id = p.org_id
     AND om.user_id = (SELECT auth.uid())
    JOIN public.organizations o
      ON o.id = p.org_id
    WHERE p.id = p_project_id
      AND COALESCE(p.is_deleted, false) = false
      AND (
        om.role IN ('owner', 'admin')
        OR o.member_default_project_role IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.user_projects up
          WHERE up.project_id = p.id
            AND up.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_project_access(uuid) TO authenticated;

-- ── get_my_project_role: explicit row → org owner/admin → org default ────────

CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_projects
       WHERE user_id = (SELECT auth.uid()) AND project_id = p_project_id
       LIMIT 1),
    (SELECT om.role FROM public.projects p
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      WHERE p.id = p_project_id AND om.role IN ('owner', 'admin')
      LIMIT 1),
    (SELECT o.member_default_project_role
       FROM public.projects p
       JOIN public.organizations o ON o.id = p.org_id
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      WHERE p.id = p_project_id
      LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_project_role(uuid) TO authenticated;

-- ── user_has_project_role_at_least: org default participates in the ladder ──
-- Effective role resolution mirrors get_my_project_role exactly: an explicit
-- user_projects row WINS (even if lower than the org default), otherwise the
-- org default applies. Org owner/admin keep the unconditional bypass.

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH role_levels(name, level) AS (
    VALUES ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), explicit_role AS (
    SELECT rl.level
      FROM public.user_projects up
      JOIN role_levels rl ON rl.name = up.role
     WHERE up.user_id    = (SELECT auth.uid())
       AND up.project_id = p_project_id
  ), default_role AS (
    SELECT rl.level
      FROM public.projects p
      JOIN public.organizations o ON o.id = p.org_id
      JOIN public.organization_members om
        ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      JOIN role_levels rl ON rl.name = o.member_default_project_role
     WHERE p.id = p_project_id
  ), required AS (
    SELECT level FROM role_levels WHERE name = p_min_role
  )
  SELECT EXISTS (
           SELECT 1
             FROM public.projects p
             JOIN public.organization_members om
               ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
            WHERE p.id = p_project_id
              AND om.role IN ('owner', 'admin')
         )
      OR EXISTS (
           SELECT 1 FROM explicit_role m, required r WHERE m.level >= r.level
         )
      OR (
           NOT EXISTS (SELECT 1 FROM explicit_role)
           AND EXISTS (SELECT 1 FROM default_role d, required r WHERE d.level >= r.level)
         );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_project_role_at_least(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- 20260819002000_operational_alerts_engine.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- 20260819003000_project_workflow_templates.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- Migration ledger — record these three versions so `supabase db push` knows
-- they are applied and does not re-run them.
-- ─────────────────────────────────────────────────────────────────────────
DO $ledger$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO supabase_migrations.schema_migrations (version)
    VALUES ('20260819001000'), ('20260819002000'), ('20260819003000')
    ON CONFLICT (version) DO NOTHING;
    RAISE NOTICE 'Recorded 20260819001000 / 002000 / 003000 in schema_migrations.';
  ELSE
    RAISE NOTICE 'supabase_migrations.schema_migrations not found — ledger not updated.';
  END IF;
END
$ledger$;

-- Verification: expect the three 20260819* versions alongside the baselines.
SELECT version
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 12;
