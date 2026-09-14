-- When a work package is soft-deleted, clear piece assignments so marks
-- return to the unassigned pool. Soft-delete does not fire FK ON DELETE
-- SET NULL, so pieces previously stayed stuck on ghost packages (and
-- auto-assign skipped them as already_assigned).

CREATE OR REPLACE FUNCTION public.work_packages_soft_delete_unassign_pieces()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_became_deleted boolean;
BEGIN
  v_became_deleted :=
    (
      (NEW.is_deleted IS TRUE AND coalesce(OLD.is_deleted, false) IS DISTINCT FROM TRUE)
      OR (
        NEW.deleted_at IS NOT NULL
        AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
      )
    );

  IF NOT v_became_deleted THEN
    RETURN NEW;
  END IF;

  IF NEW.is_deleted IS DISTINCT FROM TRUE THEN
    NEW.is_deleted := true;
  END IF;
  IF NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;

  -- Audit then clear. Reuses assigned_to_work_package + null next state
  -- (same shape as unassign_pieces_from_work_package).
  INSERT INTO public.piece_events (
    project_id, piece_id, event_type, previous_state, next_state,
    reason, source_system, created_by
  )
  SELECT
    p.project_id,
    p.id,
    'assigned_to_work_package',
    jsonb_build_object('work_package_id', p.work_package_id),
    jsonb_build_object('work_package_id', NULL),
    'Unassigned because work package was deleted',
    'piece_control',
    NULL
  FROM public.pieces p
  WHERE p.work_package_id = NEW.id
    AND p.deleted_at IS NULL;

  UPDATE public.pieces p
  SET work_package_id = NULL
  WHERE p.work_package_id = NEW.id
    AND p.deleted_at IS NULL;

  BEGIN
    PERFORM public.refresh_work_package_progress(NEW.id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_packages_soft_delete_unassign_pieces
  ON public.work_packages;

CREATE TRIGGER trg_work_packages_soft_delete_unassign_pieces
  BEFORE UPDATE OF is_deleted, deleted_at
  ON public.work_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.work_packages_soft_delete_unassign_pieces();

REVOKE ALL ON FUNCTION public.work_packages_soft_delete_unassign_pieces()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_packages_soft_delete_unassign_pieces()
  TO authenticated, service_role;

-- One-shot backfill for orphans left by earlier soft-deletes.
INSERT INTO public.piece_events (
  project_id, piece_id, event_type, previous_state, next_state,
  reason, source_system, created_by
)
SELECT
  p.project_id,
  p.id,
  'assigned_to_work_package',
  jsonb_build_object('work_package_id', p.work_package_id),
  jsonb_build_object('work_package_id', NULL),
  'Unassigned because work package was deleted (backfill)',
  'piece_control',
  NULL
FROM public.pieces p
JOIN public.work_packages wp ON wp.id = p.work_package_id
WHERE p.deleted_at IS NULL
  AND (wp.is_deleted = true OR wp.deleted_at IS NOT NULL);

UPDATE public.pieces p
SET work_package_id = NULL
FROM public.work_packages wp
WHERE p.work_package_id = wp.id
  AND p.deleted_at IS NULL
  AND (wp.is_deleted = true OR wp.deleted_at IS NOT NULL);
