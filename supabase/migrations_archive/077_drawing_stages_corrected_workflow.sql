-- 077_drawing_stages_corrected_workflow.sql
-- Aligns drawings.stage with the corrected 7-stage detailing/submittal flow
-- (Not Started → IFA → OFA → BFA → OFS → IFC → Released).
--
-- Old stages BFS and FFF are dropped. Existing data:
--   - 0 rows with BFS
--   - 3 rows with FFF → migrate to IFC (the closest semantic match:
--     "Fit For Fab" was the legacy pre-release ready-for-shop state;
--     IFC = Issued For Construction is the corrected pre-Released stage)
--   - OFS rows (55) keep their string value; semantics change from
--     legacy "Out For Shop" to "Out For Scrub" but the literal stays.
--
-- Order: drop the old constraint FIRST so the FFF→IFC backfill below
-- doesn't violate the legacy CHECK (IFC isn't in the old enum).

-- 1. Drop the legacy CHECK constraint
ALTER TABLE public.drawings
  DROP CONSTRAINT IF EXISTS chk_drawings_stage;

-- 2. Backfill the 3 legacy FFF rows → IFC
UPDATE public.drawings
   SET stage = 'IFC'
 WHERE stage = 'FFF'
   AND is_deleted = false;

-- 3. Add the corrected CHECK constraint
ALTER TABLE public.drawings
  ADD CONSTRAINT chk_drawings_stage
  CHECK (stage = ANY (ARRAY[
    'Not Started'::text,
    'IFA'::text,
    'OFA'::text,
    'BFA'::text,
    'OFS'::text,
    'IFC'::text,
    'Released'::text
  ]));

-- 4. Document the change
COMMENT ON COLUMN public.drawings.stage IS
  '7-stage detailing/submittal flow: Not Started -> IFA (In For Approval, internal prep) -> OFA (Out For Approval, with EOR/AOR) -> BFA (Back From Approval) -> OFS (Out For Scrub, post-approval cleanup) -> IFC (Issued For Construction, record copy to GC) -> Released (S&H internal release to fab shop). DEPRECATED for workflow rollups: read submittals.status instead. Single source of truth: src/lib/submittalStageMapping.js.';
