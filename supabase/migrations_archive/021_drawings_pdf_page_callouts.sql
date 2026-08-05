-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 021 — Drawings: pdf_page + callouts columns                                 │
-- │                                                                              │
-- │ The upload modal's callout-detection feature writes these two fields on     │
-- │ every child drawings row but they were never added to the schema, so every  │
-- │ Drawing.create() with this body would 400 on "column does not exist".       │
-- │                                                                              │
-- │ `pdf_page`  — which page of the source PDF this sheet's content lives on.   │
-- │               Used by DrawingViewer to jump to the right page and align     │
-- │               callout overlays in the correct coordinate space.             │
-- │ `callouts`  — detected section/detail callout references as JSONB. Each     │
-- │               element has { text, coords, targetSheetNumber, targetDetail,  │
-- │               resolved }. Empty array if the PDF had no detectable          │
-- │               callouts or was too large / scanned.                          │
-- ╰────────────────────────────────────────────────────────────────────────────╯

ALTER TABLE drawings ADD COLUMN IF NOT EXISTS pdf_page INTEGER DEFAULT 1;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS callouts JSONB DEFAULT '[]'::jsonb;

-- Index for looking up sheets that contain any callouts (used by the viewer's
-- "jump to callout" UI and by cross-link resolution).
CREATE INDEX IF NOT EXISTS idx_drawings_callouts_gin
  ON drawings USING gin (callouts);
