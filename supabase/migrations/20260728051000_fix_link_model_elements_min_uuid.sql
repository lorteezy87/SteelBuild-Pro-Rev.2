-- Fix: link_model_elements_to_pieces aggregated piece ids with min() on uuid,
-- which Postgres rejects ("function min(uuid) does not exist"). Use array_agg.
-- Applied DBs that already ran 20260725210000 need this REPLACE; fresh resets
-- get the corrected body from the patched glue migration as well.

CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_linked integer := 0;
  v_unmatched integer := 0;
  v_ambiguous integer := 0;
  v_unchanged integer := 0;
  el record;
  v_mark text;
  v_lot text;
  v_piece_id uuid;
  v_match_count integer;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link model elements in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  FOR el IN
    SELECT id, piece_mark, metadata, piece_id
    FROM public.model_elements
    WHERE project_id = p_project_id
      AND is_deleted = false
      AND coalesce(trim(piece_mark), '') <> ''
  LOOP
    v_mark := upper(trim(el.piece_mark));
    v_lot := NULLIF(trim(COALESCE(el.metadata->>'lot_code', '')), '');

    -- Postgres has no min(uuid); pick a deterministic id via array_agg.
    IF v_lot IS NOT NULL THEN
      SELECT count(*)::integer, (array_agg(p.id ORDER BY p.id))[1]
        INTO v_match_count, v_piece_id
      FROM public.pieces p
      WHERE p.project_id = p_project_id
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
      SELECT count(*)::integer, (array_agg(p.id ORDER BY p.id))[1]
        INTO v_match_count, v_piece_id
      FROM public.pieces p
      WHERE p.project_id = p_project_id
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

    IF v_match_count = 1 THEN
      IF el.piece_id IS NOT DISTINCT FROM v_piece_id THEN
        UPDATE public.model_elements me
        SET work_package_id = p.work_package_id,
            fab_status = p.lifecycle_status
        FROM public.pieces p
        WHERE me.id = el.id AND p.id = v_piece_id;
        v_unchanged := v_unchanged + 1;
      ELSE
        UPDATE public.model_elements me
        SET piece_id = v_piece_id,
            work_package_id = p.work_package_id,
            fab_status = p.lifecycle_status
        FROM public.pieces p
        WHERE me.id = el.id AND p.id = v_piece_id;
        v_linked := v_linked + 1;
      END IF;
    ELSIF v_match_count = 0 THEN
      v_unmatched := v_unmatched + 1;
    ELSE
      v_ambiguous := v_ambiguous + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'linked', v_linked,
    'unchanged', v_unchanged,
    'unmatched', v_unmatched,
    'ambiguous', v_ambiguous
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_model_elements_to_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_model_elements_to_pieces(uuid) TO authenticated, service_role;
