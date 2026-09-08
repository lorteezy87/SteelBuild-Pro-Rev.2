-- Real baseline management — a table, not a JSON key
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §1.5, §7.2).
--
-- Baseline used to be three keys written into schedule_tasks.metadata:
-- baseline_start / baseline_end / baseline_set_at. That gave it no schema, no
-- constraint, no author, no reason, and — because the confirm dialog said
-- "existing baseline data will be overwritten" — exactly one baseline ever.
-- It also snapshotted the CASCADED dates rather than the dates anyone entered
-- or agreed to, and ran over the phase-filtered rows (fixed separately in
-- batch 1).
--
-- A steel project needs Baseline 0 (contract) kept forever, then one baseline
-- per approved time extension or CO impact, each with a date, an author and a
-- justification, and none of them ever overwritten. That is these two tables.
--
-- Design notes that are easy to get wrong later:
--
--   * `schedule_baseline_tasks.task_id` is deliberately NOT a foreign key.
--     Deleting a task must not erase the record that it was baselined — that
--     record is the evidence. Orphaned snapshot rows are correct here.
--   * There is no UPDATE policy on either table. A baseline that can be edited
--     after the fact is not a baseline. Correcting one means retracting it and
--     setting a new one, which leaves both in the history.
--   * Snapshots store the STORED dates (start_date / end_date), never the
--     cascaded ones. Baselining a derived date bakes today's predecessor
--     positions into the contract schedule.

BEGIN;

-- ─── schedule_baselines ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_baselines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  reason       text,
  -- Both recorded: the uuid is the durable identity, the name survives a user
  -- being removed from the org (a baseline outlives its author).
  set_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_by_name  text,
  set_at       timestamptz NOT NULL DEFAULT now(),
  task_count   integer NOT NULL DEFAULT 0,
  -- Baseline 0 — the contract schedule. Kept forever, at most one per project.
  is_original  boolean NOT NULL DEFAULT false,
  CONSTRAINT schedule_baselines_name_not_blank CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS schedule_baselines_project_set_at_idx
  ON public.schedule_baselines (project_id, set_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_baselines_one_original_uidx
  ON public.schedule_baselines (project_id)
  WHERE is_original;

COMMENT ON TABLE public.schedule_baselines IS
  'One row per baseline taken. Append-only by RLS: there is no UPDATE policy, because a baseline that can be edited after the fact is not a baseline.';
COMMENT ON COLUMN public.schedule_baselines.is_original IS
  'Baseline 0 — the contract schedule. At most one per project (partial unique index).';
COMMENT ON COLUMN public.schedule_baselines.reason IS
  'Why this baseline was taken — approved time extension, CO impact, contract award. Free text; the audit trail is the point, not the taxonomy.';

-- ─── schedule_baseline_tasks ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schedule_baseline_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id       uuid NOT NULL REFERENCES public.schedule_baselines(id) ON DELETE CASCADE,
  -- Denormalised so RLS can filter without joining the parent on every row.
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- NOT a foreign key on purpose: see the header. The snapshot must survive the
  -- task it describes.
  task_id           uuid NOT NULL,
  wbs_code          text,
  task_name         text,
  phase             text,
  baseline_start    date,
  baseline_finish   date,
  baseline_duration integer,
  is_summary        boolean NOT NULL DEFAULT false,
  CONSTRAINT schedule_baseline_tasks_range_chk CHECK (
    baseline_start IS NULL
    OR baseline_finish IS NULL
    OR baseline_finish >= baseline_start
  ),
  CONSTRAINT schedule_baseline_tasks_unique_task UNIQUE (baseline_id, task_id)
);

CREATE INDEX IF NOT EXISTS schedule_baseline_tasks_baseline_idx
  ON public.schedule_baseline_tasks (baseline_id);
CREATE INDEX IF NOT EXISTS schedule_baseline_tasks_task_idx
  ON public.schedule_baseline_tasks (project_id, task_id);

COMMENT ON COLUMN public.schedule_baseline_tasks.task_id IS
  'The schedule_tasks row this snapshot describes. Deliberately NOT a foreign key: deleting a task must not erase the evidence that it was baselined, so orphaned snapshot rows are correct.';
COMMENT ON COLUMN public.schedule_baseline_tasks.baseline_start IS
  'The task''s STORED start_date at snapshot time, never the cascaded effective date — baselining a derived date bakes today''s predecessor positions into the contract schedule (§1.5).';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Matches the schedule_tasks pattern (explicit per-command policies, no
-- blanket-true). Read needs project access; writing a baseline is a PM-level
-- act, not a field-level one, because it is a contractual artifact.
-- user_has_project_* already wrap auth.uid() in a scalar subquery, so these do
-- not trip auth_rls_initplan.

