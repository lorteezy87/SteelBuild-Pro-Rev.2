-- A split copies legacy piece_drawings but the newer piece_drawing_sets link
-- was introduced afterward. The release gate evaluates actionable leaf lots,
-- so a parent-only set link leaves both children without drawing authority.
-- Copy only links for the children returned by the existing split command.
-- Historical children are intentionally not backfilled: their links may have
-- been changed deliberately after splitting.
-- Apply and hand-stamp this exact migration only through the approved rollout.

CREATE OR REPLACE FUNCTION public.split_piece_lot(
  p_project_id uuid,
  p_piece_id uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_state text;
  v_message text;
  v_detail text;
BEGIN
  v_result := public.split_piece_lot_impl(p_project_id, p_piece_id, p_allocations);

  IF v_result IS NULL
     OR jsonb_typeof(v_result->'children') <> 'array'
     OR jsonb_array_length(v_result->'children') = 0 THEN
    RAISE EXCEPTION 'Split returned no child lots';
  END IF;

  -- A malformed child result or stale cross-project relationship must fail the
  -- entire split, rather than leaving an actionable child with fewer set links.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result->'children') AS returned(value)
    LEFT JOIN public.pieces AS child
      ON child.id = (returned.value->>'piece_id')::uuid
     AND child.project_id = p_project_id
     AND child.parent_piece_id = p_piece_id
    WHERE child.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Split child lot did not match the source project and parent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.piece_drawing_sets AS parent_link
    LEFT JOIN public.drawing_sets AS drawing_set
      ON drawing_set.id = parent_link.drawing_set_id
    WHERE parent_link.piece_id = p_piece_id
      AND (
        parent_link.project_id <> p_project_id
        OR drawing_set.id IS NULL
        OR drawing_set.project_id <> p_project_id
      )
  ) THEN
    RAISE EXCEPTION 'Source lot has a drawing-set link outside its project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  )
  SELECT DISTINCT
    p_project_id,
    child.id,
    parent_link.drawing_set_id,
    v_actor
  FROM jsonb_array_elements(v_result->'children') AS returned(value)
  JOIN public.pieces AS child
    ON child.id = (returned.value->>'piece_id')::uuid
   AND child.project_id = p_project_id
   AND child.parent_piece_id = p_piece_id
  JOIN public.piece_drawing_sets AS parent_link
    ON parent_link.piece_id = p_piece_id
   AND parent_link.project_id = p_project_id
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN public.record_piece_control_command_failure(
    p_project_id, 'split_piece_lot', ARRAY[p_piece_id],
    v_state, v_message, v_detail,
    jsonb_build_object(
      'allocation_count',
      CASE WHEN jsonb_typeof(p_allocations) = 'array'
        THEN jsonb_array_length(p_allocations)
        ELSE 0
      END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_piece_lot(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_piece_lot(uuid, uuid, jsonb) TO authenticated, service_role;
