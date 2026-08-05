-- Piece-mark → 3D re-link on mark change
-- 20260731003000 already mirrors mark/fab onto *already-linked* model_elements
-- and watches piece_mark. Gap: when a register mark changes (or a piece is
-- inserted) so that it now uniquely matches an *unlinked* model element, the
-- link is never created until the operator runs link_model_elements_to_pieces.
--
-- This migration:
-- 1) Adds a targeted helper that links unlinked model_elements for one piece
--    using the same leaf / lot / ambiguity rules as link_model_elements_to_pieces.
-- 2) Calls that helper from pieces_projection_after_change on mark change / insert.
-- 3) Adds normalized_piece_mark to the trigger UPDATE OF list (the function
--    already checked it, but Postgres only fires UPDATE OF for listed columns).

-- ─── targeted re-link helper ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_unlinked_model_elements_for_piece(p_piece_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_mark text;
  v_lot text;
  v_wp uuid;
  v_lifecycle text;
  v_is_leaf boolean := false;
  v_sibling_count integer := 0;
  v_linked integer := 0;
BEGIN
  IF p_piece_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    p.project_id,
    NULLIF(p.normalized_piece_mark, ''),
    NULLIF(trim(COALESCE(p.lot_code, '')), ''),
    p.work_package_id,
    p.lifecycle_status,
    (
      COALESCE(p.is_container, false) = false
      AND p.is_deleted = false
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false
          AND child.deleted_at IS NULL
      )
    )
  INTO
    v_project_id,
    v_mark,
    v_lot,
    v_wp,
    v_lifecycle,
    v_is_leaf
  FROM public.pieces p
  WHERE p.id = p_piece_id;

  -- No piece, no mark, or not an actionable leaf → nothing to link.
  IF v_project_id IS NULL OR v_mark IS NULL OR NOT v_is_leaf THEN
    RETURN 0;
  END IF;

  -- Ambiguity guard: another actionable leaf with the same mark (+ lot when set)
  -- means the full link RPC would leave these elements unmatched/ambiguous.
  IF v_lot IS NOT NULL THEN
    SELECT count(*) INTO v_sibling_count
    FROM public.pieces p
    WHERE p.project_id = v_project_id
      AND p.id IS DISTINCT FROM p_piece_id
      AND p.is_deleted = false
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false
          AND child.deleted_at IS NULL
      )
      AND p.normalized_piece_mark = v_mark
      AND p.lot_code = v_lot;
  ELSE
    SELECT count(*) INTO v_sibling_count
    FROM public.pieces p
    WHERE p.project_id = v_project_id
      AND p.id IS DISTINCT FROM p_piece_id
      AND p.is_deleted = false
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false
          AND child.deleted_at IS NULL
      )
      AND p.normalized_piece_mark = v_mark;
  END IF;

  IF v_sibling_count > 0 THEN
    RETURN 0;
  END IF;

  -- Link unlinked model elements whose mark matches this unique leaf.
  -- Lot on the element (metadata.lot_code) is optional; when present it must
  -- equal the piece lot. When absent, any unique mark match is enough — same
  -- as link_model_elements_to_pieces.
  IF v_lot IS NOT NULL THEN
    UPDATE public.model_elements me
    SET
      piece_id = p_piece_id,
      work_package_id = v_wp,
      fab_status = v_lifecycle
    WHERE me.project_id = v_project_id
      AND me.is_deleted = false
      AND me.piece_id IS NULL
      AND upper(trim(me.piece_mark)) = v_mark
      AND (
        NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') IS NULL
        OR NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') = v_lot
      );
  ELSE
    UPDATE public.model_elements me
    SET
      piece_id = p_piece_id,
      work_package_id = v_wp,
      fab_status = v_lifecycle
    WHERE me.project_id = v_project_id
      AND me.is_deleted = false
      AND me.piece_id IS NULL
      AND upper(trim(me.piece_mark)) = v_mark
      AND NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') IS NULL;
  END IF;

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN COALESCE(v_linked, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.link_unlinked_model_elements_for_piece(uuid) FROM PUBLIC, anon;
-- Trigger-only helper; authenticated callers should use link_model_elements_to_pieces.
GRANT EXECUTE ON FUNCTION public.link_unlinked_model_elements_for_piece(uuid) TO service_role;

-- ─── projection trigger: mirror + targeted re-link ───────────────────────────

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

    -- When the mark changes, also attach previously unmatched 3D elements that
    -- now uniquely match this leaf. Does not reassign elements already linked
    -- to other pieces (safer; use full link RPC for intentional reassignments).
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
    -- New register rows can satisfy unmatched model marks immediately.
    IF COALESCE(trim(NEW.normalized_piece_mark), '') <> ''
       OR COALESCE(trim(NEW.piece_mark), '') <> '' THEN
      PERFORM public.link_unlinked_model_elements_for_piece(NEW.id);
    END IF;

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
    piece_mark,
    normalized_piece_mark
  ON public.pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.pieces_projection_after_change();

NOTIFY pgrst, 'reload schema';
