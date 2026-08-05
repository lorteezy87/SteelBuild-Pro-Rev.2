-- Bulk-update allowlisted piece attributes (sequence / erection area).
-- Does NOT write work_package_id — use assign/unassign RPCs for that.

ALTER TABLE public.piece_events
  DROP CONSTRAINT IF EXISTS piece_events_event_type_check;

ALTER TABLE public.piece_events
  ADD CONSTRAINT piece_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'imported'::text,
      'updated_from_import'::text,
      'lot_split'::text,
      'lot_merged'::text,
      'assigned_to_work_package'::text,
      'drawing_linked'::text,
      'drawing_unlinked'::text,
      'hold_applied'::text,
      'hold_released'::text,
      'released_for_fabrication'::text,
      'release_exception'::text,
      'station_advanced'::text,
      'station_override'::text,
      'shipped'::text,
      'delivered'::text,
      'erected'::text,
      'archived'::text,
      'attributes_updated'::text
    ])
  );

CREATE OR REPLACE FUNCTION public.bulk_update_piece_attributes_impl(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_ids uuid[];
  v_expected integer;
  v_piece public.pieces%ROWTYPE;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_has_sequence boolean := v_patch ? 'sequence_number';
  v_has_area boolean := v_patch ? 'erection_area';
  v_next_sequence text;
  v_next_area text;
  v_prev jsonb;
  v_next jsonb;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to update pieces in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT v_has_sequence AND NOT v_has_area THEN
    RAISE EXCEPTION 'At least one allowlisted attribute is required';
  END IF;

  -- Reject unknown / forbidden keys (fail closed).
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_patch) AS key
    WHERE key NOT IN ('sequence_number', 'erection_area')
  ) THEN
    RAISE EXCEPTION 'Patch contains unsupported piece attributes';
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'At least one piece is required';
  END IF;

  IF (
    SELECT count(*) FROM public.pieces
    WHERE id = ANY (v_ids)
      AND project_id = p_project_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) <> v_expected THEN
    RAISE EXCEPTION 'All pieces must be active and belong to the same project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pieces AS parent
    JOIN public.pieces AS child
      ON child.parent_piece_id = parent.id
     AND child.deleted_at IS NULL
     AND child.is_deleted = false
    WHERE parent.id = ANY (v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be bulk-updated; use active leaf lots';
  END IF;

  IF v_has_sequence THEN
    IF jsonb_typeof(v_patch -> 'sequence_number') = 'null' THEN
      v_next_sequence := NULL;
    ELSE
      v_next_sequence := nullif(btrim(v_patch ->> 'sequence_number'), '');
    END IF;
  END IF;

  IF v_has_area THEN
    IF jsonb_typeof(v_patch -> 'erection_area') = 'null' THEN
      v_next_area := NULL;
    ELSE
      v_next_area := nullif(btrim(v_patch ->> 'erection_area'), '');
    END IF;
  END IF;

  FOR v_piece IN
    SELECT * FROM public.pieces
    WHERE id = ANY (v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF (
      (NOT v_has_sequence OR v_piece.sequence_number IS NOT DISTINCT FROM v_next_sequence)
      AND (NOT v_has_area OR v_piece.erection_area IS NOT DISTINCT FROM v_next_area)
    ) THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    v_prev := jsonb_build_object(
      'sequence_number', v_piece.sequence_number,
      'erection_area', v_piece.erection_area
    );

    UPDATE public.pieces
    SET
      sequence_number = CASE
        WHEN v_has_sequence THEN v_next_sequence
        ELSE sequence_number
      END,
      erection_area = CASE
        WHEN v_has_area THEN v_next_area
        ELSE erection_area
      END,
      updated_at = now()
    WHERE id = v_piece.id;

    v_next := jsonb_build_object(
      'sequence_number', CASE
        WHEN v_has_sequence THEN v_next_sequence
        ELSE v_piece.sequence_number
      END,
      'erection_area', CASE
        WHEN v_has_area THEN v_next_area
        ELSE v_piece.erection_area
      END
    );

    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      v_piece.id,
      'attributes_updated',
      v_prev,
      v_next,
      'Bulk attribute update from Piece Register',
      'piece_control',
      v_actor
    );
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'fields', (
      SELECT coalesce(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      FROM jsonb_object_keys(v_patch) AS key
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_piece_attributes(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_message text;
  v_detail text;
BEGIN
  RETURN public.bulk_update_piece_attributes_impl(
    p_project_id,
    p_piece_ids,
    p_patch
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN public.record_piece_control_command_failure(
    p_project_id,
    'bulk_update_piece_attributes',
    coalesce(p_piece_ids, '{}'::uuid[]),
    v_state,
    v_message,
    v_detail,
    jsonb_build_object('patch', coalesce(p_patch, '{}'::jsonb))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_piece_attributes_impl(uuid, uuid[], jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_update_piece_attributes(uuid, uuid[], jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_piece_attributes(uuid, uuid[], jsonb)
  TO authenticated;
