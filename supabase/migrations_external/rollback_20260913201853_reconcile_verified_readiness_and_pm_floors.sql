-- MANUAL ROLLBACK ONLY; outside active migrations. Restores audited production behavior.
-- WARNING: restores sheet-only readiness and field write floors; only for rollback after review.
-- Rejects unexpected changes since the forward repair. No ledger edits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
LOCK TABLE public.drawing_impacts,public.email_integration_settings,public.daily_logs IN SHARE ROW EXCLUSIVE MODE;
DO $reconcile$
DECLARE
  v_before pg_catalog.pg_proc%ROWTYPE;
  v_after pg_catalog.pg_proc%ROWTYPE;
  v_policy pg_catalog.pg_policy%ROWTYPE;
  v_column pg_catalog.pg_attribute%ROWTYPE;
  v_table text;
  v_suffix text;
  v_command "char";
  v_using text;
  v_check text;
  v_field text := 'user_has_project_role_at_least(project_id, ''field''::text)';
  v_pm text := 'user_has_project_role_at_least(project_id, ''pm''::text)';
  v_authenticated oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated');
BEGIN
  SELECT * INTO v_before FROM pg_catalog.pg_proc
  WHERE oid=pg_catalog.to_regprocedure('public.piece_control_pilot_readiness(uuid)');
  IF NOT FOUND OR pg_catalog.md5(v_before.prosrc) NOT IN ('faeeed62ac7dc3946b971c19908ed3bd')
     OR v_before.prosecdef IS DISTINCT FROM true
     OR v_before.provolatile IS DISTINCT FROM 's'::"char"
     OR v_before.prorettype IS DISTINCT FROM 'jsonb'::regtype
     OR v_before.pronargdefaults IS DISTINCT FROM 0
     OR v_before.proargnames IS DISTINCT FROM ARRAY['p_project_id']::text[]
     OR v_before.proretset IS DISTINCT FROM false
     OR v_before.proisstrict IS DISTINCT FROM false
     OR v_before.proleakproof IS DISTINCT FROM false
     OR v_before.proparallel IS DISTINCT FROM 'u'::"char"
     OR v_before.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
     OR v_before.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'RECONCILE_PRECONDITION: readiness function differs from audited/desired definition' USING ERRCODE='55000';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['drawing_impacts','email_integration_settings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
                   WHERE oid=pg_catalog.to_regclass('public.'||v_table) AND relrowsecurity) THEN
      RAISE EXCEPTION 'RECONCILE_PRECONDITION: RLS missing on %',v_table USING ERRCODE='55000';
    END IF;
    FOREACH v_suffix IN ARRAY ARRAY['ins','upd','del'] LOOP
      v_command := CASE v_suffix WHEN 'ins' THEN 'a' WHEN 'upd' THEN 'w' ELSE 'd' END;
      SELECT * INTO v_policy FROM pg_catalog.pg_policy
       WHERE polrelid=pg_catalog.to_regclass('public.'||v_table)
         AND polname=v_table||'_'||v_suffix||'_role_floor';
      IF NOT FOUND OR v_policy.polpermissive IS DISTINCT FROM false
         OR v_policy.polcmd IS DISTINCT FROM v_command
         OR v_policy.polroles IS DISTINCT FROM ARRAY[v_authenticated]::oid[] THEN
        RAISE EXCEPTION 'RECONCILE_PRECONDITION: unexpected policy shape %.%',v_table,v_suffix USING ERRCODE='55000';
      END IF;
      v_using := pg_catalog.pg_get_expr(v_policy.polqual,v_policy.polrelid);
      v_check := pg_catalog.pg_get_expr(v_policy.polwithcheck,v_policy.polrelid);
      IF (((v_command='a' AND v_using IS NULL AND v_check=v_pm) OR (v_command='w' AND v_using=v_pm AND v_check=v_pm) OR (v_command='d' AND v_using=v_pm AND v_check IS NULL))) IS NOT TRUE THEN
        RAISE EXCEPTION 'RECONCILE_PRECONDITION: unexpected policy predicate %.%',v_table,v_suffix USING ERRCODE='55000';
      END IF;
    END LOOP;
  END LOOP;

  SELECT * INTO v_column FROM pg_catalog.pg_attribute
   WHERE attrelid='public.daily_logs'::regclass AND attname='materials_received'
     AND attnum>0 AND NOT attisdropped;
  IF NOT FOUND OR v_column.atttypid IS DISTINCT FROM 'text'::regtype
     OR v_column.atttypmod IS DISTINCT FROM -1 OR v_column.attnotnull IS DISTINCT FROM false
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef WHERE adrelid=v_column.attrelid AND adnum=v_column.attnum)
     OR (pg_catalog.col_description(v_column.attrelid,v_column.attnum)='Free-text materials received that day (field superintendent daily log).') IS NOT TRUE THEN
    RAISE EXCEPTION 'RECONCILE_PRECONDITION: materials_received column differs from audited/desired state' USING ERRCODE='55000';
  END IF;

  -- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL. The checked
  -- stable/definer/empty-search-path settings are repeated unchanged.
  -- Original production prosrc uses CRLF. Reconstruct it after client newline normalization.
  EXECUTE pg_catalog.replace($readiness_definition$
CREATE OR REPLACE FUNCTION public.piece_control_pilot_readiness(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
$readiness_definition$, E'\n', E'\r\n');

  FOREACH v_table IN ARRAY ARRAY['drawing_impacts','email_integration_settings'] LOOP
    EXECUTE pg_catalog.format('ALTER POLICY %I ON public.%I WITH CHECK (public.user_has_project_role_at_least(project_id, %L))',v_table||'_ins_role_floor',v_table,'field');
    EXECUTE pg_catalog.format('ALTER POLICY %I ON public.%I USING (public.user_has_project_role_at_least(project_id, %L)) WITH CHECK (public.user_has_project_role_at_least(project_id, %L))',v_table||'_upd_role_floor',v_table,'field','field');
    EXECUTE pg_catalog.format('ALTER POLICY %I ON public.%I USING (public.user_has_project_role_at_least(project_id, %L))',v_table||'_del_role_floor',v_table,'field');
  END LOOP;
  COMMENT ON COLUMN public.daily_logs.materials_received IS NULL;

  SELECT * INTO v_after FROM pg_catalog.pg_proc WHERE oid=v_before.oid;
  IF v_after.proacl IS DISTINCT FROM v_before.proacl
     OR v_after.proowner IS DISTINCT FROM v_before.proowner
     OR v_after.proconfig IS DISTINCT FROM v_before.proconfig
     OR v_after.prosecdef IS DISTINCT FROM v_before.prosecdef
     OR v_after.provolatile IS DISTINCT FROM v_before.provolatile THEN
    RAISE EXCEPTION 'RECONCILE_POSTCONDITION: readiness privileges/configuration changed' USING ERRCODE='55000';
  END IF;
END;
$reconcile$;
NOTIFY pgrst,'reload schema';
COMMIT;
