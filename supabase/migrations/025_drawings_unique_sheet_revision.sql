-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 025 — Enforce uniqueness of (project_id, sheet_number, revision_number)    │
-- │                                                                              │
-- │ Prevents two active (non-deleted) rows from claiming the same sheet number │
-- │ at the same revision inside a single project. Superseded revisions are     │
-- │ fine because they keep their own revision_number distinct.                 │
-- │                                                                              │
-- │ Partial unique index: only active rows (is_deleted = false) and only rows  │
-- │ with a real sheet_number (blanks stay legal for legacy/draft data).        │
-- ╰────────────────────────────────────────────────────────────────────────────╯

CREATE UNIQUE INDEX IF NOT EXISTS uq_drawings_project_sheet_revision
  ON drawings (project_id, sheet_number, revision_number)
  WHERE is_deleted = FALSE
    AND sheet_number IS NOT NULL
    AND sheet_number <> '';


-- ============================================================================
-- Consolidated from 025b_drawing_sets_approval_fields.sql
-- This migration shared a numeric version prefix with 025_drawings_unique_sheet_revision.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
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


-- ============================================================================
-- Consolidated from 025c_drawing_activity_log.sql
-- This migration shared a numeric version prefix with 025_drawings_unique_sheet_revision.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 025c — drawing_activity audit log + triggers                               │
-- │                                                                              │
-- │ Captures every meaningful state change on a drawings row so the UI can    │
-- │ render a history timeline ("Stage advanced OFA → BFA · 2d ago · Nick").    │
-- │                                                                              │
-- │ Events captured:                                                             │
-- │   • stage changes (from → to)                                                │
-- │   • revision_number changes                                                  │
-- │   • set_approval_status changes                                              │
-- │   • soft-delete / restore                                                   │
-- │   • INSERT (row created)                                                    │
-- │                                                                              │
-- │ Each row stores the minimum context needed to render a history line: the  │
-- │ event type, the from/to values, who did it (auth.uid), and when. Full     │
-- │ row snapshots live in metadata jsonb for anything else a diff tool wants. │
-- ╰────────────────────────────────────────────────────────────────────────────╯

CREATE TABLE IF NOT EXISTS drawing_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  drawing_id    UUID NOT NULL,
  event_type    TEXT NOT NULL,
  from_value    TEXT,
  to_value      TEXT,
  actor_id      UUID,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drawing_activity DROP CONSTRAINT IF EXISTS chk_drawing_activity_event_type;
ALTER TABLE drawing_activity ADD  CONSTRAINT chk_drawing_activity_event_type
  CHECK (event_type IN (
    'created', 'stage_changed', 'revision_changed',
    'approval_changed', 'deleted', 'restored',
    'ai_status_changed', 'superseded'
  ));

CREATE INDEX IF NOT EXISTS idx_drawing_activity_drawing ON drawing_activity (drawing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_activity_project ON drawing_activity (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_activity_type    ON drawing_activity (event_type);

-- RLS: activity is readable by anyone who can read the parent drawing.
-- For now we mirror the "auth_all" permissive policy used elsewhere on this
-- project; tighten when project-level RLS lands on drawing_activity itself.
ALTER TABLE drawing_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drawing_activity_auth_all ON drawing_activity;
CREATE POLICY drawing_activity_auth_all ON drawing_activity
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Trigger function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_drawing_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  -- auth.uid() may be NULL for service_role / background jobs; that's fine.
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO drawing_activity (project_id, drawing_id, event_type, to_value, actor_id, metadata)
    VALUES (NEW.project_id, NEW.id, 'created', NEW.stage, v_actor,
            jsonb_build_object('sheet_number', NEW.sheet_number, 'title', NEW.title));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft delete / restore
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id,
              CASE WHEN NEW.is_deleted THEN 'deleted' ELSE 'restored' END,
              OLD.is_deleted::text, NEW.is_deleted::text, v_actor);
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'stage_changed', OLD.stage, NEW.stage, v_actor);
    END IF;

    IF NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'revision_changed', OLD.revision_number::text, NEW.revision_number::text, v_actor);
    END IF;

    IF NEW.set_approval_status IS DISTINCT FROM OLD.set_approval_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'approval_changed',
              COALESCE(OLD.set_approval_status, ''), COALESCE(NEW.set_approval_status, ''), v_actor);
    END IF;

    IF NEW.ai_extraction_status IS DISTINCT FROM OLD.ai_extraction_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'ai_status_changed',
              COALESCE(OLD.ai_extraction_status, ''), COALESCE(NEW.ai_extraction_status, ''), v_actor);
    END IF;

    IF NEW.is_superseded IS DISTINCT FROM OLD.is_superseded AND NEW.is_superseded = TRUE THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'superseded', 'false', 'true', v_actor);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_drawings_activity ON drawings;
CREATE TRIGGER trg_drawings_activity
AFTER INSERT OR UPDATE ON drawings
FOR EACH ROW
EXECUTE FUNCTION log_drawing_activity();
