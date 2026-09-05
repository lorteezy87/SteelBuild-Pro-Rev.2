-- Work Package Control Center — integrity fixes
-- (docs/audits/WP_CONTROL_CENTER_AUDIT_2026-09-05.md §1, §4).
--
-- 1) One live WP number per project. Numbers come from get_next_sequence_number,
--    but bulk add accepted any pasted value ("flagged but allowed") and nothing
--    in the schema stopped a duplicate. Partial unique index on the live rows.
-- 2) refresh_work_package_progress:
--    - shadow mode is read-only: it no longer writes percent/status (the mode
--      exists so a project can compare the rollup against hand-kept numbers).
--    - derives `phase` from the furthest piece so the package stops sitting in
--      "Erection" with nothing fabricated (observed in production).
--    - zero leaf lots no longer resets status to Not Started / 0 % — a package
--      whose pieces were all unassigned keeps what the PM last recorded.
--    - single pass over the leaf lots (was four scans + a per-row loop).
--    - only UPDATEs when a value actually changes (audit + realtime churn).
--    - EXECUTE revoked from `authenticated`: every caller is a SECURITY DEFINER
--      trigger function; it was also callable directly by any signed-in user.
-- 3) release_work_package_canonical_impl stamps work_packages.released_date
--    (and bumps a Detailing phase to Fabrication) so the package row agrees
--    with the fab_releases row it just created, and refreshes the rollup once
--    instead of once per piece.
-- 4) assign / unassign run the rollup once per touched package instead of
--    once per piece (N pieces → N full recomputations).

BEGIN;

-- ─── 1) unique live WP number per project ────────────────────────────────────

DO $$
DECLARE
  v_dupes text;
