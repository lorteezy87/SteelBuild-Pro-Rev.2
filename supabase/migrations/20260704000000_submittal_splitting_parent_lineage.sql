-- 20260704000000_submittal_splitting_parent_lineage.sql
--
-- Phase 3 of the submittal-logic integration: package SPLITTING with parent
-- lineage. An approved submittal (e.g. ARCH/MISC) can be "spun off" into new
-- child submittals (e.g. "Gate Posts", "Trash Enclosures") that link back to
-- the parent so the lineage is visible in the register + detail panel.
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS / guarded constraint /
-- CREATE INDEX IF NOT EXISTS) — safe to re-run and safe on a table with data.
-- No data backfill: every existing submittal is a top-level submittal
-- (parent_submittal_id NULL), which is exactly the pre-Phase-3 behavior.
--
-- Mirrors the standalone tracker model (C:\dev\SteelBuild-Submittal-Tracker,
-- migration 0001_init.sql): the same two columns, the same ON DELETE SET NULL
-- so deleting a parent orphans (does not cascade-delete) its children.
--
-- RLS: NO new policy. The `submittals` table already has RLS enabled with
-- per-project policies (SELECT via user_has_project_access; INSERT/UPDATE/
-- DELETE via user_has_project_role_at_least(project_id, 'field')). Those
-- row-level policies govern the whole row, so the two new columns are covered
-- automatically — a user can only read/write parent_submittal_id / split_reason
-- on submittals in projects they already have access to. Adding a blanket
-- policy here would be both redundant and a regression risk, so we don't.
--
-- NOT YET APPLIED to prod (kjrwqagyeswwoxpjkcko). The parent coordinates the
-- apply_migration + schema_migrations lockstep at review time.

-- 1. Parent link. NULL = a top-level submittal. ON DELETE SET NULL so removing
--    a parent leaves its children intact (orphaned, but still valid rows) —
--    the register surfaces them as top-level with a "(removed)" lineage hint.
ALTER TABLE public.submittals
  ADD COLUMN IF NOT EXISTS parent_submittal_id uuid
  REFERENCES public.submittals(id) ON DELETE SET NULL;

-- 2. Why the child was spun off (e.g. "Gate Posts"). NULL for non-children.
ALTER TABLE public.submittals
  ADD COLUMN IF NOT EXISTS split_reason text;

-- 3. Self-reference guard: a submittal can never be its own parent. Guarded
--    with DROP ... IF EXISTS so re-running the migration is idempotent (a bare
--    ADD CONSTRAINT would error "already exists" on the second run).
ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS chk_submittal_parent_not_self;
ALTER TABLE public.submittals
  ADD CONSTRAINT chk_submittal_parent_not_self
  CHECK (parent_submittal_id IS NULL OR parent_submittal_id <> id);

-- 4. Index the FK so "children of submittal X" (the lineage lookup the register
--    + detail panel do) is not a full-table scan as the register grows.
CREATE INDEX IF NOT EXISTS idx_submittals_parent_submittal_id
  ON public.submittals USING btree (parent_submittal_id);

COMMENT ON COLUMN public.submittals.parent_submittal_id IS
  'Phase 3 splitting: the parent submittal this row was spun off from (NULL = top-level). ON DELETE SET NULL — deleting a parent orphans, not cascades, its children.';
COMMENT ON COLUMN public.submittals.split_reason IS
  'Phase 3 splitting: why this child was spun off from its parent (e.g. "Gate Posts"). NULL for non-children.';
