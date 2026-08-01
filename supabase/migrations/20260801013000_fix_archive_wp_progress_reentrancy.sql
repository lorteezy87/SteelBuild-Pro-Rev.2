-- Fix archive / work-package soft-delete reentrancy
--
-- Symptom: "[projects.delete] tuple to be updated was already modified by an
-- operation triggered by the current command" every time a project is archived.
--
-- Cause: soft_delete_project UPDATEs work_packages.is_deleted → BEFORE trigger
-- unassigns pieces → pieces AFTER trigger calls refresh_work_package_progress →
-- that UPDATEs the same work_packages row still being soft-deleted.
--
-- Fix: transaction-local flag app.skip_wp_progress_refresh skips the progress
-- writer during soft-delete/archive; soft-delete trigger no longer calls refresh.

BEGIN;

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
  -- Skip when a soft-delete / archive is already updating this WP row
  -- (avoids: tuple to be updated was already modified by an operation triggered by the current command).
  IF current_setting('app.skip_wp_progress_refresh', true) = '1' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'soft_delete_in_progress');
  END IF;

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

CREATE OR REPLACE FUNCTION public.work_packages_soft_delete_unassign_pieces()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_became_deleted boolean;
BEGIN
  v_became_deleted :=
    (
      (NEW.is_deleted IS TRUE AND coalesce(OLD.is_deleted, false) IS DISTINCT FROM TRUE)
      OR (
        NEW.deleted_at IS NOT NULL
        AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
      )
    );

  IF NOT v_became_deleted THEN
    RETURN NEW;
  END IF;

  IF NEW.is_deleted IS DISTINCT FROM TRUE THEN
    NEW.is_deleted := true;
  END IF;
  IF NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;

  -- Prevent pieces_projection_after_change → refresh_work_package_progress
  -- from UPDATEing this same work_packages row mid-command.
  PERFORM set_config('app.skip_wp_progress_refresh', '1', true);

  INSERT INTO public.piece_events (
    project_id, piece_id, event_type, previous_state, next_state,
    reason, source_system, created_by
  )
  SELECT
    p.project_id,
    p.id,
    'assigned_to_work_package',
    jsonb_build_object('work_package_id', p.work_package_id),
    jsonb_build_object('work_package_id', NULL),
    'Unassigned because work package was deleted',
    'piece_control',
    NULL
  FROM public.pieces p
  WHERE p.work_package_id = NEW.id
    AND p.deleted_at IS NULL;

  UPDATE public.pieces p
  SET work_package_id = NULL
  WHERE p.work_package_id = NEW.id
    AND p.deleted_at IS NULL;

  -- Intentionally no refresh_work_package_progress here: that UPDATEs
  -- work_packages and collides with the outer soft-delete on this row.

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_at timestamptz := now();
  v_table text;
  v_updated int;
  v_child_tables text[] := ARRAY[
    'rfis','change_orders','deliveries','work_packages','documents','drawings',
    'drawing_sets','expenses','inspections','punchlist_items','safety_incidents',
    'scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions',
    'comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks',
    'email_messages','linked_folders','document_import_queue'
  ];
BEGIN
  -- Suppress WP progress write-through for the entire archive transaction.
  PERFORM set_config('app.skip_wp_progress_refresh', '1', true);

  IF NOT public.user_has_project_role_at_least(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete project %', p_project_id
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false',
      v_table
    ) USING v_deleted_at, p_project_id;
  END LOOP;

  UPDATE public.projects
     SET is_deleted = true,
         deleted_at = v_deleted_at
   WHERE id = p_project_id
     AND COALESCE(is_deleted, false) = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Project % not found or already archived', p_project_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_project(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