BEGIN
  SELECT string_agg(format('%s × %s (%s)', wp_number, n, project_id), ', ')
    INTO v_dupes
  FROM (
    SELECT project_id, lower(btrim(wp_number)) AS wp_number, count(*) AS n
    FROM public.work_packages
    WHERE is_deleted = false
      AND deleted_at IS NULL
      AND nullif(btrim(wp_number), '') IS NOT NULL
    GROUP BY project_id, lower(btrim(wp_number))
    HAVING count(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'work_packages has duplicate live WP numbers; renumber before applying: %', v_dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS work_packages_project_wp_number_live_uidx
  ON public.work_packages (project_id, lower(btrim(wp_number)))
  WHERE is_deleted = false
    AND deleted_at IS NULL
    AND nullif(btrim(wp_number), '') IS NOT NULL;

COMMENT ON INDEX public.work_packages_project_wp_number_live_uidx IS
  'One live WP number per project (case/whitespace-insensitive). Soft-deleted rows are excluded so a number can be reused after a delete.';

-- ─── 2) refresh_work_package_progress ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_work_package_progress(p_work_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_mode text;
  v_has_station_config boolean := false;
  v_leaf_count integer := 0;
  v_on_hold_count integer := 0;
  v_erected_count integer := 0;
  v_delivered_count integer := 0;
  v_shipped_count integer := 0;
  v_in_shop_count integer := 0;      -- in_fabrication / fabricated
  v_released_count integer := 0;
  v_started_count integer := 0;      -- past `released`
  v_known_tons numeric := 0;
  v_earned_ton_sum numeric := 0;
  v_earned_lot_sum numeric := 0;
  v_percent numeric := 0;
  v_status text := 'Not Started';
  v_phase text := 'Detailing';
  v_old_percent numeric;
  v_old_status text;
  v_old_phase text;
BEGIN
  -- Skip when a soft-delete / archive / batch command is already updating
  -- this WP row (avoids: tuple to be updated was already modified by an
  -- operation triggered by the current command).
  IF current_setting('app.skip_wp_progress_refresh', true) = '1' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'refresh_suppressed');
  END IF;

  IF p_work_package_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_work_package');
  END IF;

  SELECT wp.project_id, p.piece_control_mode, wp.percent_complete, wp.status, wp.phase
    INTO v_project_id, v_mode, v_old_percent, v_old_status, v_old_phase
  FROM public.work_packages wp
  JOIN public.projects p ON p.id = wp.project_id
  WHERE wp.id = p_work_package_id
    AND wp.is_deleted = false
    AND wp.deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'work_package_not_found');
  END IF;

  -- Only pilot / live write through. `shadow` computes for comparison in the
  -- UI but must not overwrite hand-kept status; `off` never runs.
  IF v_mode IS NULL OR v_mode NOT IN ('pilot', 'live') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'piece_control_' || coalesce(v_mode, 'off'));
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.piece_station_configurations c
    WHERE c.project_id = v_project_id AND c.is_active = true
  ) INTO v_has_station_config;

  -- One pass over the leaf lots: counts, tonnage and earned value together.
  WITH leaves AS (
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
  ),
  scored AS (
    SELECT
      l.*,
      CASE
        WHEN v_has_station_config THEN LEAST(100, (
          SELECT COALESCE(SUM(c.earned_percent), 0)
          FROM public.piece_station_completions c
          WHERE c.piece_id = l.id
        ))
        ELSE CASE l.lifecycle_status
          WHEN 'not_started' THEN 0
          WHEN 'released' THEN 5
          WHEN 'in_fabrication' THEN 40
          WHEN 'fabricated' THEN 70
          WHEN 'shipped' THEN 85
          WHEN 'delivered' THEN 95
          WHEN 'erected' THEN 100
          ELSE 0
        END
      END AS earned,
      -- Same tonnage rule as the client `pieceTons` helper: each×qty wins when
      -- it disagrees with the stored total by more than 1 %.
      CASE
        WHEN l.weight_each_lbs IS NOT NULL AND l.quantity IS NOT NULL THEN
          CASE
            WHEN l.weight_total_lbs IS NOT NULL
                 AND abs((l.weight_each_lbs * l.quantity) - l.weight_total_lbs)
                     > GREATEST(0.01, l.weight_total_lbs * 0.01)
              THEN (l.weight_each_lbs * l.quantity) / 2000.0
            WHEN l.weight_total_lbs IS NOT NULL
              THEN l.weight_total_lbs / 2000.0
            ELSE (l.weight_each_lbs * l.quantity) / 2000.0
          END
        WHEN l.weight_total_lbs IS NOT NULL THEN l.weight_total_lbs / 2000.0
        ELSE NULL
      END AS tons
    FROM leaves l
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE on_hold),
    count(*) FILTER (WHERE lifecycle_status = 'erected'),
    count(*) FILTER (WHERE lifecycle_status = 'delivered'),
    count(*) FILTER (WHERE lifecycle_status = 'shipped'),
    count(*) FILTER (WHERE lifecycle_status IN ('in_fabrication', 'fabricated')),
    count(*) FILTER (WHERE lifecycle_status = 'released'),
    count(*) FILTER (WHERE lifecycle_status IN ('in_fabrication', 'fabricated', 'shipped', 'delivered', 'erected')),
    COALESCE(SUM(tons) FILTER (WHERE tons > 0), 0),
    COALESCE(SUM(tons * earned) FILTER (WHERE tons > 0), 0),
    COALESCE(SUM(earned), 0)
  INTO
    v_leaf_count, v_on_hold_count, v_erected_count, v_delivered_count, v_shipped_count,
    v_in_shop_count, v_released_count, v_started_count,
    v_known_tons, v_earned_ton_sum, v_earned_lot_sum
  FROM scored;

  -- No leaf lots: nothing to derive from. Leave the hand-kept values alone
  -- (this used to zero percent and force Not Started on the first unassign).
  IF v_leaf_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'no_leaf_lots',
      'work_package_id', p_work_package_id,
      'leaf_count', 0
    );
  END IF;

  IF v_on_hold_count = v_leaf_count THEN
    v_status := 'On Hold';
  ELSIF v_erected_count = v_leaf_count THEN
    v_status := 'Complete';
  ELSIF v_started_count > 0 THEN
    v_status := 'In Progress';
  ELSE
    v_status := 'Not Started';
  END IF;

  -- Phase follows the furthest piece. Mirrors derivePhaseFromPieces() in the
  -- Control Center so the page and the column agree.
  IF v_erected_count > 0 OR v_delivered_count > 0 THEN
    v_phase := 'Erection';
  ELSIF v_shipped_count > 0 THEN
    v_phase := 'Delivery';
  ELSIF v_in_shop_count > 0 OR v_released_count > 0 THEN
    v_phase := 'Fabrication';
  ELSE
    v_phase := 'Detailing';
  END IF;

  IF v_known_tons > 0 THEN
    v_percent := ROUND(v_earned_ton_sum / v_known_tons, 2);
  ELSE
    v_percent := ROUND(v_earned_lot_sum / v_leaf_count, 2);
  END IF;
  v_percent := GREATEST(0, LEAST(100, v_percent));

  IF v_old_percent IS DISTINCT FROM v_percent
     OR v_old_status IS DISTINCT FROM v_status
     OR v_old_phase IS DISTINCT FROM v_phase THEN
    UPDATE public.work_packages
    SET percent_complete = v_percent,
        status = v_status,
        phase = v_phase
    WHERE id = p_work_package_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'work_package_id', p_work_package_id,
    'percent_complete', v_percent,
    'status', v_status,
    'phase', v_phase,
    'leaf_count', v_leaf_count,
    'changed', (v_old_percent IS DISTINCT FROM v_percent
                OR v_old_status IS DISTINCT FROM v_status
                OR v_old_phase IS DISTINCT FROM v_phase)
  );
