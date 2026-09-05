-- EPM / Production Status → canonical pieces write-through.
--
-- productionToFabBridge.ts used to UPDATE pieces.lifecycle_status directly from
-- the browser. `pieces` is SELECT-only for `authenticated` (piece_control_slice0),
-- so that write failed with 42501 in production, and even where it could have
-- run it bypassed advance_piece_station: no piece_events, no station
-- completions, so earned % stayed 0 while the register said "Fabricated".
--
-- This RPC is the sanctioned path. For each (mark → target station [, ship])
-- it resolves the unique actionable leaf lot and drives it through the SAME
-- station-advance and ship functions the Piece Register uses, station by
-- station, so completions, events, lifecycle and WP progress all follow.
-- Per-lot failures (not released, on hold, ambiguous mark…) are reported and
-- skipped instead of rolling back the batch — an EPM import must never be
-- all-or-nothing across hundreds of marks.
--
-- Canonical production is append-only (stations complete, lots ship); a
-- "regress" (Shipped → Cut in EPM) is reported as skipped, never applied.

CREATE OR REPLACE FUNCTION public.sync_production_stages_to_pieces_impl(
  p_project_id uuid,
  p_updates jsonb,
  p_source text DEFAULT 'production_import'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_update jsonb;
  v_mark text;
  v_target_key text;
  v_ship boolean;
  v_target_order integer;
  v_piece public.pieces%ROWTYPE;
  v_candidates uuid[];
  v_station record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_requested integer := 0;
  v_advanced integer := 0;
  v_unchanged integer := 0;
  v_skipped integer := 0;
  v_completions integer;
  v_shipped boolean;
  v_reason text;
  v_source text := coalesce(nullif(btrim(p_source), ''), 'production_import');
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to update production in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array';
  END IF;
  IF jsonb_array_length(p_updates) > 2000 THEN
    RAISE EXCEPTION 'Production sync is limited to 2000 marks per request';
  END IF;

  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_requested := v_requested + 1;
    v_mark := upper(btrim(coalesce(v_update ->> 'mark', '')));
    v_target_key := lower(btrim(coalesce(v_update ->> 'target_station', '')));
    v_ship := coalesce((v_update ->> 'ship')::boolean, false);
    v_completions := 0;
    v_shipped := false;
    v_reason := NULL;

    IF v_mark = '' THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'status', 'skipped', 'reason', 'empty_mark'));
      CONTINUE;
    END IF;
    IF v_target_key = '' AND NOT v_ship THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'status', 'skipped', 'reason', 'no_target'));
      CONTINUE;
    END IF;

    -- Unique actionable leaf lot for this mark (same rule as the register).
    SELECT array_agg(p.id)
    INTO v_candidates
    FROM public.pieces p
    WHERE p.project_id = p_project_id
      AND p.normalized_piece_mark = v_mark
      AND coalesce(p.is_deleted, false) = false
      AND p.deleted_at IS NULL
      AND coalesce(p.is_container, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.pieces child
        WHERE child.parent_piece_id = p.id
          AND coalesce(child.is_deleted, false) = false
          AND child.deleted_at IS NULL
      );

    IF v_candidates IS NULL OR cardinality(v_candidates) = 0 THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'status', 'skipped', 'reason', 'no_leaf_lot'));
      CONTINUE;
    END IF;
    IF cardinality(v_candidates) > 1 THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'status', 'skipped', 'reason', 'ambiguous_mark',
        'candidate_count', cardinality(v_candidates)));
      CONTINUE;
    END IF;

    SELECT * INTO v_piece FROM public.pieces WHERE id = v_candidates[1];

    -- Already past production: nothing to advance, nothing to regress.
    IF v_piece.lifecycle_status = ANY (ARRAY['shipped', 'delivered', 'erected']::text[]) THEN
      v_unchanged := v_unchanged + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'piece_id', v_piece.id, 'status', 'unchanged',
        'reason', 'already_' || v_piece.lifecycle_status));
      CONTINUE;
    END IF;

    IF v_target_key <> '' THEN
      SELECT sort_order INTO v_target_order
      FROM public.piece_station_configurations
      WHERE project_id = p_project_id
        AND station_key = v_target_key
        AND is_active = true;
      IF v_target_order IS NULL THEN
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'mark', v_mark, 'piece_id', v_piece.id, 'status', 'skipped',
          'reason', 'station_not_configured', 'station_key', v_target_key));
        CONTINUE;
      END IF;
    ELSE
      v_target_order := NULL;
    END IF;

    -- Per-lot subtransaction: one lot's failure must not roll back the batch.
    BEGIN
      IF v_target_order IS NOT NULL THEN
        FOR v_station IN
          SELECT s.station_key
          FROM public.piece_station_configurations s
          WHERE s.project_id = p_project_id
            AND s.is_active = true
            AND s.sort_order <= v_target_order
            AND NOT EXISTS (
              SELECT 1 FROM public.piece_station_completions c
              WHERE c.piece_id = v_piece.id
                AND c.station_configuration_id = s.id
            )
          ORDER BY s.sort_order
        LOOP
          v_result := public.advance_piece_station_impl(
            p_project_id, v_piece.id, v_station.station_key, false, NULL);
          IF NOT coalesce((v_result ->> 'unchanged')::boolean, false) THEN
            v_completions := v_completions + 1;
          END IF;
        END LOOP;
      END IF;

      IF v_ship THEN
        SELECT * INTO v_piece FROM public.pieces WHERE id = v_piece.id;
        IF v_piece.lifecycle_status = 'fabricated' THEN
          PERFORM public.ship_piece_lots_impl(
            p_project_id,
            ARRAY[v_piece.id],
            jsonb_build_object('source', v_source));
          v_shipped := true;
        ELSE
          v_reason := 'not_fabricated_cannot_ship';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT;
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'piece_id', v_piece.id, 'status', 'skipped',
        'reason', v_reason, 'completions_added', 0, 'shipped', false));
      CONTINUE;
    END;

    IF v_completions > 0 OR v_shipped THEN
      v_advanced := v_advanced + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'piece_id', v_piece.id, 'status', 'advanced',
        'completions_added', v_completions, 'shipped', v_shipped,
        'reason', v_reason));
    ELSE
      v_unchanged := v_unchanged + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mark', v_mark, 'piece_id', v_piece.id, 'status', 'unchanged',
        'reason', coalesce(v_reason, 'already_at_or_past_target')));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'source', v_source,
    'requested', v_requested,
    'advanced', v_advanced,
    'unchanged', v_unchanged,
    'skipped', v_skipped,
    'results', v_results,
    'atomic', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_production_stages_to_pieces(
  p_project_id uuid,
  p_updates jsonb,
  p_source text DEFAULT 'production_import'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state text;
  v_message text;
  v_detail text;
BEGIN
  RETURN public.sync_production_stages_to_pieces_impl(p_project_id, p_updates, p_source);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN public.record_piece_control_command_failure(
    p_project_id,
    'sync_production_stages_to_pieces',
    ARRAY[]::uuid[],
    v_state,
    v_message,
    v_detail,
    jsonb_build_object(
      'source', p_source,
      'update_count', CASE WHEN jsonb_typeof(p_updates) = 'array' THEN jsonb_array_length(p_updates) ELSE 0 END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_production_stages_to_pieces_impl(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_production_stages_to_pieces(uuid, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_production_stages_to_pieces(uuid, jsonb, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
