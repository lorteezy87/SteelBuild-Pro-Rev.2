-- Drawing viewer Tier 3: user-drawn markup (redlines, shapes, arrows, notes).
-- Stored as JSONB on the drawing row so it travels with the sheet. Each
-- entry is versioned + typed; see AnnotationLayer.jsx for the shape.
--
-- We deliberately use a NEW column rather than the pre-existing `annotations`
-- column (migration 010) because `annotations` is still reserved for
-- pdfjs-extracted link hotspots inside the PDF itself, and having two things
-- named the same way would guarantee a future bug.
ALTER TABLE drawings
  ADD COLUMN IF NOT EXISTS markup JSONB DEFAULT '[]'::jsonb;

-- Lightweight index so future features (e.g. "show sheets with markup")
-- don't table-scan the JSONB.
CREATE INDEX IF NOT EXISTS idx_drawings_markup_gin
  ON drawings USING GIN (markup);
