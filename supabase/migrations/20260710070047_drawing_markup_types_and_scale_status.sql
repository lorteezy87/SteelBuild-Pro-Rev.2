-- Widen markup_type to the 8 kinds the viewer actually emits. Until now the
-- CHECK admitted only the legacy pin-era values, so 7 of 8 markup tools (pen,
-- rect, highlight, arrow, measure, note, stamp) were rejected on INSERT and
-- drawing_markups held zero rows. 'calibrate' is a TOOL, not a markup_type --
-- it calls onCalibrate, never onAddItem. Do not add it.
ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_markup_type_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_markup_type_check
  CHECK (markup_type IN (
    'cloud','pin','dimension_note','qa_note','field_note','coordination_note',
    'pen','rect','highlight','arrow','measure','note','stamp'
  ));

-- Note status-cycling writes addressed|rejected|clarification (AnnotationLayer
-- MARKUP_STATUS_ORDER). Inserts always send 'open', so this blocked UPDATE only.
ALTER TABLE public.drawing_markups DROP CONSTRAINT IF EXISTS drawing_markups_status_check;
ALTER TABLE public.drawing_markups ADD  CONSTRAINT drawing_markups_status_check
  CHECK (status IN ('open','addressed','rejected','clarification','resolved','void'));

-- drawings.markup_scale IS NULL currently means four different things: never
-- attempted, nothing detected, ambiguous sheet, or the user pressed Undo.
-- scale_status disambiguates them so the on-load auto-detect stops re-arming on
-- sheets the user already declined.
--
-- NOTE: the backfill that resets the two whole-document-scan scales (J1.4,
-- S223) is deliberately NOT in this migration. Both sheets sit on drawing sets
-- auto-locked by the fab-release gate, and guard_drawing_set_lock_for_drawings
-- rejects any UPDATE to a locked set's drawings. Resetting them requires an
-- explicit owner decision; see the plan's Task 1 notes.
ALTER TABLE public.drawings ADD COLUMN IF NOT EXISTS scale_status text;
ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_scale_status_check;
ALTER TABLE public.drawings ADD CONSTRAINT drawings_scale_status_check
  CHECK (scale_status IS NULL OR scale_status IN ('undetected','ambiguous','auto','manual'));
