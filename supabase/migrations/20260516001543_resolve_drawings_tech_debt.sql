-- Resolve drawings workflow/schema tech debt.
--
-- 1. Drop the legacy drawings.annotations jsonb column. Runtime markup
--    writes use drawings.markup and the audit found no live app
--    consumers for drawings.annotations.
-- 2. Remove pre-077 drawing-stage values from drawing_analyses so
--    future AI-analysis imports only handle canonical values.
-- 3. Prevent new drawings rows from being orphaned from drawing_sets
--    while letting any historical null rows remain until explicitly
--    repaired.

ALTER TABLE public.drawings
  DROP COLUMN IF EXISTS annotations;

UPDATE public.drawing_analyses
   SET drawing_stage = 'BFA'
 WHERE drawing_stage = 'BFS';

UPDATE public.drawing_analyses
   SET drawing_stage = 'IFC'
 WHERE drawing_stage = 'FFF';

ALTER TABLE public.drawing_analyses
  DROP CONSTRAINT IF EXISTS drawing_analyses_drawing_stage_check;

ALTER TABLE public.drawing_analyses
  ADD CONSTRAINT drawing_analyses_drawing_stage_check
  CHECK (
    drawing_stage IS NULL OR
    drawing_stage = ANY (ARRAY[
      'OFA'::text,
      'BFA'::text,
      'OFS'::text,
      'Released'::text,
      'IFA'::text,
      'IFC'::text,
      'Shop'::text,
      'Revision'::text
    ])
  );

ALTER TABLE public.drawings
  DROP CONSTRAINT IF EXISTS drawings_drawing_set_id_required_chk;

ALTER TABLE public.drawings
  ADD CONSTRAINT drawings_drawing_set_id_required_chk
  CHECK (drawing_set_id IS NOT NULL) NOT VALID;

COMMENT ON CONSTRAINT drawings_drawing_set_id_required_chk ON public.drawings IS
  'Prevents new drawing rows from being orphaned from drawing_sets. NOT VALID intentionally allows any historical null drawing_set_id rows to remain until repaired.';

NOTIFY pgrst, 'reload schema';
