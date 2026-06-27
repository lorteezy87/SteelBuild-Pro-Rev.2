-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 020 — Drawing Sets: real parent/child relationship                          │
-- │                                                                              │
-- │ Transforms drawings from a flat table with a `drawing_set_name` text column │
-- │ into a proper parent/child hierarchy:                                        │
-- │   drawing_sets (parent)                                                      │
-- │   └── drawings (children, FK drawing_set_id)                                 │
-- │                                                                              │
-- │ Also adds upload/AI extraction status tracking on each child sheet so the    │
-- │ UI can show "8 of 12 processed, 2 need review" aggregates on the parent.    │
-- │                                                                              │
-- │ Backward-compatible: keeps the legacy `drawings.drawing_set_name` column in  │
-- │ place so any existing code still reading it continues to work. The new      │
-- │ `drawing_set_id` FK is the source of truth going forward.                    │
-- ╰────────────────────────────────────────────────────────────────────────────╯

-- ─── 1. Extend drawing_sets with the fields the new UI needs ────────────────
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS project_name       TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS discipline         TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS issued_by          TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS notes              TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS stage_summary      TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS revision_summary   TEXT;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS upload_batch_id    UUID;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS sheet_count        INTEGER DEFAULT 0;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS processed_count    INTEGER DEFAULT 0;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS needs_review_count INTEGER DEFAULT 0;
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS failed_count       INTEGER DEFAULT 0;

-- Ensure set_name is present + uniquely scoped per project so the frontend can
-- upsert on (project_id, set_name) without duplicating.
-- Use a partial unique index so historical NULLs / blanks don't block anything.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drawing_sets_project_set_name
  ON drawing_sets (project_id, set_name)
  WHERE set_name IS NOT NULL AND set_name <> '';

CREATE INDEX IF NOT EXISTS idx_drawing_sets_project
  ON drawing_sets (project_id);

