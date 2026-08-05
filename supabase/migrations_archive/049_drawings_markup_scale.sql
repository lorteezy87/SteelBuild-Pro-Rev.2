-- ============================================================================
-- 049_drawings_markup_scale.sql
--
-- Adds a per-drawing scale factor so the measurement tool in the PDF
-- viewer can render real-world dimensions (feet-inches) instead of raw
-- page-inches.
--
-- Definition: markup_scale = real_inches_per_pdf_inch
--   Example: a drawing printed at 1/4" = 1'-0" (quarter inch scale) maps
--   1 PDF-inch on the page to 48 real inches, so markup_scale = 48.
--   At 1/8" scale, markup_scale = 96. At 1:1 (full-size), markup_scale = 1.
--
-- NULL means "not calibrated yet" — the measure tool falls back to raw
-- page-inches and shows a hint to calibrate. Once the user calibrates
-- by picking two points on a known-length feature (e.g. a dimension
-- string labelled 10'-0), we compute and store the factor; every
-- subsequent measurement on THIS drawing renders real-world values.
--
-- Note: scale is per-drawing, not per-set. Different sheets in the same
-- set routinely ship at different scales (plan view at 1/8, detail at
-- 3/4), so storing on drawings is correct.
-- ============================================================================

ALTER TABLE drawings
  ADD COLUMN IF NOT EXISTS markup_scale NUMERIC;

COMMENT ON COLUMN drawings.markup_scale IS
  'Per-drawing scale multiplier: real_inches_per_pdf_inch. Calibrated by the user via the CALIBRATE tool in the PDF viewer. NULL = not calibrated; measurements show raw page-inches.';

NOTIFY pgrst, 'reload schema';
