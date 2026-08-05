-- ─── Add missing columns to drawings for submittal/approval workflow ─────────
-- UI writes these columns but they didn't exist, causing PostgREST 400 errors
-- and silent data loss on create/update.

ALTER TABLE drawings ADD COLUMN IF NOT EXISTS ifc_status          TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS is_superseded       BOOLEAN DEFAULT FALSE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS set_approval_status TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS set_approved_date   TIMESTAMPTZ;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS annotations         JSONB;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS approval_status     TEXT DEFAULT 'Open';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS returned_date       DATE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS thumbnail_url       TEXT;

CREATE INDEX IF NOT EXISTS idx_drawings_set_name ON drawings(drawing_set_name) WHERE drawing_set_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drawings_project  ON drawings(project_id);
