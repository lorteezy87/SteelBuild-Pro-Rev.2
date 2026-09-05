-- Piece archive → 3D projection + WP progress sync.
--
-- trg_pieces_projection_after_change mirrored lifecycle / WP / hold / mark
-- changes onto model_elements and refreshed work_packages.percent_complete,
-- but it did not fire on is_deleted / deleted_at. archive_piece_lots writes
-- only those two columns, so archiving a lot:
--   * left model_elements.piece_id / fab_status / work_package_id pointing at
--     the archived piece — the 3D viewer kept painting it as live;
--   * never refreshed the work package's percent_complete / status.
-- This migration extends the trigger to treat archive (and un-archive) as a
-- projection change: archived pieces are detached from their model elements
-- (the element keeps its mark so a re-link can pick it up later) and the WP
-- rollup is refreshed.

CREATE OR REPLACE FUNCTION public.pieces_projection_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark_changed boolean := false;
  v_proj_changed boolean := false;
  v_was_active boolean;
  v_is_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_was_active := COALESCE(OLD.is_deleted, false) = false AND OLD.deleted_at IS NULL;
    v_is_active  := COALESCE(NEW.is_deleted, false) = false AND NEW.deleted_at IS NULL;

    -- Archive: detach the 3D projection and refresh the package rollup.
    IF v_was_active AND NOT v_is_active THEN
      UPDATE public.model_elements me
      SET
        piece_id = NULL,
        fab_status = NULL,
        work_package_id = NULL
      WHERE me.piece_id = NEW.id
        AND me.is_deleted = false;

      IF NEW.work_package_id IS NOT NULL THEN
        PERFORM public.refresh_work_package_progress(NEW.work_package_id);
      END IF;
      RETURN NEW;
    END IF;

    -- Un-archive: behave like an insert — re-link unmatched elements + refresh.
    IF NOT v_was_active AND v_is_active THEN
      IF COALESCE(trim(NEW.normalized_piece_mark), '') <> ''
         OR COALESCE(trim(NEW.piece_mark), '') <> '' THEN
        PERFORM public.link_unlinked_model_elements_for_piece(NEW.id);
      END IF;
      IF NEW.work_package_id IS NOT NULL THEN
        PERFORM public.refresh_work_package_progress(NEW.work_package_id);
      END IF;
      RETURN NEW;
    END IF;

    -- Archived rows that stay archived have no live projection to maintain.
    IF NOT v_is_active THEN
      RETURN NEW;
    END IF;

    v_mark_changed :=
      NEW.piece_mark IS DISTINCT FROM OLD.piece_mark
      OR NEW.normalized_piece_mark IS DISTINCT FROM OLD.normalized_piece_mark;

    v_proj_changed :=
      NEW.work_package_id IS DISTINCT FROM OLD.work_package_id
      OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
      OR NEW.on_hold IS DISTINCT FROM OLD.on_hold
      OR v_mark_changed;

    IF v_proj_changed THEN
      UPDATE public.model_elements me
      SET
        work_package_id = NEW.work_package_id,
        fab_status = NEW.lifecycle_status,
        piece_mark = CASE
          WHEN v_mark_changed THEN NEW.piece_mark
          ELSE me.piece_mark
        END
      WHERE me.piece_id = NEW.id
        AND me.is_deleted = false;
    END IF;

    IF v_mark_changed THEN
      PERFORM public.link_unlinked_model_elements_for_piece(NEW.id);
    END IF;

    IF OLD.work_package_id IS NOT NULL
       AND OLD.work_package_id IS DISTINCT FROM NEW.work_package_id THEN
      PERFORM public.refresh_work_package_progress(OLD.work_package_id);
    END IF;
    IF NEW.work_package_id IS NOT NULL THEN
      PERFORM public.refresh_work_package_progress(NEW.work_package_id);
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_deleted, false) = false AND NEW.deleted_at IS NULL THEN
      IF COALESCE(trim(NEW.normalized_piece_mark), '') <> ''
         OR COALESCE(trim(NEW.piece_mark), '') <> '' THEN
        PERFORM public.link_unlinked_model_elements_for_piece(NEW.id);
      END IF;

      IF NEW.work_package_id IS NOT NULL THEN
        PERFORM public.refresh_work_package_progress(NEW.work_package_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pieces_projection_after_change ON public.pieces;
CREATE TRIGGER trg_pieces_projection_after_change
  AFTER INSERT OR UPDATE OF
    work_package_id,
    lifecycle_status,
    on_hold,
    piece_mark,
    normalized_piece_mark,
    is_deleted,
    deleted_at
  ON public.pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.pieces_projection_after_change();

-- One-time repair: detach model elements still pointing at already-archived lots.
UPDATE public.model_elements me
SET piece_id = NULL,
    fab_status = NULL,
    work_package_id = NULL
FROM public.pieces p
WHERE me.piece_id = p.id
  AND me.is_deleted = false
  AND (COALESCE(p.is_deleted, false) = true OR p.deleted_at IS NOT NULL);

NOTIFY pgrst, 'reload schema';
