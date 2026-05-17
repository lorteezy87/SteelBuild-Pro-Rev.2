-- 075_deprecate_workflow_drawing_columns.sql
--
-- Sprint 2 — mark workflow-related columns on drawings/drawing_sets
-- as deprecated. The submittals table is now the workflow source of
-- truth. Columns are NOT dropped — legacy display paths still read
-- them. New code should read from `submittals`.
COMMENT ON COLUMN public.drawings.stage IS
  'DEPRECATED: workflow lives on submittals table (Sprint 2). Retained for legacy drawings-page display.';
COMMENT ON COLUMN public.drawings.set_approval_status IS
  'DEPRECATED: workflow lives on submittals table (Sprint 2). Retained for legacy drawings-page display.';
COMMENT ON COLUMN public.drawing_sets.set_approval_status IS
  'DEPRECATED: workflow lives on submittals table (Sprint 2). Retained for legacy display.';
