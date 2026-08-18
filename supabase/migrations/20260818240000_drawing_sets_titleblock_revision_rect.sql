-- Titleblock revision rectangle — third marked region (title, sheet #, rev).
--
-- Existing title + sheet-number rects stay as-is. Revision is optional so
-- already-saved 2-box templates keep working. When present, ingest OCRs this
-- region for per-sheet revision instead of guessing from the LLM / filename.

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS titleblock_revision_rect jsonb;

COMMENT ON COLUMN public.drawing_sets.titleblock_revision_rect IS
  'Normalised rectangle (0..1 coords) marking the REV region in the titleblock. '
  'Shape: {"x":0..1, "y":0..1, "width":0..1, "height":0..1}. '
  'NULL = no rev template; ingest falls through to LLM / filename revision.';

ALTER TABLE public.drawing_sets
  DROP CONSTRAINT IF EXISTS drawing_sets_titleblock_revision_rect_shape;

ALTER TABLE public.drawing_sets
  ADD CONSTRAINT drawing_sets_titleblock_revision_rect_shape CHECK (
    titleblock_revision_rect IS NULL OR (
      jsonb_typeof(titleblock_revision_rect) = 'object'
      AND jsonb_typeof(titleblock_revision_rect->'x')      = 'number'
      AND jsonb_typeof(titleblock_revision_rect->'y')      = 'number'
      AND jsonb_typeof(titleblock_revision_rect->'width')  = 'number'
      AND jsonb_typeof(titleblock_revision_rect->'height') = 'number'
      AND (titleblock_revision_rect->>'x')::numeric      BETWEEN 0 AND 1
      AND (titleblock_revision_rect->>'y')::numeric      BETWEEN 0 AND 1
      AND (titleblock_revision_rect->>'width')::numeric  BETWEEN 0 AND 1
      AND (titleblock_revision_rect->>'height')::numeric BETWEEN 0 AND 1
    )
  );

NOTIFY pgrst, 'reload schema';
