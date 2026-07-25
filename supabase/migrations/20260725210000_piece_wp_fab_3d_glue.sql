-- Piece ↔ WP ↔ Fab ↔ 3D glue
-- 1) refresh_work_package_progress — write-through % + status from leaf pieces
-- 2) Triggers: pieces → model_elements mirror + WP refresh; station completions → refresh
-- 3) link_model_elements_to_pieces — lot-aware exact mark match
-- 4) assign/unassign return model_elements_synced (mirror via trigger)

-- ─── refresh_work_package_progress ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_work_package_progress(p_work_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_mode text;
  v_leaf_count integer := 0;
  v_on_hold_count integer := 0;
  v_known_tons numeric := 0;
  v_earned_ton_sum numeric := 0;
  v_lot_count integer := 0;
  v_earned_lot_sum numeric := 0;
  v_percent numeric := 0;
  v_status text := 'Not Started';
  v_has_station_config boolean := false;
  r record;
  v_earned numeric;
  v_tons numeric;
BEGIN
  IF p_work_package_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_work_package');
  END IF;

  SELECT wp.project_id, p.piece_control_mode
    INTO v_project_id, v_mode
  FROM public.work_packages wp
  JOIN public.projects p ON p.id = wp.project_id
  WHERE wp.id = p_work_package_id
    AND wp.is_deleted = false
    AND wp.deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'work_package_not_found');
  END IF;

  -- Only write through when piece control is active.
  IF v_mode IS NULL OR v_mode = 'off' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'piece_control_off');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.piece_station_configurations c
    WHERE c.project_id = v_project_id AND c.is_active = true
  ) INTO v_has_station_config;

  SELECT count(*), count(*) FILTER (WHERE on_hold)
    INTO v_leaf_count, v_on_hold_count
  FROM public.pieces p
  WHERE p.work_package_id = p_work_package_id
    AND p.is_deleted = false
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_container, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.pieces child
      WHERE child.parent_piece_id = p.id
        AND child.is_deleted = false
        AND child.deleted_at IS NULL
    );

  IF v_leaf_count = 0 THEN
    UPDATE public.work_packages
    SET percent_complete = 0,
        status = 'Not Started'
    WHERE id = p_work_package_id;
    RETURN jsonb_build_object(
      'ok', true,
      'work_package_id', p_work_package_id,
      'percent_complete', 0,
      'status', 'Not Started',
      'leaf_count', 0
    );
  END IF;

  IF v_on_hold_count = v_leaf_count THEN
    v_status := 'On Hold';
  ELSIF (
    SELECT bool_and(p.lifecycle_status = 'erected')
    FROM public.pieces p
    WHERE p.work_package_id = p_work_package_id
      AND p.is_deleted = false AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false AND child.deleted_at IS NULL
      )
  ) THEN
    v_status := 'Complete';
  ELSIF (
    SELECT bool_or(p.lifecycle_status IN (
      'in_fabrication', 'fabricated', 'shipped', 'delivered', 'erected'
    ))
    FROM public.pieces p
    WHERE p.work_package_id = p_work_package_id
      AND p.is_deleted = false AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false AND child.deleted_at IS NULL
      )
  ) THEN
    v_status := 'In Progress';
  ELSE
    v_status := 'Not Started';
  END IF;

  FOR r IN
    SELECT p.id, p.lifecycle_status, p.on_hold, p.quantity, p.weight_each_lbs, p.weight_total_lbs
    FROM public.pieces p
    WHERE p.work_package_id = p_work_package_id
      AND p.is_deleted = false
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND child.is_deleted = false
          AND child.deleted_at IS NULL
      )
  LOOP
    v_lot_count := v_lot_count + 1;
    IF v_has_station_config THEN
      SELECT COALESCE(SUM(c.earned_percent), 0) INTO v_earned
      FROM public.piece_station_completions c
      WHERE c.piece_id = r.id;
      v_earned := LEAST(100, v_earned);
    ELSE
      v_earned := CASE r.lifecycle_status
        WHEN 'not_started' THEN 0
        WHEN 'released' THEN 5
        WHEN 'in_fabrication' THEN 40
        WHEN 'fabricated' THEN 70
        WHEN 'shipped' THEN 85
        WHEN 'delivered' THEN 95
        WHEN 'erected' THEN 100
        ELSE 0
      END;
    END IF;
    v_earned_lot_sum := v_earned_lot_sum + v_earned;

    IF r.weight_each_lbs IS NOT NULL AND r.quantity IS NOT NULL THEN
      IF r.weight_total_lbs IS NOT NULL
         AND abs((r.weight_each_lbs * r.quantity) - r.weight_total_lbs)
             > GREATEST(0.01, r.weight_total_lbs * 0.01) THEN
        v_tons := (r.weight_each_lbs * r.quantity) / 2000.0;
      ELSIF r.weight_total_lbs IS NOT NULL THEN
        v_tons := r.weight_total_lbs / 2000.0;
      ELSE
        v_tons := (r.weight_each_lbs * r.quantity) / 2000.0;
      END IF;
    ELSIF r.weight_total_lbs IS NOT NULL THEN
      v_tons := r.weight_total_lbs / 2000.0;
    ELSE
      v_tons := NULL;
    END IF;

    IF v_tons IS NOT NULL AND v_tons > 0 THEN
      v_known_tons := v_known_tons + v_tons;
      v_earned_ton_sum := v_earned_ton_sum + (v_tons * v_earned);
    END IF;
  END LOOP;

  IF v_known_tons > 0 THEN
    v_percent := ROUND(v_earned_ton_sum / v_known_tons, 2);
  ELSIF v_lot_count > 0 THEN
    v_percent := ROUND(v_earned_lot_sum / v_lot_count, 2);
  ELSE
    v_percent := 0;
  END IF;

  v_percent := GREATEST(0, LEAST(100, v_percent));

  UPDATE public.work_packages
  SET percent_complete = v_percent,
      status = v_status
  WHERE id = p_work_package_id;

  RETURN jsonb_build_object(
    'ok', true,
    'work_package_id', p_work_package_id,
    'percent_complete', v_percent,
    'status', v_status,
    'leaf_count', v_leaf_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_work_package_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_work_package_progress(uuid) TO authenticated, service_role;

-- ─── pieces → model_elements mirror + WP refresh ─────────────────────────────

CREATE OR REPLACE FUNCTION public.pieces_projection_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.work_package_id IS DISTINCT FROM OLD.work_package_id
       OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
       OR NEW.on_hold IS DISTINCT FROM OLD.on_hold THEN
      UPDATE public.model_elements me
      SET work_package_id = NEW.work_package_id,
          fab_status = NEW.lifecycle_status
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
  AFTER INSERT OR UPDATE OF work_package_id, lifecycle_status, on_hold
  ON public.pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.pieces_projection_after_change();

CREATE OR REPLACE FUNCTION public.piece_station_completion_refresh_wp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wp uuid;
BEGIN
  SELECT work_package_id INTO v_wp
  FROM public.pieces
  WHERE id = NEW.piece_id;
  IF v_wp IS NOT NULL THEN
    PERFORM public.refresh_work_package_progress(v_wp);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piece_station_completion_refresh_wp ON public.piece_station_completions;
CREATE TRIGGER trg_piece_station_completion_refresh_wp
  AFTER INSERT ON public.piece_station_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.piece_station_completion_refresh_wp();

-- ─── link_model_elements_to_pieces ───────────────────────────────────────────

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

    IF v_lot IS NOT NULL THEN
      SELECT count(*), min(p.id)
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
      SELECT count(*), min(p.id)
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
        -- Still refresh mirror fields
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

-- ─── assign / unassign — report model_elements_synced ────────────────────────

CREATE OR REPLACE FUNCTION public.assign_pieces_to_work_package(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_work_package_id uuid
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
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_synced integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to assign pieces in this project' USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN RAISE EXCEPTION 'At least one piece is required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_packages
    WHERE id = p_work_package_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active work package not found in this project';
  END IF;

  IF (
    SELECT count(*) FROM public.pieces
    WHERE id = ANY(v_ids)
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
    WHERE parent.id = ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be assigned; assign active leaf lots instead';
  END IF;

  FOR v_piece IN
    SELECT * FROM public.pieces
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_piece.work_package_id IS NOT DISTINCT FROM p_work_package_id THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE public.pieces
    SET work_package_id = p_work_package_id
    WHERE id = v_piece.id;

    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      v_piece.id,
      'assigned_to_work_package',
      jsonb_build_object('work_package_id', v_piece.work_package_id),
      jsonb_build_object('work_package_id', p_work_package_id),
      'Assigned through Piece Control',
      'piece_control',
      v_actor
    );
    v_changed := v_changed + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_synced
  FROM public.model_elements
  WHERE piece_id = ANY(v_ids)
    AND is_deleted = false
    AND work_package_id IS NOT DISTINCT FROM p_work_package_id;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'work_package_id', p_work_package_id,
    'assigned', v_changed,
    'unchanged', v_unchanged,
    'model_elements_synced', v_synced
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_pieces_from_work_package(
  p_project_id uuid,
  p_piece_ids uuid[]
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
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_synced integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unassign pieces in this project' USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN RAISE EXCEPTION 'At least one piece is required'; END IF;

  IF (
    SELECT count(*) FROM public.pieces
    WHERE id = ANY(v_ids)
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
    WHERE parent.id = ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be unassigned; use active leaf lots instead';
  END IF;

  FOR v_piece IN
    SELECT * FROM public.pieces
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_piece.work_package_id IS NULL THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE public.pieces
    SET work_package_id = NULL
    WHERE id = v_piece.id;

    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      v_piece.id,
      'assigned_to_work_package',
      jsonb_build_object('work_package_id', v_piece.work_package_id),
      jsonb_build_object('work_package_id', NULL),
      'Unassigned through Piece Control',
      'piece_control',
      v_actor
    );
    v_changed := v_changed + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_synced
  FROM public.model_elements
  WHERE piece_id = ANY(v_ids)
    AND is_deleted = false
    AND work_package_id IS NULL;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'unassigned', v_changed,
    'unchanged', v_unchanged,
    'model_elements_synced', v_synced
  );
END;
$$;
