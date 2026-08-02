-- Faster mark→piece linking for large IFC rosters.
-- 1) Pre-aggregate unique leaf keys (avoids element×leaf join explosion).
-- 2) Page RPC so the app can chunk under API statement_timeout.
-- 3) Pin statement_timeout on the functions (more reliable than set_config).

CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces_page(
  p_project_id uuid,
  p_limit integer DEFAULT 1500,
  p_after_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 1500), 5000));
  v_linked integer := 0;
  v_unmatched integer := 0;
  v_ambiguous integer := 0;
  v_unchanged integer := 0;
  v_processed integer := 0;
  v_next_after uuid;
  v_done boolean := false;
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
  uniq_mark_lot AS (
    SELECT
      l.normalized_piece_mark AS mark,
      l.lot_code AS lot,
      (array_agg(l.id ORDER BY l.id))[1] AS piece_id,
      (array_agg(l.work_package_id ORDER BY l.id))[1] AS work_package_id,
      (array_agg(l.lifecycle_status ORDER BY l.id))[1] AS lifecycle_status
    FROM leaves l
    GROUP BY l.normalized_piece_mark, l.lot_code
    HAVING count(*) = 1
  ),
  uniq_mark AS (
    SELECT
      l.normalized_piece_mark AS mark,
      (array_agg(l.id ORDER BY l.id))[1] AS piece_id,
      (array_agg(l.work_package_id ORDER BY l.id))[1] AS work_package_id,
      (array_agg(l.lifecycle_status ORDER BY l.id))[1] AS lifecycle_status
    FROM leaves l
    GROUP BY l.normalized_piece_mark
    HAVING count(*) = 1
  ),
  amb_mark_lot AS (
    SELECT l.normalized_piece_mark AS mark, l.lot_code AS lot
    FROM leaves l
    GROUP BY l.normalized_piece_mark, l.lot_code
    HAVING count(*) > 1
  ),
  amb_mark AS (
    SELECT l.normalized_piece_mark AS mark
    FROM leaves l
    GROUP BY l.normalized_piece_mark
    HAVING count(*) > 1
  ),
  page_elements AS (
    SELECT
      me.id,
      me.piece_id AS old_piece_id,
      upper(trim(me.piece_mark)) AS mark,
      NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') AS lot
    FROM public.model_elements me
    WHERE me.project_id = p_project_id
      AND me.is_deleted = false
      AND coalesce(trim(me.piece_mark), '') <> ''
      AND (p_after_id IS NULL OR me.id > p_after_id)
    ORDER BY me.id
    LIMIT v_limit
  ),
  resolved AS (
    SELECT
      e.id AS element_id,
      e.old_piece_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.piece_id ELSE um.piece_id END AS piece_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.work_package_id ELSE um.work_package_id END AS work_package_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.lifecycle_status ELSE um.lifecycle_status END AS lifecycle_status,
      CASE
        WHEN e.lot IS NOT NULL AND uml.piece_id IS NOT NULL THEN 1
        WHEN e.lot IS NULL AND um.piece_id IS NOT NULL THEN 1
        WHEN e.lot IS NOT NULL AND aml.mark IS NOT NULL THEN 2
        WHEN e.lot IS NULL AND am.mark IS NOT NULL THEN 2
        ELSE 0
      END AS match_count
    FROM page_elements e
    LEFT JOIN uniq_mark_lot uml ON e.lot IS NOT NULL AND uml.mark = e.mark AND uml.lot = e.lot
    LEFT JOIN uniq_mark um ON e.lot IS NULL AND um.mark = e.mark
    LEFT JOIN amb_mark_lot aml ON e.lot IS NOT NULL AND aml.mark = e.mark AND aml.lot = e.lot
    LEFT JOIN amb_mark am ON e.lot IS NULL AND am.mark = e.mark
  ),
  _applied AS (
    UPDATE public.model_elements me
    SET piece_id = r.piece_id, work_package_id = r.work_package_id, fab_status = r.lifecycle_status, updated_at = now()
    FROM resolved r
    WHERE me.id = r.element_id AND r.match_count = 1
      AND (me.piece_id IS DISTINCT FROM r.piece_id OR me.work_package_id IS DISTINCT FROM r.work_package_id OR me.fab_status IS DISTINCT FROM r.lifecycle_status)
    RETURNING me.id
  ),
  counts AS (
    SELECT
      count(*)::integer AS processed,
      max(r.element_id) AS next_after,
      count(*) FILTER (WHERE r.match_count = 1 AND r.old_piece_id IS NOT DISTINCT FROM r.piece_id)::integer AS unchanged,
      count(*) FILTER (WHERE r.match_count = 1 AND r.old_piece_id IS DISTINCT FROM r.piece_id)::integer AS linked,
      count(*) FILTER (WHERE r.match_count = 0)::integer AS unmatched,
      count(*) FILTER (WHERE r.match_count > 1)::integer AS ambiguous
    FROM resolved r
  )
  SELECT c.linked, c.unchanged, c.unmatched, c.ambiguous, c.processed, c.next_after, (c.processed < v_limit)
  INTO v_linked, v_unchanged, v_unmatched, v_ambiguous, v_processed, v_next_after, v_done
  FROM counts c
  WHERE (SELECT count(*) FROM _applied) >= 0;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'linked', COALESCE(v_linked, 0),
    'unchanged', COALESCE(v_unchanged, 0),
    'unmatched', COALESCE(v_unmatched, 0),
    'ambiguous', COALESCE(v_ambiguous, 0),
    'processed', COALESCE(v_processed, 0),
    'next_after_id', v_next_after,
    'done', COALESCE(v_done, true) OR COALESCE(v_processed, 0) = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_linked integer := 0;
  v_unmatched integer := 0;
  v_ambiguous integer := 0;
  v_unchanged integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link model elements in this project' USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode FROM public.projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  WITH leaves AS (
    SELECT p.id, p.normalized_piece_mark, p.lot_code, p.work_package_id, p.lifecycle_status
    FROM public.pieces p
    WHERE p.project_id = p_project_id AND p.is_deleted = false AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.pieces child WHERE child.parent_piece_id = p.id AND child.is_deleted = false AND child.deleted_at IS NULL)
  ),
  uniq_mark_lot AS (
    SELECT l.normalized_piece_mark AS mark, l.lot_code AS lot,
      (array_agg(l.id ORDER BY l.id))[1] AS piece_id,
      (array_agg(l.work_package_id ORDER BY l.id))[1] AS work_package_id,
      (array_agg(l.lifecycle_status ORDER BY l.id))[1] AS lifecycle_status
    FROM leaves l GROUP BY l.normalized_piece_mark, l.lot_code HAVING count(*) = 1
  ),
  uniq_mark AS (
    SELECT l.normalized_piece_mark AS mark,
      (array_agg(l.id ORDER BY l.id))[1] AS piece_id,
      (array_agg(l.work_package_id ORDER BY l.id))[1] AS work_package_id,
      (array_agg(l.lifecycle_status ORDER BY l.id))[1] AS lifecycle_status
    FROM leaves l GROUP BY l.normalized_piece_mark HAVING count(*) = 1
  ),
  amb_mark_lot AS (
    SELECT l.normalized_piece_mark AS mark, l.lot_code AS lot FROM leaves l
    GROUP BY l.normalized_piece_mark, l.lot_code HAVING count(*) > 1
  ),
  amb_mark AS (
    SELECT l.normalized_piece_mark AS mark FROM leaves l
    GROUP BY l.normalized_piece_mark HAVING count(*) > 1
  ),
  elements AS (
    SELECT me.id, me.piece_id AS old_piece_id, upper(trim(me.piece_mark)) AS mark,
      NULLIF(trim(COALESCE(me.metadata->>'lot_code', '')), '') AS lot
    FROM public.model_elements me
    WHERE me.project_id = p_project_id AND me.is_deleted = false AND coalesce(trim(me.piece_mark), '') <> ''
  ),
  resolved AS (
    SELECT e.id AS element_id, e.old_piece_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.piece_id ELSE um.piece_id END AS piece_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.work_package_id ELSE um.work_package_id END AS work_package_id,
      CASE WHEN e.lot IS NOT NULL THEN uml.lifecycle_status ELSE um.lifecycle_status END AS lifecycle_status,
      CASE
        WHEN e.lot IS NOT NULL AND uml.piece_id IS NOT NULL THEN 1
        WHEN e.lot IS NULL AND um.piece_id IS NOT NULL THEN 1
        WHEN e.lot IS NOT NULL AND aml.mark IS NOT NULL THEN 2
        WHEN e.lot IS NULL AND am.mark IS NOT NULL THEN 2
        ELSE 0
      END AS match_count
    FROM elements e
    LEFT JOIN uniq_mark_lot uml ON e.lot IS NOT NULL AND uml.mark = e.mark AND uml.lot = e.lot
    LEFT JOIN uniq_mark um ON e.lot IS NULL AND um.mark = e.mark
    LEFT JOIN amb_mark_lot aml ON e.lot IS NOT NULL AND aml.mark = e.mark AND aml.lot = e.lot
    LEFT JOIN amb_mark am ON e.lot IS NULL AND am.mark = e.mark
  ),
  _applied AS (
    UPDATE public.model_elements me
    SET piece_id = r.piece_id, work_package_id = r.work_package_id, fab_status = r.lifecycle_status, updated_at = now()
    FROM resolved r
    WHERE me.id = r.element_id AND r.match_count = 1
      AND (me.piece_id IS DISTINCT FROM r.piece_id OR me.work_package_id IS DISTINCT FROM r.work_package_id OR me.fab_status IS DISTINCT FROM r.lifecycle_status)
    RETURNING me.id
  ),
  counts AS (
    SELECT
      count(*) FILTER (WHERE r.match_count = 1 AND r.old_piece_id IS NOT DISTINCT FROM r.piece_id)::integer AS unchanged,
      count(*) FILTER (WHERE r.match_count = 1 AND r.old_piece_id IS DISTINCT FROM r.piece_id)::integer AS linked,
      count(*) FILTER (WHERE r.match_count = 0)::integer AS unmatched,
      count(*) FILTER (WHERE r.match_count > 1)::integer AS ambiguous
    FROM resolved r
  )
  SELECT c.linked, c.unchanged, c.unmatched, c.ambiguous
  INTO v_linked, v_unchanged, v_unmatched, v_ambiguous
  FROM counts c WHERE (SELECT count(*) FROM _applied) >= 0;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'linked', COALESCE(v_linked, 0),
    'unchanged', COALESCE(v_unchanged, 0),
    'unmatched', COALESCE(v_unmatched, 0),
    'ambiguous', COALESCE(v_ambiguous, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_model_elements_to_pieces_page(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_model_elements_to_pieces_page(uuid, integer, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.link_model_elements_to_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_model_elements_to_pieces(uuid) TO authenticated, service_role;
