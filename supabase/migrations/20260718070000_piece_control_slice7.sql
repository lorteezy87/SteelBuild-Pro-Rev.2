-- Slice 7: controlled pilot readiness, command failure audit, and rollout hardening.

CREATE TABLE IF NOT EXISTS "public"."piece_control_mode_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "previous_mode" text NOT NULL,
  "next_mode" text NOT NULL,
  "confirmation" text NOT NULL,
  "readiness_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "piece_control_mode_event_previous_check"
    CHECK ("previous_mode" IN ('off', 'shadow', 'pilot', 'live')),
  CONSTRAINT "piece_control_mode_event_next_check"
    CHECK ("next_mode" IN ('off', 'shadow', 'pilot', 'live'))
);

CREATE TABLE IF NOT EXISTS "public"."piece_control_command_failures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "command_name" text NOT NULL,
  "actor_id" uuid,
  "entity_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "error_code" text NOT NULL,
  "error_message" text NOT NULL,
  "error_detail" text,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "piece_control_mode_events_project_changed_idx"
ON "public"."piece_control_mode_events" ("project_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "piece_control_command_failures_project_occurred_idx"
ON "public"."piece_control_command_failures" ("project_id", "occurred_at" DESC);

CREATE OR REPLACE FUNCTION "public"."guard_piece_control_audit_immutable"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Piece Control audit records are immutable';
END;
$$;

CREATE TRIGGER "guard_piece_control_mode_event_update"
BEFORE UPDATE OR DELETE ON "public"."piece_control_mode_events"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_control_audit_immutable"();

CREATE TRIGGER "guard_piece_control_command_failure_update"
BEFORE UPDATE OR DELETE ON "public"."piece_control_command_failures"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_control_audit_immutable"();

ALTER TABLE "public"."piece_control_mode_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."piece_control_command_failures" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piece_control_mode_event_read"
ON "public"."piece_control_mode_events"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "piece_control_command_failure_admin_read"
ON "public"."piece_control_command_failures"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_role_at_least"("project_id", 'admin'));

REVOKE ALL ON TABLE "public"."piece_control_mode_events"
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."piece_control_command_failures"
  FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."piece_control_mode_events" TO "authenticated";
GRANT SELECT ON TABLE "public"."piece_control_command_failures" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_control_mode_events" TO "service_role";
GRANT ALL ON TABLE "public"."piece_control_command_failures" TO "service_role";

CREATE INDEX IF NOT EXISTS "model_elements_project_piece_active_idx"
ON "public"."model_elements" ("project_id", "piece_id")
WHERE "is_deleted" = false;

CREATE INDEX IF NOT EXISTS "piece_drawings_project_piece_idx"
ON "public"."piece_drawings" ("project_id", "piece_id");

CREATE INDEX IF NOT EXISTS "piece_material_requirements_project_piece_idx"
ON "public"."piece_material_requirements" ("project_id", "piece_id");

CREATE INDEX IF NOT EXISTS "material_requirements_project_receipt_idx"
ON "public"."material_requirements" ("project_id", "receipt_state")
WHERE "is_active" = true;

CREATE INDEX IF NOT EXISTS "fab_releases_project_canonical_active_idx"
ON "public"."fab_releases" ("project_id", "work_package_id")
WHERE "canonical_release" = true AND "is_deleted" = false;

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
            OR NOT EXISTS (
              SELECT 1 FROM "public"."piece_drawings" AS relation
              WHERE relation."piece_id" = piece."id"
            )
            OR NOT EXISTS (
              SELECT 1
              FROM "public"."piece_material_requirements" AS mapping
              JOIN "public"."material_requirements" AS requirement
                ON requirement."id" = mapping."material_requirement_id"
              WHERE mapping."piece_id" = piece."id"
                AND requirement."is_active" = true
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

CREATE OR REPLACE FUNCTION "public"."guard_piece_control_mode_update"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."piece_control_mode" IS DISTINCT FROM NEW."piece_control_mode"
     AND current_setting('app.piece_control_mode_command', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Piece Control mode may change only through set_piece_control_mode'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "guard_piece_control_mode_update"
BEFORE UPDATE OF "piece_control_mode" ON "public"."projects"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_control_mode_update"();

CREATE OR REPLACE FUNCTION "public"."set_piece_control_mode"(
  p_project_id uuid,
  p_next_mode text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous_mode text;
  v_expected_confirmation text;
  v_readiness jsonb;
  v_blockers jsonb;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Only a project admin may change Piece Control mode'
      USING errcode = '42501';
  END IF;
  IF p_next_mode NOT IN ('off', 'shadow', 'pilot', 'live') THEN
    RAISE EXCEPTION 'Invalid Piece Control mode';
  END IF;

  SELECT "piece_control_mode" INTO v_previous_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id
  FOR UPDATE;
  IF v_previous_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_previous_mode = p_next_mode THEN
    RAISE EXCEPTION 'Project is already in % mode', p_next_mode;
  END IF;

  IF NOT (
    (v_previous_mode = 'off' AND p_next_mode = 'shadow')
    OR (v_previous_mode = 'shadow' AND p_next_mode IN ('off', 'pilot'))
    OR (v_previous_mode = 'pilot' AND p_next_mode IN ('off', 'shadow', 'live'))
    OR (v_previous_mode = 'live' AND p_next_mode IN ('off', 'shadow'))
  ) THEN
    RAISE EXCEPTION 'Unsafe Piece Control transition from % to %', v_previous_mode, p_next_mode;
  END IF;

  v_expected_confirmation := format(
    'CHANGE %s TO %s',
    upper(v_previous_mode),
    upper(p_next_mode)
  );
  IF btrim(coalesce(p_confirmation, '')) <> v_expected_confirmation THEN
    RAISE EXCEPTION 'Confirmation must exactly match: %', v_expected_confirmation;
  END IF;

  v_readiness := "public"."piece_control_pilot_readiness"(p_project_id);
  IF p_next_mode = 'pilot' THEN
    v_blockers := v_readiness -> 'pilot_transition_blockers';
    IF jsonb_array_length(v_blockers) > 0 THEN
      RAISE EXCEPTION 'Pilot transition blocked: %', v_blockers::text;
    END IF;
  ELSIF p_next_mode = 'live' THEN
    v_blockers := v_readiness -> 'live_transition_blockers';
    IF jsonb_array_length(v_blockers) > 0 THEN
      RAISE EXCEPTION 'Live transition blocked: %', v_blockers::text;
    END IF;
  END IF;

  PERFORM set_config('app.piece_control_mode_command', 'on', true);
  UPDATE "public"."projects"
  SET "piece_control_mode" = p_next_mode,
      "updated_at" = now()
  WHERE "id" = p_project_id;

  INSERT INTO "public"."piece_control_mode_events" (
    "project_id", "previous_mode", "next_mode", "confirmation",
    "readiness_snapshot", "changed_by"
  ) VALUES (
    p_project_id, v_previous_mode, p_next_mode, p_confirmation,
    v_readiness, v_actor
  );

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'previous_mode', v_previous_mode,
    'next_mode', p_next_mode,
    'changed_by', v_actor,
    'changed_at', now(),
    'canonical_records_preserved', true,
    'legacy_records_modified', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."record_piece_control_command_failure"(
  p_project_id uuid,
  p_command_name text,
  p_entity_ids uuid[],
  p_error_code text,
  p_error_message text,
  p_error_detail text,
  p_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failure_id uuid;
BEGIN
  INSERT INTO "public"."piece_control_command_failures" (
    "project_id", "command_name", "actor_id", "entity_ids",
    "error_code", "error_message", "error_detail", "context"
  ) VALUES (
    p_project_id,
    p_command_name,
    auth.uid(),
    coalesce(p_entity_ids, '{}'::uuid[]),
    p_error_code,
    p_error_message,
    nullif(p_error_detail, ''),
    coalesce(p_context, '{}'::jsonb)
  )
  RETURNING "id" INTO v_failure_id;

  RETURN jsonb_build_object(
    'ok', false,
    'failure_id', v_failure_id,
    'command', p_command_name,
    'error_code', p_error_code,
    'error_message', p_error_message
  );
END;
$$;

ALTER FUNCTION "public"."release_work_package_canonical"(uuid, text)
  RENAME TO "release_work_package_canonical_impl";
ALTER FUNCTION "public"."split_piece_lot"(uuid, uuid, jsonb)
  RENAME TO "split_piece_lot_impl";
ALTER FUNCTION "public"."advance_piece_station"(uuid, uuid, text, boolean, text)
  RENAME TO "advance_piece_station_impl";
ALTER FUNCTION "public"."ship_piece_lots"(uuid, uuid[], jsonb)
  RENAME TO "ship_piece_lots_impl";
ALTER FUNCTION "public"."deliver_piece_lots"(uuid, uuid[], jsonb)
  RENAME TO "deliver_piece_lots_impl";
ALTER FUNCTION "public"."erect_piece_lots"(uuid, uuid[], jsonb)
  RENAME TO "erect_piece_lots_impl";

CREATE OR REPLACE FUNCTION "public"."release_work_package_canonical"(
  p_work_package_id uuid,
  p_exception_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_state text;
  v_message text;
  v_detail text;
BEGIN
  SELECT "project_id" INTO v_project_id
  FROM "public"."work_packages"
  WHERE "id" = p_work_package_id;
  RETURN "public"."release_work_package_canonical_impl"(
    p_work_package_id,
    p_exception_reason
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    v_project_id,
    'release_work_package_canonical',
    ARRAY[p_work_package_id],
    v_state,
    v_message,
    v_detail,
    jsonb_build_object('has_exception_reason', nullif(btrim(p_exception_reason), '') IS NOT NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."split_piece_lot"(
  p_project_id uuid,
  p_piece_id uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state text; v_message text; v_detail text;
BEGIN
  RETURN "public"."split_piece_lot_impl"(p_project_id, p_piece_id, p_allocations);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id, 'split_piece_lot', ARRAY[p_piece_id],
    v_state, v_message, v_detail,
    jsonb_build_object('allocation_count', coalesce(jsonb_array_length(p_allocations), 0))
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."advance_piece_station"(
  p_project_id uuid,
  p_piece_id uuid,
  p_station_key text,
  p_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state text; v_message text; v_detail text;
BEGIN
  RETURN "public"."advance_piece_station_impl"(
    p_project_id, p_piece_id, p_station_key, p_override, p_override_reason
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id, 'advance_piece_station', ARRAY[p_piece_id],
    v_state, v_message, v_detail,
    jsonb_build_object(
      'station_key', p_station_key,
      'override_requested', coalesce(p_override, false)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."ship_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state text; v_message text; v_detail text;
BEGIN
  RETURN "public"."ship_piece_lots_impl"(p_project_id, p_piece_ids, p_reference_data);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id, 'ship_piece_lots', p_piece_ids,
    v_state, v_message, v_detail, coalesce(p_reference_data, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."deliver_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state text; v_message text; v_detail text;
BEGIN
  RETURN "public"."deliver_piece_lots_impl"(p_project_id, p_piece_ids, p_reference_data);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id, 'deliver_piece_lots', p_piece_ids,
    v_state, v_message, v_detail, coalesce(p_reference_data, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."erect_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state text; v_message text; v_detail text;
BEGIN
  RETURN "public"."erect_piece_lots_impl"(p_project_id, p_piece_ids, p_reference_data);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id, 'erect_piece_lots', p_piece_ids,
    v_state, v_message, v_detail, coalesce(p_reference_data, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."record_piece_control_command_failure"(
  uuid, text, uuid[], text, text, text, jsonb
) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."release_work_package_canonical_impl"(uuid, text)
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."split_piece_lot_impl"(uuid, uuid, jsonb)
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."advance_piece_station_impl"(uuid, uuid, text, boolean, text)
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."ship_piece_lots_impl"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."deliver_piece_lots_impl"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."erect_piece_lots_impl"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."piece_control_pilot_readiness"(uuid)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."set_piece_control_mode"(uuid, text, text)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."release_work_package_canonical"(uuid, text)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."split_piece_lot"(uuid, uuid, jsonb)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."advance_piece_station"(uuid, uuid, text, boolean, text)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."ship_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."deliver_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."erect_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."piece_control_pilot_readiness"(uuid)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_piece_control_mode"(uuid, text, text)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."release_work_package_canonical"(uuid, text)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."split_piece_lot"(uuid, uuid, jsonb)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."advance_piece_station"(uuid, uuid, text, boolean, text)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."ship_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."deliver_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."erect_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";