END;
$$;

-- Trigger functions (SECURITY DEFINER, owned by the migration role) are the
-- only legitimate callers. A signed-in user could previously invoke this on
-- any package id and force a rollup write regardless of project role.
REVOKE ALL ON FUNCTION public.refresh_work_package_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_work_package_progress(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_work_package_progress(uuid) IS
  'Piece rollup → work_packages.percent_complete/status/phase. pilot/live only; shadow and off are read-only. Trigger-invoked; not callable by authenticated.';

-- ─── 3) canonical release stamps the package + one rollup ────────────────────

CREATE OR REPLACE FUNCTION "public"."release_work_package_canonical_impl"(
  p_work_package_id uuid,
  p_exception_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_work_package "public"."work_packages"%ROWTYPE;
  v_mode text;
  v_gate jsonb;
  v_release_id uuid := gen_random_uuid();
  v_release_number text;
  v_release_name text;
  v_is_exception boolean;
  v_risk_id uuid;
  v_piece_count integer;
  v_piece_marks text;
  v_weight_tons numeric;
  v_piece "public"."pieces"%ROWTYPE;
  v_previous_lifecycle text;
  v_next_lifecycle text;
BEGIN
  SELECT * INTO v_work_package
  FROM "public"."work_packages"
  WHERE "id" = p_work_package_id
    AND "is_deleted" = false
    AND "deleted_at" IS NULL
  FOR UPDATE;
  IF v_work_package.id IS NULL THEN RAISE EXCEPTION 'Active work package not found'; END IF;

  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(v_work_package.project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to release this work package'
      USING errcode = '42501';
  END IF;
  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects" WHERE "id" = v_work_package.project_id;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF EXISTS (
    SELECT 1 FROM "public"."fab_releases"
    WHERE "work_package_id" = p_work_package_id
      AND coalesce("is_deleted", false) = false
      AND (
        "canonical_release" = true
        OR lower(coalesce("status", '')) = 'released'
      )
  ) THEN
    RAISE EXCEPTION 'CANONICAL_RELEASE_ALREADY_EXISTS: This work package is already released';
  END IF;

  v_gate := "public"."evaluate_release_gate"(p_work_package_id);
  IF coalesce((v_gate -> 'checks' -> 'scope' ->> 'passed')::boolean, false) = false THEN
    RAISE EXCEPTION 'CANONICAL_RELEASE_NO_SCOPE: A release exception cannot bypass missing canonical piece scope';
  END IF;
  IF coalesce((v_gate ->> 'already_released')::boolean, false) THEN
    RAISE EXCEPTION 'CANONICAL_RELEASE_ALREADY_EXISTS: This work package is already released';
  END IF;

  v_is_exception := NOT coalesce((v_gate ->> 'passes')::boolean, false);
  IF v_is_exception AND coalesce(btrim(p_exception_reason), '') = '' THEN
    RAISE EXCEPTION 'CANONICAL_RELEASE_BLOCKED: Release gate failed; a non-empty exception reason is required';
  END IF;

  WITH scope AS (
    SELECT piece.*
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_work_package.project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  )
  SELECT
    count(*),
    string_agg("piece_mark" || CASE WHEN "lot_code" = 'ALL' THEN '' ELSE ':' || "lot_code" END, ', ' ORDER BY "piece_mark", "lot_code"),
    coalesce(sum(
      coalesce("weight_total_lbs", "weight_each_lbs" * "quantity", 0)
    ), 0) / 2000.0
  INTO v_piece_count, v_piece_marks, v_weight_tons
  FROM scope;

  v_release_number :=
    'PCR-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    upper(substr(replace(v_release_id::text, '-', ''), 1, 8));
  v_release_name := coalesce(
    nullif(btrim(v_work_package.wp_number), ''),
    nullif(btrim(v_work_package.name), ''),
    'Canonical work package'
  );

  PERFORM set_config('app.canonical_release_command', 'on', true);

  INSERT INTO "public"."fab_releases" (
    "id", "project_id", "release_number", "name", "status",
    "work_package_id", "piece_marks", "weight_tons", "piece_count",
    "release_date", "notes", "is_deleted", "canonical_release",
    "released_by", "released_at", "gate_snapshot", "is_exception",
    "exception_reason", "release_source"
  ) VALUES (
    v_release_id, v_work_package.project_id, v_release_number, v_release_name, 'Released',
    p_work_package_id, v_piece_marks, v_weight_tons, v_piece_count,
    current_date, nullif(btrim(p_exception_reason), ''), false, true,
    v_actor, now(), v_gate, v_is_exception,
    CASE WHEN v_is_exception THEN btrim(p_exception_reason) ELSE NULL END,
    'piece_control'
  );

  IF v_is_exception THEN
    INSERT INTO "public"."risks" (
      "project_id", "title", "description", "category", "probability", "impact",
      "status", "mitigation_plan", "trigger_event", "metadata"
    ) VALUES (
      v_work_package.project_id,
      'Exception fab release: ' || v_release_name,
      'Canonical fabrication release proceeded with blockers. Reason: ' ||
        btrim(p_exception_reason) || '. Blockers: ' ||
        array_to_string(
          ARRAY(SELECT jsonb_array_elements_text(coalesce(v_gate -> 'blockers', '[]'::jsonb))),
          '; '
        ),
      'Schedule',
      4,
      4,
      'Open',
      'Resolve every blocker captured in the release gate snapshot and verify downstream schedule impact.',
      'Canonical fabrication release exception',
      jsonb_build_object(
        'source', 'piece_control',
        'fab_release_id', v_release_id,
        'work_package_id', p_work_package_id,
        'gate_snapshot', v_gate,
        'exception_reason', btrim(p_exception_reason)
      )
    )
    RETURNING "id" INTO v_risk_id;

    UPDATE "public"."fab_releases"
    SET "risk_id" = v_risk_id
    WHERE "id" = v_release_id;
  END IF;

  -- Each piece UPDATE fires the projection trigger, which would recompute
  -- the package rollup once per piece. Suppress it for the loop and run it
  -- once at the end.
  PERFORM set_config('app.skip_wp_progress_refresh', '1', true);

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_work_package.project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
    ORDER BY piece."id"
    FOR UPDATE
  LOOP
    v_previous_lifecycle := v_piece.lifecycle_status;
    v_next_lifecycle := CASE
      WHEN v_piece.lifecycle_status = 'not_started' THEN 'released'
      ELSE v_piece.lifecycle_status
    END;

    IF v_next_lifecycle <> v_previous_lifecycle THEN
      UPDATE "public"."pieces"
      SET "lifecycle_status" = v_next_lifecycle,
          "updated_at" = now()
      WHERE "id" = v_piece.id;
    END IF;

    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
    ) VALUES (
      v_work_package.project_id,
      v_piece.id,
      'released_for_fabrication',
      jsonb_build_object('lifecycle_status', v_previous_lifecycle),
      jsonb_build_object(
        'lifecycle_status', v_next_lifecycle,
        'release_state', 'released_for_fabrication',
        'fab_release_id', v_release_id,
        'is_exception', v_is_exception
      ),
      CASE
        WHEN v_is_exception THEN btrim(p_exception_reason)
        ELSE 'Passed canonical four-check release gate'
      END,
      'piece_control',
      v_actor
    );
  END LOOP;

  PERFORM set_config('app.skip_wp_progress_refresh', '0', true);

  -- The package row now agrees with the release it just recorded. The
  -- rollup (pilot/live) will also move phase forward from the pieces; this
  -- covers shadow mode and packages whose lots were all already past release.
  UPDATE "public"."work_packages"
  SET "released_date" = coalesce("released_date", current_date),
      "phase" = CASE WHEN coalesce("phase", 'Detailing') = 'Detailing' THEN 'Fabrication' ELSE "phase" END
  WHERE "id" = p_work_package_id;

  PERFORM "public"."refresh_work_package_progress"(p_work_package_id);

  RETURN jsonb_build_object(
    'release_id', v_release_id,
    'release_number', v_release_number,
    'work_package_id', p_work_package_id,
    'released_at', now(),
    'is_exception', v_is_exception,
    'risk_id', v_risk_id,
    'gate_snapshot', v_gate
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CANONICAL_RELEASE_ALREADY_EXISTS: A simultaneous release already completed for this work package';
END;
$$;

-- ─── 4) assign / unassign — one rollup per touched package ───────────────────

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
  v_previous_wps uuid[] := '{}';
  v_wp uuid;
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

  -- Suppress the per-row projection-trigger rollup; refresh once per package below.
  PERFORM set_config('app.skip_wp_progress_refresh', '1', true);

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

    IF v_piece.work_package_id IS NOT NULL
       AND NOT (v_piece.work_package_id = ANY(v_previous_wps)) THEN
      v_previous_wps := v_previous_wps || v_piece.work_package_id;
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

  PERFORM set_config('app.skip_wp_progress_refresh', '0', true);

  IF v_changed > 0 THEN
    PERFORM public.refresh_work_package_progress(p_work_package_id);
    FOREACH v_wp IN ARRAY v_previous_wps LOOP
      PERFORM public.refresh_work_package_progress(v_wp);
    END LOOP;
  END IF;

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
  v_previous_wps uuid[] := '{}';
  v_wp uuid;
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

  PERFORM set_config('app.skip_wp_progress_refresh', '1', true);

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

    IF NOT (v_piece.work_package_id = ANY(v_previous_wps)) THEN
      v_previous_wps := v_previous_wps || v_piece.work_package_id;
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

  PERFORM set_config('app.skip_wp_progress_refresh', '0', true);

  FOREACH v_wp IN ARRAY v_previous_wps LOOP
    PERFORM public.refresh_work_package_progress(v_wp);
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

COMMIT;

NOTIFY pgrst, 'reload schema';
