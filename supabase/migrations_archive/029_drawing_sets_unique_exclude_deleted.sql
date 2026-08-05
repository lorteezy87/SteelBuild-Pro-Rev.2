-- Migration 029: Fix unique constraint on drawing_sets to exclude soft-deleted rows.
--
-- The original index (migration 020) enforced uniqueness on (project_id, set_name)
-- across ALL rows, including soft-deleted ones (is_deleted = true). This caused
-- "duplicate key" errors when re-uploading a drawing set that had been previously
-- deleted. The fix adds is_deleted = false to the partial index predicate.

-- Drop the old index
DROP INDEX IF EXISTS uq_drawing_sets_project_set_name;

-- Recreate with soft-delete exclusion
CREATE UNIQUE INDEX uq_drawing_sets_project_set_name
  ON drawing_sets (project_id, set_name)
  WHERE set_name IS NOT NULL AND set_name <> '' AND is_deleted = false;
