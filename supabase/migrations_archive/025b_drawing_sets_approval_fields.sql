-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 025b — Move set approval state up to the parent drawing_sets row           │
-- │                                                                              │
-- │ Until now `set_approval_status` + `set_approved_date` lived on every child  │
-- │ sheet, and the UI was enforcing "all sheets in the set share the same      │
-- │ status" by writing the same value to every row. That's a denormalization   │
-- │ waiting to drift. The parent is the natural home.                          │
-- │                                                                              │
-- │ This migration:                                                              │
-- │   1. Adds set_approval_status, set_approved_date, set_approved_by,         │
-- │      set_approval_notes columns to drawing_sets                             │
-- │   2. Adds a CHECK constraint on the allowed status values                   │
-- │   3. Backfills from any existing child-side state                           │
-- │                                                                              │
-- │ The child-side columns stay for now because legacy UI and the grid view    │
-- │ still read them; they'll be dropped in migration 026 (F17 cleanup) once    │
-- │ all readers have migrated.                                                 │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS set_approval_status TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS set_approved_date   DATE;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS set_approved_by     TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS set_approval_notes  TEXT;

ALTER TABLE drawing_sets DROP CONSTRAINT IF EXISTS chk_drawing_sets_approval_status;
ALTER TABLE drawing_sets ADD  CONSTRAINT chk_drawing_sets_approval_status
  CHECK (set_approval_status IS NULL OR set_approval_status IN ('approved','rejected','superseded','pending_review'));

-- Backfill: if every active child sheet in a set agrees on a status, promote
-- that status to the parent. Mixed sets stay NULL at the parent level and the
-- UI falls back to the per-sheet value.
UPDATE drawing_sets ds
SET set_approval_status = agg.status,
    set_approved_date   = agg.approved_date,
    updated_at          = NOW()
FROM (
  SELECT
    drawing_set_id,
    MIN(set_approval_status) FILTER (WHERE set_approval_status IS NOT NULL) AS status,
    MAX(set_approved_date)                                                   AS approved_date,
    COUNT(DISTINCT set_approval_status) FILTER (WHERE set_approval_status IS NOT NULL) AS distinct_statuses
  FROM drawings
  WHERE drawing_set_id IS NOT NULL
    AND (is_deleted IS NULL OR is_deleted = FALSE)
  GROUP BY drawing_set_id
) agg
WHERE ds.id = agg.drawing_set_id
  AND agg.distinct_statuses = 1
  AND ds.set_approval_status IS NULL;
