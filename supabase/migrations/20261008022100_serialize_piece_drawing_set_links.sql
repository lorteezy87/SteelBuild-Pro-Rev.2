-- Serialize drawing-set relationship changes with split_piece_lot_impl, which
-- already locks the source piece FOR UPDATE. Without the same lock here, a
-- concurrent link can pass the leaf check, wait at the FK insert, then add a
-- parent-only link after the split has copied links to its children.
--
-- Exclusive reassignment is a single RPC so an unlink and subsequent link
-- cannot straddle a split or leave a piece unmapped when the target fails.
-- Apply and hand-stamp this exact migration only through the approved rollout.

CREATE OR REPLACE FUNCTION public.link_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_is_container boolean;
  v_inserted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  -- This must precede the leaf check: split_piece_lot_impl locks the same row.
  SELECT is_container INTO v_is_container FROM public.pieces
  WHERE id = p_piece_id
    AND project_id = p_project_id
    AND deleted_at IS NULL
    AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;
  IF v_is_container THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pieces
    WHERE parent_piece_id = p_piece_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active drawing set not found in this project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_set_id, v_actor
  )
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      'Drawing set linked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'linked', v_inserted = 1,
    'unchanged', v_inserted = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unlink piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  -- Unlink retains its historical-piece cleanup semantics, but cannot run
  -- between a split's source lock and inherited-link copy.
  PERFORM 1 FROM public.pieces
  WHERE id = p_piece_id AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Piece and drawing set must belong to the same project';
  END IF;

  DELETE FROM public.piece_drawing_sets
  WHERE project_id = p_project_id
    AND piece_id = p_piece_id
    AND drawing_set_id = p_drawing_set_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_unlinked',
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      '{}'::jsonb,
      'Drawing set unlinked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'unlinked', v_deleted = 1,
    'unchanged', v_deleted = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_is_container boolean;
  v_inserted integer := 0;
  v_removed_set_ids uuid[] := '{}'::uuid[];
  v_removed_set_id uuid;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to replace piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  SELECT is_container INTO v_is_container FROM public.pieces
  WHERE id = p_piece_id
    AND project_id = p_project_id
    AND deleted_at IS NULL
    AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;
  IF v_is_container THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pieces
    WHERE parent_piece_id = p_piece_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active drawing set not found in this project';
  END IF;

  -- The table has independent FKs, not a composite project FK. Fail closed on
  -- a legacy malformed link rather than silently retaining or deleting it.
  IF EXISTS (
    SELECT 1
    FROM public.piece_drawing_sets AS link
    LEFT JOIN public.drawing_sets AS drawing_set
      ON drawing_set.id = link.drawing_set_id
    WHERE link.piece_id = p_piece_id
      AND (
        link.project_id <> p_project_id
        OR drawing_set.id IS NULL
        OR drawing_set.project_id <> p_project_id
      )
  ) THEN
    RAISE EXCEPTION 'Piece has a drawing-set link outside its project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_set_id, v_actor
  )
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  WITH removed AS (
    DELETE FROM public.piece_drawing_sets
    WHERE project_id = p_project_id
      AND piece_id = p_piece_id
      AND drawing_set_id <> p_drawing_set_id
    RETURNING drawing_set_id
  )
  SELECT coalesce(array_agg(drawing_set_id ORDER BY drawing_set_id), '{}'::uuid[])
    INTO v_removed_set_ids
  FROM removed;

  FOREACH v_removed_set_id IN ARRAY v_removed_set_ids LOOP
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_unlinked',
      jsonb_build_object('drawing_set_id', v_removed_set_id),
      '{}'::jsonb,
      'Drawing set replaced through Piece Control',
      'piece_control',
      v_actor
    );
  END LOOP;

  IF v_inserted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      'Drawing set assigned exclusively through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'linked', v_inserted = 1,
    'unlinked_count', cardinality(v_removed_set_ids),
    'removed_set_ids', to_jsonb(v_removed_set_ids),
    'unchanged', v_inserted = 0 AND cardinality(v_removed_set_ids) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
