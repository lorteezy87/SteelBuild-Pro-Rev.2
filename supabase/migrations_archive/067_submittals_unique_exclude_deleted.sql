-- ============================================================================
-- 067_submittals_unique_exclude_deleted.sql
--
-- The submittals_unique_per_project unique constraint on (project_id,
-- submittal_number) was full — soft-deleted rows still occupied the
-- uniqueness namespace, so attempting to recreate a submittal_number that
-- previously existed and was deleted failed with a 409. The page surfaces
-- the failure as a "Create failed" toast that's easily mistaken for
-- "submittals aren't saving."
--
-- Same pattern as drawing_sets (mig 029) and rfis (mig 030): drop the
-- constraint and replace with a partial unique INDEX that only enforces
-- uniqueness over live rows. The constraint shape doesn't survive a
-- partial WHERE clause, but the partial UNIQUE index gives the same
-- guarantee on inserts/updates and lets soft-deleted rows coexist.
-- ============================================================================

ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS submittals_unique_per_project;

CREATE UNIQUE INDEX submittals_unique_per_project
  ON public.submittals (project_id, submittal_number)
  WHERE is_deleted IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
