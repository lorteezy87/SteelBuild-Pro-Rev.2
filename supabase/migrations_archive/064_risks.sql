-- 064_risks.sql
--
-- Project Risk Register — first-class table backing the four Risk
-- reports (list, dashboard, 5x5 matrix, top-10) on the Reports module.
--
-- Severity is computed inline from probability * impact (1..25) and
-- stored on the row so dashboards / matrices / sort can read a single
-- column instead of re-deriving the formula in three different places:
--
--    score >= 20 → 'Critical'    (red)
--    score >= 12 → 'High'        (amber)
--    score >=  6 → 'Medium'      (review)
--    else        → 'Low'         (green)
--
-- The "score" itself (probability * impact) is derived in the UI as
-- needed — keeping it out of the DB avoids a second generated column
-- since callers always read probability + impact alongside it anyway.
--
-- Status is a CHECK constraint rather than a Postgres ENUM so values
-- can be added/removed without ALTER TYPE gymnastics. Same approach as
-- the project job_type CHECK in 063 and the schedule_tasks status set.
--
-- Soft-delete columns + RLS membership pattern mirror work_packages
-- (migration 011) and budget_hour_items (062).

CREATE TABLE IF NOT EXISTS public.risks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT,                                   -- Schedule | Cost | Safety | Quality | Scope | Resource | External | Other
  probability         INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact              INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  severity            TEXT GENERATED ALWAYS AS (
    CASE
      WHEN probability * impact >= 20 THEN 'Critical'
      WHEN probability * impact >= 12 THEN 'High'
      WHEN probability * impact >=  6 THEN 'Medium'
      ELSE 'Low'
    END
  ) STORED,
  status              TEXT NOT NULL DEFAULT 'Open' CHECK (status IN (
    'Open', 'Mitigating', 'Mitigated', 'Closed', 'Accepted', 'Transferred'
  )),
  mitigation_plan     TEXT,
  contingency_plan    TEXT,
  owner               TEXT,                                   -- free text or contact name
  identified_date     DATE DEFAULT CURRENT_DATE,
  target_close_date   DATE,
  closed_date         DATE,
  trigger_event       TEXT,
  notes               TEXT,
  metadata            JSONB DEFAULT '{}'::jsonb,
  is_deleted          BOOLEAN DEFAULT FALSE,
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS risks_project_idx
  ON public.risks(project_id)
  WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS risks_severity_idx
  ON public.risks(severity)
  WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS risks_status_idx
  ON public.risks(status)
  WHERE is_deleted IS NOT TRUE;

-- Updated-at trigger using the existing helper from 001_initial_schema.
DROP TRIGGER IF EXISTS set_updated_at_risks ON public.risks;
CREATE TRIGGER set_updated_at_risks
  BEFORE UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────
-- Reads are open to any project member.
-- Writes/deletes are restricted to write-capable roles.
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_member_access" ON public.risks;
DROP POLICY IF EXISTS "project_member_read" ON public.risks;
DROP POLICY IF EXISTS "project_member_write_insert" ON public.risks;
DROP POLICY IF EXISTS "project_member_write_update" ON public.risks;
DROP POLICY IF EXISTS "project_member_write_delete" ON public.risks;

CREATE POLICY "project_member_read" ON public.risks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = risks.project_id
    )
  );

CREATE POLICY "project_member_write_insert" ON public.risks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = risks.project_id
        AND user_projects.role IN ('owner', 'admin', 'pm', 'field')
    )
  );

CREATE POLICY "project_member_write_update" ON public.risks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = risks.project_id
        AND user_projects.role IN ('owner', 'admin', 'pm', 'field')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = risks.project_id
        AND user_projects.role IN ('owner', 'admin', 'pm', 'field')
    )
  );

CREATE POLICY "project_member_write_delete" ON public.risks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = risks.project_id
        AND user_projects.role IN ('owner', 'admin', 'pm', 'field')
    )
  );
