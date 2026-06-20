-- 061_action_items_constraint_fields.sql
--
-- Constraints page reuses the action_items table (filtered by
-- category='CONSTRAINT') for its create/edit flow. Several
-- constraint-specific fields were being written by the form but had
-- no matching column on the table, so every Constraint create / save
-- threw "Could not find the 'constraint_type' column of 'action_items'
-- in the schema cache" errors. Add the missing columns so the form
-- can persist the data first-class (rather than abusing metadata).
--
-- All four are nullable — non-constraint action_items rows leave them
-- empty, and existing rows aren't touched.

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS constraint_type   TEXT,
  ADD COLUMN IF NOT EXISTS constraint_number TEXT,
  ADD COLUMN IF NOT EXISTS project_area      TEXT,
  ADD COLUMN IF NOT EXISTS work_package_id   UUID REFERENCES public.work_packages(id) ON DELETE SET NULL;

-- Index the FK so the constraints list (which often joins back to
-- work_packages by id) doesn't seq-scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_action_items_work_package_id
  ON public.action_items(work_package_id)
  WHERE work_package_id IS NOT NULL;

-- And an index on constraint_type so the per-type filter chips on the
-- Constraints page stay fast.
CREATE INDEX IF NOT EXISTS idx_action_items_constraint_type
  ON public.action_items(constraint_type)
  WHERE constraint_type IS NOT NULL;
