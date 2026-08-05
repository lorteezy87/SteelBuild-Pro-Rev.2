-- Bulk advance production stations for multiple actionable leaf lots.
-- Reuses advance_piece_station_impl rules (release, hold, leaf-only, order/override).
-- Atomic: any hard failure rolls back the whole batch.

CREATE OR REPLACE FUNCTION public.advance_piece_stations_impl(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_station_key text DEFAULT NULL,
  p_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_ids uuid[];
  v_expected integer;
  v_locked integer := 0;
  v_piece public.pieces%ROWTYPE;
  v_station_key text;
  v_result jsonb;
  v_advanced integer := 0;
  v_unchanged integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_next_key text;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to advance production stations in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  SELECT array_agg(DISTINCT piece_id ORDER BY piece_id)
  INTO v_ids
  FROM unnest(coalesce(p_piece_ids, ARRAY[]::uuid[])) AS selected(piece_id)
  WHERE piece_id IS NOT NULL;

  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Select at least one piece lot';
  END IF;
  IF v_expected > 500 THEN
    RAISE EXCEPTION 'Bulk production advance is limited to 500 lots per request';
  END IF;

  IF nullif(btrim(coalesce(p_station_key, '')), '') IS NOT NULL THEN
    v_station_key := lower(btrim(p_station_key));
    IF NOT EXISTS (
      SELECT 1
      FROM public.piece_station_configurations
      WHERE project_id = p_project_id
        AND station_key = v_station_key
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Active production station not found';
    END IF;
  ELSE
    v_station_key := NULL;
  END IF;

  -- Lock + validate membership before mutating.
  FOR v_piece IN
    SELECT *
    FROM public.pieces
    WHERE id = ANY (v_ids)
      AND project_id = p_project_id
    ORDER BY id
    FOR UPDATE
  LOOP
    v_locked := v_locked + 1;
  END LOOP;

  IF v_locked <> v_expected THEN
    RAISE EXCEPTION 'Every selected lot must be active and belong to the requested project';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM public.pieces
    WHERE id = ANY (v_ids)
    ORDER BY id
  LOOP
    IF v_station_key IS NULL THEN
      SELECT station.station_key
      INTO v_next_key
      FROM public.piece_station_configurations AS station
      WHERE station.project_id = p_project_id
        AND station.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM public.piece_station_completions AS completion
          WHERE completion.piece_id = v_piece.id
            AND completion.station_configuration_id = station.id
        )
      ORDER BY station.sort_order
      LIMIT 1;

      IF v_next_key IS NULL THEN
        v_unchanged := v_unchanged + 1;
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'piece_id', v_piece.id,
            'unchanged', true,
            'reason', 'All stations already complete'
          )
        );
        CONTINUE;
      END IF;

      v_result := public.advance_piece_station_impl(
        p_project_id,
        v_piece.id,
        v_next_key,
        false,
        NULL
      );
    ELSE
      v_result := public.advance_piece_station_impl(
        p_project_id,
        v_piece.id,
        v_station_key,
        coalesce(p_override, false),
        p_override_reason
      );
    END IF;

    IF coalesce((v_result ->> 'unchanged')::boolean, false) THEN
      v_unchanged := v_unchanged + 1;
    ELSE
      v_advanced := v_advanced + 1;
    END IF;
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'station_key', v_station_key,
    'mode', CASE WHEN v_station_key IS NULL THEN 'next' ELSE 'station' END,
    'requested', v_expected,
    'advanced', v_advanced,
    'unchanged', v_unchanged,
    'piece_ids', to_jsonb(v_ids),
    'results', v_results,
    'atomic', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_piece_stations(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_station_key text DEFAULT NULL,
  p_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
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
  RETURN public.advance_piece_stations_impl(
    p_project_id,
    p_piece_ids,
    p_station_key,
    p_override,
    p_override_reason
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN public.record_piece_control_command_failure(
    p_project_id,
    'advance_piece_stations',
    p_piece_ids,
    v_state,
    v_message,
    v_detail,
    jsonb_build_object(
      'station_key', p_station_key,
      'override_requested', coalesce(p_override, false),
      'piece_count', coalesce(cardinality(p_piece_ids), 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_piece_stations_impl(uuid, uuid[], text, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_piece_stations(uuid, uuid[], text, boolean, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.advance_piece_stations(uuid, uuid[], text, boolean, text)
  TO authenticated, service_role;
