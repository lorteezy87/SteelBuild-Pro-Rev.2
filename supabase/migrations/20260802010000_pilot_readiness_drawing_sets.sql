-- Align piece_control_pilot_readiness with piece_drawing_sets.
-- evaluate_release_gate (20260727232000) already treats set links OR
-- legacy sheet links as linked; readiness still only checked piece_drawings,
-- which produced false hard_release_blockers and live blockers when pieces
-- were linked only via drawing sets.

CREATE OR REPLACE FUNCTION "public"."piece_control_pilot_readiness"(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_leaf_lot_count integer := 0;
  v_piece_count numeric := 0;
  v_imported_lot_count integer := 0;
  v_model_element_count integer := 0;
  v_unmatched_model_element_count integer := 0;
  v_invalid_import_row_count integer := 0;
  v_duplicate_source_row_count integer := 0;
  v_missing_drawing_link_count integer := 0;
  v_unresolved_material_mapping_count integer := 0;
  v_held_piece_count integer := 0;
  v_release_gate_failure_count integer := 0;
  v_station_count integer := 0;
  v_station_percent numeric := 0;
  v_canonical_tons numeric := 0;
  v_unknown_weight_lot_count integer := 0;
  v_legacy_piece_count numeric := 0;
  v_legacy_tons numeric := 0;
  v_piece_delta numeric := 0;
  v_tons_delta numeric := 0;
  v_import_coverage numeric := 0;
  v_model_coverage numeric := 0;
  v_data_quality text[] := '{}'::text[];
  v_release_blockers text[] := '{}'::text[];
  v_pilot_blockers text[] := '{}'::text[];
  v_live_blockers text[] := '{}'::text[];
BEGIN
  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_actor IS NULL OR NOT "public"."user_has_project_access"(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to read Piece Control readiness for this project'
      USING errcode = '42501';
  END IF;

  WITH active AS (
    SELECT piece.*
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = p_project_id
      AND piece."is_deleted" = false
      AND piece."deleted_at" IS NULL
      AND piece."is_container" = false
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."is_deleted" = false
          AND child."deleted_at" IS NULL
      )
  )
  SELECT
    count(*),
    coalesce(sum("quantity"), 0),
    count(*) FILTER (
      WHERE nullif(btrim(coalesce("source_system", '')), '') IS NOT NULL
        AND "source_system" <> 'manual'
    ),
    coalesce(sum(
      CASE
        WHEN "weight_total_lbs" IS NOT NULL THEN "weight_total_lbs" / 2000.0
        WHEN "weight_each_lbs" IS NOT NULL THEN ("weight_each_lbs" * "quantity") / 2000.0
        ELSE 0
      END
    ), 0),
    count(*) FILTER (
      WHERE "weight_total_lbs" IS NULL AND "weight_each_lbs" IS NULL
    ),
    count(*) FILTER (WHERE "on_hold" = true)
  INTO
    v_leaf_lot_count,
    v_piece_count,
    v_imported_lot_count,
    v_canonical_tons,
    v_unknown_weight_lot_count,
    v_held_piece_count
  FROM active;

  SELECT
    count(*),
    count(*) FILTER (WHERE "piece_id" IS NULL)
  INTO v_model_element_count, v_unmatched_model_element_count
  FROM "public"."model_elements"
  WHERE "project_id" = p_project_id
    AND "is_deleted" = false;

  SELECT
    count(*) FILTER (
      WHERE "decision" = 'invalid'
        AND nullif(btrim(coalesce("resolution", '')), '') IS NULL
    ),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM unnest("warnings") AS warning
        WHERE lower(warning) LIKE '%duplicate%'
      )
        AND nullif(btrim(coalesce("resolution", '')), '') IS NULL
    )
  INTO v_invalid_import_row_count, v_duplicate_source_row_count
  FROM "public"."piece_import_rows"
  WHERE "project_id" = p_project_id;

  -- Linked = legacy sheet link OR drawing-set link (same rule as evaluate_release_gate).
  WITH active AS (
    SELECT piece.*
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = p_project_id
      AND piece."is_deleted" = false
      AND piece."deleted_at" IS NULL
      AND piece."is_container" = false
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."is_deleted" = false
          AND child."deleted_at" IS NULL
      )
  )
  SELECT
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM "public"."piece_drawings" AS relation
        WHERE relation."piece_id" = active."id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "public"."piece_drawing_sets" AS pds
        WHERE pds."piece_id" = active."id"
      )
    ),
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM "public"."piece_material_requirements" AS mapping
        WHERE mapping."piece_id" = active."id"
      )
    )
  INTO v_missing_drawing_link_count, v_unresolved_material_mapping_count
  FROM active;

  WITH scoped_work_packages AS (
    SELECT DISTINCT piece."work_package_id"
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = p_project_id
      AND piece."work_package_id" IS NOT NULL
      AND piece."is_deleted" = false
      AND piece."deleted_at" IS NULL
      AND piece."is_container" = false
  ),
  blocked AS (
    SELECT scoped."work_package_id"
    FROM scoped_work_packages AS scoped
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."fab_releases" AS release
      WHERE release."work_package_id" = scoped."work_package_id"
        AND release."canonical_release" = true
        AND release."status" = 'Released'
        AND release."is_deleted" = false
    )
      AND EXISTS (
        SELECT 1
        FROM "public"."pieces" AS piece
        WHERE piece."work_package_id" = scoped."work_package_id"
          AND piece."is_deleted" = false
          AND piece."deleted_at" IS NULL
          AND piece."is_container" = false
          AND (
            piece."on_hold" = true
            OR (
              NOT EXISTS (
                SELECT 1 FROM "public"."piece_drawings" AS relation
                WHERE relation."piece_id" = piece."id"
              )
              AND NOT EXISTS (
                SELECT 1 FROM "public"."piece_drawing_sets" AS pds
                WHERE pds."piece_id" = piece."id"
              )
            )
            OR NOT EXISTS (
              SELECT 1
              FROM "public"."piece_material_requirements" AS mapping
              JOIN "public"."material_requirements" AS requirement
                ON requirement."id" = mapping."material_requirement_id"
              WHERE mapping."piece_id" = piece."id"
                AND requirement."is_deleted" = false
                AND requirement."deleted_at" IS NULL
                AND requirement."receipt_state" IN ('received', 'on_hand')
            )
          )
      )
  )
  SELECT count(*) INTO v_release_gate_failure_count FROM blocked;

  SELECT count(*), coalesce(sum("earned_percent"), 0)
  INTO v_station_count, v_station_percent
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "is_active" = true;

  SELECT
    coalesce(sum(coalesce("quantity", 1)), 0),
    coalesce(sum(
      CASE
        WHEN "weight" IS NULL THEN 0
        ELSE ("weight" * coalesce("quantity", 1)) / 2000.0
      END
    ), 0)
  INTO v_legacy_piece_count, v_legacy_tons
  FROM "public"."piece_production"
  WHERE "project_id" = p_project_id
    AND "is_deleted" = false;

  v_import_coverage := CASE
    WHEN v_leaf_lot_count = 0 THEN 0
    ELSE round((v_imported_lot_count::numeric / v_leaf_lot_count) * 100, 2)
  END;
  v_model_coverage := CASE
    WHEN v_model_element_count = 0 THEN 100
    ELSE round(
      ((v_model_element_count - v_unmatched_model_element_count)::numeric /
        v_model_element_count) * 100,
      2
    )
  END;
  v_piece_delta := v_piece_count - v_legacy_piece_count;
  v_tons_delta := v_canonical_tons - v_legacy_tons;

  IF v_unmatched_model_element_count > 0 THEN
    v_data_quality := array_append(
      v_data_quality,
      format('%s active model elements are not linked to canonical pieces', v_unmatched_model_element_count)
    );
  END IF;
  IF v_duplicate_source_row_count > 0 THEN
    v_data_quality := array_append(
      v_data_quality,
      format('%s unresolved duplicate import rows require review', v_duplicate_source_row_count)
    );
  END IF;
  IF v_unknown_weight_lot_count > 0 THEN
    v_data_quality := array_append(
      v_data_quality,
      format('%s actionable lots have incomplete weight', v_unknown_weight_lot_count)
    );
  END IF;
  IF abs(v_piece_delta) >= 1 OR abs(v_tons_delta) >= 0.1 THEN
    v_data_quality := array_append(
      v_data_quality,
      format(
        'Canonical versus legacy discrepancy: %s pieces and %s tons',
        v_piece_delta,
        round(v_tons_delta, 3)
      )
    );
  END IF;

  IF v_invalid_import_row_count > 0 THEN
    v_release_blockers := array_append(
      v_release_blockers,
      format('%s unresolved invalid import rows', v_invalid_import_row_count)
    );
  END IF;
  IF v_missing_drawing_link_count > 0 THEN
    v_release_blockers := array_append(
      v_release_blockers,
      format('%s actionable lots have no drawing link', v_missing_drawing_link_count)
    );
  END IF;
  IF v_unresolved_material_mapping_count > 0 THEN
    v_release_blockers := array_append(
      v_release_blockers,
      format('%s actionable lots have no material mapping', v_unresolved_material_mapping_count)
    );
  END IF;
  IF v_held_piece_count > 0 THEN
    v_release_blockers := array_append(
      v_release_blockers,
      format('%s actionable lots are on hold', v_held_piece_count)
    );
  END IF;
  IF v_release_gate_failure_count > 0 THEN
    v_release_blockers := array_append(
      v_release_blockers,
      format('%s scoped work packages currently fail the canonical release gate', v_release_gate_failure_count)
    );
  END IF;

  IF v_leaf_lot_count = 0 THEN
    v_pilot_blockers := array_append(v_pilot_blockers, 'No active actionable canonical piece scope');
  END IF;
  IF v_invalid_import_row_count > 0 THEN
    v_pilot_blockers := array_append(v_pilot_blockers, 'Resolve invalid import rows before pilot');
  END IF;
  IF v_duplicate_source_row_count > 0 THEN
    v_pilot_blockers := array_append(v_pilot_blockers, 'Resolve duplicate source rows before pilot');
  END IF;
  IF v_station_count <> 6 OR v_station_percent <> 100 THEN
    v_pilot_blockers := array_append(v_pilot_blockers, 'Canonical station configuration must contain six stations totaling 100 percent');
  END IF;

  v_live_blockers := v_pilot_blockers;
  IF v_unmatched_model_element_count > 0 THEN
    v_live_blockers := array_append(v_live_blockers, 'Link all active model elements before live mode');
  END IF;
  IF v_missing_drawing_link_count > 0 THEN
    v_live_blockers := array_append(v_live_blockers, 'Resolve missing piece drawing links before live mode');
  END IF;
  IF v_unresolved_material_mapping_count > 0 THEN
    v_live_blockers := array_append(v_live_blockers, 'Resolve missing material mappings before live mode');
  END IF;
  IF abs(v_piece_delta) >= 1 OR abs(v_tons_delta) >= 0.1 THEN
    v_live_blockers := array_append(v_live_blockers, 'Resolve meaningful canonical versus legacy metric discrepancies before live mode');
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'mode', v_mode,
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'canonical_leaf_lot_count', v_leaf_lot_count,
      'canonical_piece_count', v_piece_count,
      'canonical_known_tons', v_canonical_tons,
      'canonical_import_coverage_percent', v_import_coverage,
      'model_element_coverage_percent', v_model_coverage,
      'unmatched_model_element_count', v_unmatched_model_element_count,
      'invalid_import_row_count', v_invalid_import_row_count,
      'duplicate_source_row_count', v_duplicate_source_row_count,
      'missing_drawing_link_count', v_missing_drawing_link_count,
      'unresolved_material_mapping_count', v_unresolved_material_mapping_count,
      'held_piece_count', v_held_piece_count,
      'release_gate_failure_count', v_release_gate_failure_count,
      'unknown_weight_lot_count', v_unknown_weight_lot_count,
      'legacy_piece_count', v_legacy_piece_count,
      'legacy_tons', v_legacy_tons,
      'piece_count_delta', v_piece_delta,
      'tonnage_delta', v_tons_delta
    ),
    'data_quality_warnings', to_jsonb(v_data_quality),
    'hard_release_blockers', to_jsonb(v_release_blockers),
    'pilot_transition_blockers', to_jsonb(v_pilot_blockers),
    'live_transition_blockers', to_jsonb(v_live_blockers),
    'pilot_ready', cardinality(v_pilot_blockers) = 0,
    'live_ready', cardinality(v_live_blockers) = 0
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