ALTER TABLE public.schedule_baselines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_baseline_tasks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_select ON public.schedule_baselines;
CREATE POLICY project_select ON public.schedule_baselines
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.schedule_baselines;
CREATE POLICY project_insert ON public.schedule_baselines
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

-- Retract a baseline set in error. There is deliberately no UPDATE policy:
-- a mistake is corrected by retracting and re-setting, which leaves both in the
-- history, not by silently editing the snapshot.
DROP POLICY IF EXISTS project_delete ON public.schedule_baselines;
CREATE POLICY project_delete ON public.schedule_baselines
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS project_select ON public.schedule_baseline_tasks;
CREATE POLICY project_select ON public.schedule_baseline_tasks
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.schedule_baseline_tasks;
CREATE POLICY project_insert ON public.schedule_baseline_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS project_delete ON public.schedule_baseline_tasks;
CREATE POLICY project_delete ON public.schedule_baseline_tasks
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));

-- ─── migrate the metadata baselines ──────────────────────────────────────────
-- 19 tasks on one project ("Phase 0 Cleanup"), all stamped within one
-- millisecond of each other on 2026-07-15 — a single Set Baseline click.
-- Grouped by project rather than by timestamp: the old shape could only hold
-- one baseline per project anyway, so per-project is exactly one row.
--
-- These snapshots carry the CASCADED dates, because that is what the old code
-- wrote. The name says so, since the numbers cannot be recovered.

INSERT INTO public.schedule_baselines (project_id, name, reason, set_by, set_by_name, set_at, task_count, is_original)
SELECT
  t.project_id,
  'Migrated baseline (' || to_char(max((t.metadata->>'baseline_set_at')::timestamptz), 'YYYY-MM-DD') || ')',
  'Migrated from schedule_tasks.metadata. The old Set Baseline snapshotted CASCADED dates, not entered ones, and recorded no author or reason — none of that can be recovered. Take a fresh baseline to get a clean contract reference.',
  NULL,
  'Unknown (migrated from metadata)',
  max((t.metadata->>'baseline_set_at')::timestamptz),
  count(*),
  false
FROM public.schedule_tasks t
WHERE (t.metadata ? 'baseline_start' OR t.metadata ? 'baseline_end')
  AND t.metadata->>'baseline_set_at' IS NOT NULL
  AND pg_input_is_valid(t.metadata->>'baseline_set_at', 'timestamptz')
  -- Idempotent: skip a project that already carries a migrated baseline.
  AND NOT EXISTS (
    SELECT 1 FROM public.schedule_baselines b
    WHERE b.project_id = t.project_id
      AND b.set_by_name = 'Unknown (migrated from metadata)'
  )
GROUP BY t.project_id;

INSERT INTO public.schedule_baseline_tasks
  (baseline_id, project_id, task_id, wbs_code, task_name, phase, baseline_start, baseline_finish, baseline_duration, is_summary)
SELECT
  b.id,
  t.project_id,
  t.id,
  t.wbs_code,
  t.task_name,
  t.phase,
  nullif(t.metadata->>'baseline_start', '')::date,
  nullif(t.metadata->>'baseline_end', '')::date,
  t.duration,
  t.is_summary
FROM public.schedule_tasks t
JOIN public.schedule_baselines b
  ON b.project_id = t.project_id
 AND b.set_by_name = 'Unknown (migrated from metadata)'
WHERE (t.metadata ? 'baseline_start' OR t.metadata ? 'baseline_end')
  AND pg_input_is_valid(coalesce(nullif(t.metadata->>'baseline_start', ''), '1970-01-01'), 'date')
  AND pg_input_is_valid(coalesce(nullif(t.metadata->>'baseline_end', ''), '1970-01-01'), 'date')
ON CONFLICT (baseline_id, task_id) DO NOTHING;

-- The metadata keys are left in place on purpose. The Gantt reads the table
-- first and falls back to metadata, so a code deploy that lands before this
-- migration is pushed still shows baselines instead of silently showing none.
-- Removing them is a follow-up once the table is confirmed populated.

-- ─── verify ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_meta_tasks integer;
  v_snapshots  integer;
  v_baselines  integer;
BEGIN
  SELECT count(*) INTO v_meta_tasks
    FROM public.schedule_tasks
   WHERE metadata ? 'baseline_start' OR metadata ? 'baseline_end';

  SELECT count(*) INTO v_snapshots FROM public.schedule_baseline_tasks;
  SELECT count(*) INTO v_baselines FROM public.schedule_baselines;

  IF v_snapshots < v_meta_tasks THEN
    RAISE EXCEPTION 'baseline migration lost rows: % metadata baselines, % snapshot rows',
      v_meta_tasks, v_snapshots;
  END IF;

  RAISE NOTICE 'baseline migration: % baseline(s), % snapshot row(s) from % metadata task(s)',
    v_baselines, v_snapshots, v_meta_tasks;
END $$;

COMMIT;
