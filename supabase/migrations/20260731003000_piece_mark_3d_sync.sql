-- Piece-mark → 3D sync
-- When pieces.piece_mark changes, already-linked model_elements kept the old
-- mark and the projection trigger never fired (only WP / lifecycle / hold).
-- Extend the mirror so linked elements refresh mark + fab fields, ensure the
-- trigger watches piece_mark, and add model_elements to realtime publication.

CREATE OR REPLACE FUNCTION public.pieces_projection_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark_changed boolean := false;
  v_proj_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
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
        -- Keep linked element labels in sync with the register mark so fab-mode
        -- maps and mark chips do not show the pre-edit value.
        piece_mark = CASE
          WHEN v_mark_changed THEN NEW.piece_mark
          ELSE me.piece_mark
        END
      WHERE me.piece_id = NEW.id
        AND me.is_deleted = false;
    END IF;

    IF OLD.work_package_id IS NOT NULL
       AND OLD.work_package_id IS DISTINCT FROM NEW.work_package_id THEN
      PERFORM public.refresh_work_package_progress(OLD.work_package_id);
    END IF;
    IF NEW.work_package_id IS NOT NULL THEN
      PERFORM public.refresh_work_package_progress(NEW.work_package_id);
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.work_package_id IS NOT NULL THEN
      PERFORM public.refresh_work_package_progress(NEW.work_package_id);
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
    piece_mark
  ON public.pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.pieces_projection_after_change();

-- Ensure model_elements is in the realtime publication so the viewer can
-- invalidate when piece_id / fab_status / piece_mark mirrors change.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'model_elements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.model_elements;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication missing — skip model_elements add';
END $$;

NOTIFY pgrst, 'reload schema';
