-- 20260526220000_drawing_sets_detailing_state.sql
--
-- Detailing Control Center, Phase 1: add the manual detailing/release sub-state
-- to drawing_sets (the "Detailing Package"). This column holds ONLY the phases
-- the submittal state machine does NOT cover:
--   * upstream DRAFTING: 'In Detailing', 'Internal Review', 'Ready to Submit'
--   * downstream RELEASE: 'Partially Released', 'Released for Erection'
-- The middle (Submitted -> Under Review -> Approved -> Released for Fab) stays
-- DERIVED from the linked submittal (submittalStageMapping.derivedSetStage), and
-- 'Superseded' derives from drawing_revisions. The package's effective
-- operational state is a coalesce: release/drafting (this column, when set)
-- else derived submittal stage else 'Not Started'. Additive + nullable; no
-- backfill -- NULL means 'Not Started'. New column inherits the existing
-- drawing_sets RLS policies (no policy change). Applied live via Supabase MCP.
-- See docs/detailing-control-center-design.md sections 3 + 6.

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS detailing_state text;

ALTER TABLE public.drawing_sets
  DROP CONSTRAINT IF EXISTS drawing_sets_detailing_state_check;
ALTER TABLE public.drawing_sets
  ADD CONSTRAINT drawing_sets_detailing_state_check
  CHECK (detailing_state IS NULL OR detailing_state IN (
    'Not Started', 'In Detailing', 'Internal Review', 'Ready to Submit',
    'Partially Released', 'Released for Erection'
  ));

NOTIFY pgrst, 'reload schema';
