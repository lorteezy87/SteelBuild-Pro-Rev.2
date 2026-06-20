-- 074_legacy_drawings_to_submittals.sql
--
-- Sprint 2 — workflow consolidation. For every drawing_sets row that
-- carries a non-NULL set_approval_status but isn't already linked to
-- a submittal, create a real submittal row so the submittals table
-- becomes the single workflow source of truth.
--
-- Idempotent: the NOT EXISTS guard skips sets that already have a
-- submittal whose drawing_set_ids array contains the set id. Safe to
-- re-run.
--
-- Status mapping is conservative — `approved` lands in 'Approved' and
-- carries the existing approved_date so the rollup still treats those
-- sets as released. `pending_review` lands in 'Under Review' so the
-- pipeline correctly shows them as in-flight.
--
-- submittal_number uses LEGACY-<id-prefix> to namespace these rows so
-- they're easy to spot and can't collide with operator-entered numbers.
INSERT INTO public.submittals (
  project_id, submittal_number, title, status, ball_in_court,
  submitted_date, required_date, approved_date,
  drawing_set_ids, notes, created_at
)
SELECT
  ds.project_id,
  'LEGACY-' || substring(ds.id::text, 1, 8),
  COALESCE(NULLIF(ds.set_name, ''), '(unnamed set)') || ' — Legacy Submittal',
  CASE
    WHEN ds.set_approval_status = 'approved'       THEN 'Approved'
    WHEN ds.set_approval_status = 'rejected'       THEN 'Rejected'
    WHEN ds.set_approval_status = 'superseded'     THEN 'Void'
    WHEN ds.set_approval_status = 'pending_review' THEN 'Under Review'
    ELSE 'Submitted'
  END,
  'EOR',
  ds.set_approved_date,
  NULL,
  CASE
    WHEN ds.set_approval_status = 'approved' THEN ds.set_approved_date
    ELSE NULL
  END,
  ARRAY[ds.id]::uuid[],
  'Migrated from drawing_sets.set_approval_status on ' || now()::date,
  COALESCE(ds.set_approved_date::timestamptz, now())
FROM public.drawing_sets ds
WHERE ds.set_approval_status IS NOT NULL
  AND ds.set_approval_status != ''
  AND COALESCE(ds.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.submittals s
    WHERE s.is_deleted = false
      AND ds.id = ANY(s.drawing_set_ids)
  );
