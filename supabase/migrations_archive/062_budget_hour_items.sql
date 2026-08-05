-- 062_budget_hour_items.sql
--
-- Per-project budget vs actual hours table — mirrors the categories on
-- the S&H Estimating Kickoff sheet (Columns / Beams / Joists / etc),
-- with shop and field hours tracked separately so PMs can see where
-- the job is bleeding hours against the bid.
--
-- Soft-delete + sort-order so rows can be reordered and removed
-- without losing history. `metadata` JSONB carries the "Misses / Gap
-- in Scope" notes plus optional `linked_work_package_ids` so a row's
-- actuals can roll up from one or more work_packages instead of being
-- entered manually.
--
-- RLS mirrors work_packages (migration 011): project-scoped membership
-- via the user_projects join table. New tables that follow the same
-- pattern can copy this block verbatim.

CREATE TABLE IF NOT EXISTS public.budget_hour_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category             TEXT NOT NULL,           -- 'Standard' | 'Specialty' | 'Header' | 'Misses'
  scope_item           TEXT NOT NULL,           -- 'Columns', 'Joists', 'Roof Ladder', etc
  sort_order           INTEGER DEFAULT 0,
  is_specialty         BOOLEAN DEFAULT FALSE,
  shop_hours_budget    NUMERIC(10,2) DEFAULT 0,
  shop_hours_actual    NUMERIC(10,2) DEFAULT 0,
  field_hours_budget   NUMERIC(10,2) DEFAULT 0,
  field_hours_actual   NUMERIC(10,2) DEFAULT 0,
  notes                TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  is_deleted           BOOLEAN DEFAULT FALSE,
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS budget_hour_items_project_idx
  ON public.budget_hour_items(project_id)
  WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS budget_hour_items_sort_idx
  ON public.budget_hour_items(project_id, sort_order)
  WHERE is_deleted IS NOT TRUE;

-- Updated-at trigger using the existing helper from 001_initial_schema.
DROP TRIGGER IF EXISTS set_updated_at_budget_hour_items ON public.budget_hour_items;
CREATE TRIGGER set_updated_at_budget_hour_items
  BEFORE UPDATE ON public.budget_hour_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────
-- Same membership pattern as work_packages (see 011_rls_project_isolation).
ALTER TABLE public.budget_hour_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_member_access" ON public.budget_hour_items;
CREATE POLICY "project_member_access" ON public.budget_hour_items
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = budget_hour_items.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = budget_hour_items.project_id
    )
  );
