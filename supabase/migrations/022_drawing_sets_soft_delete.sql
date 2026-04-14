-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 022 — Drawing Sets: soft-delete columns + cascade helper RPC                │
-- │                                                                              │
-- │ Adds is_deleted/deleted_at to drawing_sets so we can soft-delete an entire  │
-- │ parent set (and all its child drawings) from the UI without losing history. │
-- │                                                                              │
-- │ Also ships `delete_drawing_set(p_set_id)` — a single RPC that:              │
-- │   1. Flags the drawing_sets row as deleted                                   │
-- │   2. Flags every non-deleted drawings row under that set as deleted         │
-- │   3. Returns the number of child sheets that were soft-deleted              │
-- │                                                                              │
-- │ The UI calls this RPC instead of iterating rows client-side, so the whole   │
-- │ delete is a single transaction and the drawing_sets count trigger fires     │
-- │ cleanly.                                                                     │
-- ╰────────────────────────────────────────────────────────────────────────────╯

-- ─── 1. Soft-delete columns on drawing_sets ────────────────────────────────
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index matching the idx_drawings_active pattern so "active sets"
-- lookups stay cheap.
CREATE INDEX IF NOT EXISTS idx_drawing_sets_active
  ON drawing_sets (project_id, created_at DESC)
  WHERE is_deleted = false;

-- ─── 2. Cascade soft-delete RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_drawing_set(p_set_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_count INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Soft-delete every active child sheet first so the sync_drawing_set_counts
  -- trigger sees them transition and zeroes the parent aggregates.
  WITH updated AS (
    UPDATE drawings
       SET is_deleted = TRUE,
           deleted_at = v_now,
           updated_at = v_now
     WHERE drawing_set_id = p_set_id
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     RETURNING id
  )
  SELECT COUNT(*) INTO v_child_count FROM updated;

  -- Mark the parent set as deleted.
  UPDATE drawing_sets
     SET is_deleted = TRUE,
         deleted_at = v_now,
         updated_at = v_now
   WHERE id = p_set_id
     AND (is_deleted IS NULL OR is_deleted = FALSE);

  RETURN v_child_count;
END;
$$;

COMMENT ON FUNCTION delete_drawing_set(UUID) IS
  'Soft-deletes a drawing set and all of its child drawings in a single transaction. Returns the number of child sheets that were newly soft-deleted.';

-- Grant execute to the roles the PostgREST client uses.
GRANT EXECUTE ON FUNCTION delete_drawing_set(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_drawing_set(UUID) TO service_role;

-- Done. Frontend should:
--   • Treat drawing_sets the same as drawings in SOFT_DELETE_TABLES
--   • Call supabase.rpc('delete_drawing_set', { p_set_id: ... }) for cascade delete
