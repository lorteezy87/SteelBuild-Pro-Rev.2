-- Add normalized bbox + page_index to drawing_findings so the AI analyzer
-- can emit per-finding spatial coordinates. Unblocks the Drawing Hub V3.0
-- Analyzer-to-Zones bridge (spatial clustering of findings into zones).
--
-- All columns nullable; legacy rows stay valid. bbox_source distinguishes
-- AI-emitted from user-drawn or derived bboxes.

ALTER TABLE drawing_findings
  ADD COLUMN page_index integer,
  ADD COLUMN x_min numeric,
  ADD COLUMN y_min numeric,
  ADD COLUMN x_max numeric,
  ADD COLUMN y_max numeric,
  ADD COLUMN bbox_source text;

ALTER TABLE drawing_findings
  ADD CONSTRAINT chk_drawing_findings_bbox_range CHECK (
    (x_min IS NULL AND y_min IS NULL AND x_max IS NULL AND y_max IS NULL)
    OR (
      x_min >= 0 AND x_min <= 1
      AND y_min >= 0 AND y_min <= 1
      AND x_max >= 0 AND x_max <= 1
      AND y_max >= 0 AND y_max <= 1
      AND x_max > x_min
      AND y_max > y_min
    )
  );

ALTER TABLE drawing_findings
  ADD CONSTRAINT chk_drawing_findings_bbox_source CHECK (
    bbox_source IS NULL OR bbox_source IN ('ai','user','derived')
  );

CREATE INDEX IF NOT EXISTS idx_drawing_findings_bbox
  ON drawing_findings (analysis_id, sheet_number)
  WHERE x_min IS NOT NULL;
