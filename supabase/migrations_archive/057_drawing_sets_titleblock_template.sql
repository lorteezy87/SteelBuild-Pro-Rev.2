-- Drawing-set titleblock template — rectangle coordinates that mark where
-- the sheet's title and sheet-number live on the page.
--
-- Context: today every sheet's title + number are extracted by the LLM
-- pipeline (analyzeDrawing.js → llm-proxy edge function), which is
-- inconsistent across detailers' titleblock layouts and burns Anthropic
-- tokens for two values that are deterministic the moment you can point at
-- them. This migration adds two normalised rectangles to drawing_sets;
-- the ingest pipeline (slice 3) will OCR those regions via pdfjs first
-- and only fall back to the LLM when the text layer is empty (scanned PDFs).
--
-- Coordinates are normalised (0..1) so they're page-size and zoom
-- independent. They apply to every sheet in the set — steel detailers'
-- titleblocks are uniform within a set by convention.

ALTER TABLE drawing_sets
  ADD COLUMN IF NOT EXISTS titleblock_title_rect  jsonb,
  ADD COLUMN IF NOT EXISTS titleblock_number_rect jsonb;

COMMENT ON COLUMN drawing_sets.titleblock_title_rect IS
  'Normalised rectangle (0..1 coords) marking the sheet TITLE region in '
  'the titleblock. Shape: {"x":0..1, "y":0..1, "width":0..1, "height":0..1}. '
  'NULL = no template set; ingest falls through to the LLM extraction path.';

COMMENT ON COLUMN drawing_sets.titleblock_number_rect IS
  'Normalised rectangle (0..1 coords) marking the SHEET NUMBER region in '
  'the titleblock. Same shape as titleblock_title_rect.';

-- Validate the shape of each rectangle when it IS set. NULL is allowed
-- because the marker UI may save the rects independently (e.g. user
-- marked the title, hasn't drawn the sheet-number yet). The CHECK only
-- fires when the column is non-null.
ALTER TABLE drawing_sets
  ADD CONSTRAINT drawing_sets_titleblock_title_rect_shape CHECK (
    titleblock_title_rect IS NULL OR (
      jsonb_typeof(titleblock_title_rect) = 'object'
      AND jsonb_typeof(titleblock_title_rect->'x')      = 'number'
      AND jsonb_typeof(titleblock_title_rect->'y')      = 'number'
      AND jsonb_typeof(titleblock_title_rect->'width')  = 'number'
      AND jsonb_typeof(titleblock_title_rect->'height') = 'number'
      AND (titleblock_title_rect->>'x')::numeric      BETWEEN 0 AND 1
      AND (titleblock_title_rect->>'y')::numeric      BETWEEN 0 AND 1
      AND (titleblock_title_rect->>'width')::numeric  BETWEEN 0 AND 1
      AND (titleblock_title_rect->>'height')::numeric BETWEEN 0 AND 1
    )
  );

ALTER TABLE drawing_sets
  ADD CONSTRAINT drawing_sets_titleblock_number_rect_shape CHECK (
    titleblock_number_rect IS NULL OR (
      jsonb_typeof(titleblock_number_rect) = 'object'
      AND jsonb_typeof(titleblock_number_rect->'x')      = 'number'
      AND jsonb_typeof(titleblock_number_rect->'y')      = 'number'
      AND jsonb_typeof(titleblock_number_rect->'width')  = 'number'
      AND jsonb_typeof(titleblock_number_rect->'height') = 'number'
      AND (titleblock_number_rect->>'x')::numeric      BETWEEN 0 AND 1
      AND (titleblock_number_rect->>'y')::numeric      BETWEEN 0 AND 1
      AND (titleblock_number_rect->>'width')::numeric  BETWEEN 0 AND 1
      AND (titleblock_number_rect->>'height')::numeric BETWEEN 0 AND 1
    )
  );

-- Reload PostgREST schema cache so the new columns are visible without a
-- service restart.
NOTIFY pgrst, 'reload schema';