-- ─── 2. Add parent FK + status tracking columns to drawings ────────────────
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS drawing_set_id       UUID REFERENCES drawing_sets(id) ON DELETE SET NULL;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS upload_status        TEXT DEFAULT 'Uploaded';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS ai_extraction_status TEXT DEFAULT 'Pending';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS extracted_text       TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS hyperlinks           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS thumbnail_url        TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS upload_batch_id      UUID;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS drawing_page         INTEGER;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS ai_extraction_error  TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS last_extracted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drawings_drawing_set_id       ON drawings (drawing_set_id);
CREATE INDEX IF NOT EXISTS idx_drawings_upload_status        ON drawings (upload_status);
CREATE INDEX IF NOT EXISTS idx_drawings_ai_extraction_status ON drawings (ai_extraction_status);
CREATE INDEX IF NOT EXISTS idx_drawings_upload_batch_id      ON drawings (upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_drawings_extracted_text_gin
  ON drawings USING gin (to_tsvector('english', COALESCE(extracted_text, '')));

-- ─── 3. Status value constraints ────────────────────────────────────────────
-- Drop old ones if they exist so re-runs stay idempotent.
ALTER TABLE drawings DROP CONSTRAINT IF EXISTS chk_drawings_upload_status;
ALTER TABLE drawings ADD  CONSTRAINT chk_drawings_upload_status
  CHECK (upload_status IN ('Uploading','Uploaded','Failed'));

ALTER TABLE drawings DROP CONSTRAINT IF EXISTS chk_drawings_ai_extraction_status;
ALTER TABLE drawings ADD  CONSTRAINT chk_drawings_ai_extraction_status
  CHECK (ai_extraction_status IN ('Pending','Extracting','Processed','NeedsReview','Failed'));

-- ─── 4. Backfill parent records from existing drawings ─────────────────────
-- For every (project_id, drawing_set_name) pair that has at least one drawing,
-- create a drawing_sets row if one doesn't already exist. Drawings with a NULL
-- or blank drawing_set_name get bucketed into a generated "Unassigned Sheets"
-- parent per project so the UI never has to show floating orphans.
INSERT INTO drawing_sets (project_id, project_name, set_name, revision, created_at, updated_at)
SELECT DISTINCT
  d.project_id,
  MAX(d.project_name),
  COALESCE(NULLIF(TRIM(d.drawing_set_name), ''), 'Unassigned Sheets') AS set_name,
  MAX(d.revision_number),
  NOW(),
  NOW()
FROM drawings d
WHERE d.project_id IS NOT NULL
  AND (d.is_deleted IS NULL OR d.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM drawing_sets ds
    WHERE ds.project_id = d.project_id
      AND ds.set_name = COALESCE(NULLIF(TRIM(d.drawing_set_name), ''), 'Unassigned Sheets')
  )
GROUP BY d.project_id, COALESCE(NULLIF(TRIM(d.drawing_set_name), ''), 'Unassigned Sheets');

-- Link every drawing to its parent (idempotent — only fills nulls).
UPDATE drawings d
SET drawing_set_id = ds.id
FROM drawing_sets ds
WHERE d.drawing_set_id IS NULL
  AND d.project_id = ds.project_id
  AND COALESCE(NULLIF(TRIM(d.drawing_set_name), ''), 'Unassigned Sheets') = ds.set_name;

-- Mark any legacy drawings as already "Processed" — they were created by hand
-- or by the old flow and don't need another AI pass.
UPDATE drawings
SET ai_extraction_status = 'Processed'
WHERE ai_extraction_status = 'Pending'
  AND (created_at IS NULL OR created_at < NOW());

-- ─── 5. Aggregate counts on parent sets ─────────────────────────────────────
-- Initial one-time sync. Thereafter the trigger below keeps them fresh.
UPDATE drawing_sets ds SET
  sheet_count         = COALESCE(c.total, 0),
  processed_count     = COALESCE(c.processed, 0),
  needs_review_count  = COALESCE(c.needs_review, 0),
  failed_count        = COALESCE(c.failed, 0)
FROM (
  SELECT
    drawing_set_id,
    COUNT(*)::int                                                                      AS total,
    SUM(CASE WHEN ai_extraction_status = 'Processed'   THEN 1 ELSE 0 END)::int          AS processed,
    SUM(CASE WHEN ai_extraction_status = 'NeedsReview' THEN 1 ELSE 0 END)::int          AS needs_review,
    SUM(CASE WHEN ai_extraction_status = 'Failed' OR upload_status = 'Failed' THEN 1 ELSE 0 END)::int AS failed
  FROM drawings
  WHERE drawing_set_id IS NOT NULL
    AND (is_deleted IS NULL OR is_deleted = false)
  GROUP BY drawing_set_id
) c
WHERE ds.id = c.drawing_set_id;

-- ─── 6. Trigger: keep drawing_sets counts + updated_at in sync ─────────────
CREATE OR REPLACE FUNCTION sync_drawing_set_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_set UUID;
BEGIN
  -- Decide which parent set(s) need a refresh
  IF TG_OP = 'DELETE' THEN
    v_set := OLD.drawing_set_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.drawing_set_id IS DISTINCT FROM OLD.drawing_set_id THEN
    -- Moved between sets: refresh both
    IF OLD.drawing_set_id IS NOT NULL THEN
      UPDATE drawing_sets ds SET
        sheet_count         = COALESCE((SELECT COUNT(*)          FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed')   FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview') FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed') FROM drawings WHERE drawing_set_id = OLD.drawing_set_id AND (is_deleted IS NULL OR is_deleted = false)), 0),
        updated_at          = NOW()
      WHERE ds.id = OLD.drawing_set_id;
    END IF;
    v_set := NEW.drawing_set_id;
  ELSE
    v_set := NEW.drawing_set_id;
  END IF;

  IF v_set IS NOT NULL THEN
    UPDATE drawing_sets ds SET
      sheet_count         = COALESCE((SELECT COUNT(*)          FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      processed_count     = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Processed')   FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      needs_review_count  = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'NeedsReview') FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      failed_count        = COALESCE((SELECT COUNT(*) FILTER (WHERE ai_extraction_status = 'Failed' OR upload_status = 'Failed') FROM drawings WHERE drawing_set_id = v_set AND (is_deleted IS NULL OR is_deleted = false)), 0),
      updated_at          = NOW()
    WHERE ds.id = v_set;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drawings_sync_set_counts ON drawings;
CREATE TRIGGER trg_drawings_sync_set_counts
AFTER INSERT OR UPDATE OF drawing_set_id, ai_extraction_status, upload_status, is_deleted OR DELETE ON drawings
FOR EACH ROW
EXECUTE FUNCTION sync_drawing_set_counts();

-- ─── 7. Row-level security ──────────────────────────────────────────────────
-- drawing_sets already has "auth_all" from 001; no change.

-- Done. Frontend will start writing drawing_set_id on new rows; old rows are
-- already linked via the backfill above.
