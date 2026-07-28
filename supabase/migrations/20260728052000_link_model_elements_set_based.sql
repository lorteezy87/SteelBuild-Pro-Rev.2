-- Rewrite link_model_elements_to_pieces as a set-based join.
-- The prior FOR-loop (one SELECT + UPDATE per model_element) times out on
-- large IFC rosters under the default statement_timeout.

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
BEGIN
  -- Large rosters can still be heavy; raise the local budget for this RPC only.
  PERFORM set_config('statement_timeout', '120s', true);

  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link model elements in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  WITH leaves AS (
    SELECT
      p.id,
      p.normalized_piece_mark,
      p.lot_code,
      p.work_package_id,
      p.lifecycle_status
    FROM public.pieces p
    WHERE p.project_id = p_project_id
      AND p.is_deleted = false
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false
          AND child.deleted_at IS NULL
      )
  ),
  elements AS (
    SELECT
      me.id,
      me.piece_id AS old_piece_id,
      upper(trim(me.piece_mark)) AS mark,
      NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') AS lot
    FROM public.model_elements me
    WHERE me.project_id = p_project_id
      AND me.is_deleted = false
      AND coalesce(trim(me.piece_mark), '') <> ''
  ),
  match_stats AS (
    SELECT
      e.id AS element_id,
      e.old_piece_id,
      count(l.id)::integer AS match_count,
      (array_agg(l.id ORDER BY l.id))[1] AS piece_id,
      (array_agg(l.work_package_id ORDER BY l.id))[1] AS work_package_id,
      (array_agg(l.lifecycle_status ORDER BY l.id))[1] AS lifecycle_status
    FROM elements e
    LEFT JOIN leaves l
      ON l.normalized_piece_mark = e.mark
     AND (e.lot IS NULL OR l.lot_code = e.lot)
    GROUP BY e.id, e.old_piece_id
  ),
  _applied AS (
    UPDATE public.model_elements me
    SET
      piece_id = ms.piece_id,
      work_package_id = ms.work_package_id,
      fab_status = ms.lifecycle_status
    FROM match_stats ms
    WHERE me.id = ms.element_id
      AND ms.match_count = 1
      AND (
        me.piece_id IS DISTINCT FROM ms.piece_id
        OR me.work_package_id IS DISTINCT FROM ms.work_package_id
        OR me.fab_status IS DISTINCT FROM ms.lifecycle_status
      )
    RETURNING me.id
  ),
  counts AS (
    SELECT
      count(*) FILTER (
        WHERE ms.match_count = 1
          AND ms.old_piece_id IS NOT DISTINCT FROM ms.piece_id
      )::integer AS unchanged,
      count(*) FILTER (
        WHERE ms.match_count = 1
          AND ms.old_piece_id IS DISTINCT FROM ms.piece_id
      )::integer AS linked,
      count(*) FILTER (WHERE ms.match_count = 0)::integer AS unmatched,
      count(*) FILTER (WHERE ms.match_count > 1)::integer AS ambiguous
    FROM match_stats ms
  )
  SELECT c.linked, c.unchanged, c.unmatched, c.ambiguous
  INTO v_linked, v_unchanged, v_unmatched, v_ambiguous
  FROM counts c
  -- Force the data-modifying CTE to participate in the statement plan.
  WHERE (SELECT count(*) FROM _applied) >= 0;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'linked', COALESCE(v_linked, 0),
    'unchanged', COALESCE(v_unchanged, 0),
    'unmatched', COALESCE(v_unmatched, 0),
    'ambiguous', COALESCE(v_ambiguous, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_model_elements_to_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_model_elements_to_pieces(uuid) TO authenticated, service_role;
