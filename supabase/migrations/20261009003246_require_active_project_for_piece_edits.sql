-- CANDIDATE ONLY: reviewed manual application and exact ledger stamp required.
-- Canonical piece command entrypoints require current active-project access.
-- A shared private helper locks the project against concurrent archival.
-- Shared role resolvers, restore/erasure/census and command wrappers are unchanged.
-- Commands add the project guard; model pagination also fixes its UUID cursor.
-- Canonical release locks project before package, re-reading the package under lock.
-- Archive takes the project lock first, preserving the latest skip-missing body.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.require_active_piece_project(p_project_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $guard$
DECLARE v_mode text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT coalesce(public.user_has_project_access(p_project_id), false) THEN
    RAISE EXCEPTION 'Current active-project access required for piece commands' USING ERRCODE = '42501';
  END IF;
  SELECT p.piece_control_mode INTO v_mode
  FROM public.projects p
  WHERE p.id = p_project_id AND coalesce(p.is_deleted, false) = false
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active project required for piece commands' USING ERRCODE = '42501';
  END IF;
  RETURN v_mode;
END;
$guard$;
REVOKE ALL ON FUNCTION private.require_active_piece_project(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Source body: 20260724130000_piece_control_production_hardening.sql (set_piece_hold_impl)
CREATE OR REPLACE FUNCTION "public"."set_piece_hold_impl"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_on_hold boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_piece "public"."pieces"%ROWTYPE;
  v_ids uuid[] := coalesce(p_piece_ids, '{}'::uuid[]);
  v_updated integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to change piece holds in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF p_on_hold AND v_reason IS NULL THEN
    RAISE EXCEPTION 'A non-empty hold reason is required';
  END IF;
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one piece lot is required';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces"
    WHERE "project_id" = p_project_id
      AND "id" = ANY (v_ids)
    ORDER BY "id"
    FOR UPDATE
  LOOP
    IF v_piece.is_deleted = true OR v_piece.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Deleted lots cannot change hold state';
    END IF;
    IF v_piece.is_container = true THEN
      RAISE EXCEPTION 'Roll-up containers cannot change hold state';
    END IF;
    IF v_piece.on_hold = p_on_hold
       AND (
         NOT p_on_hold
         OR coalesce(v_piece.on_hold_reason, '') = coalesce(v_reason, '')
       ) THEN
      CONTINUE;
    END IF;

    UPDATE "public"."pieces"
    SET "on_hold" = p_on_hold,
        "on_hold_reason" = CASE WHEN p_on_hold THEN v_reason ELSE NULL END,
        "updated_at" = now()
    WHERE "id" = v_piece.id;

    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
    ) VALUES (
      p_project_id,
      v_piece.id,
      CASE WHEN p_on_hold THEN 'hold_applied' ELSE 'hold_released' END,
      jsonb_build_object(
        'on_hold', v_piece.on_hold,
        'on_hold_reason', v_piece.on_hold_reason
      ),
      jsonb_build_object(
        'on_hold', p_on_hold,
        'on_hold_reason', CASE WHEN p_on_hold THEN v_reason ELSE NULL END
      ),
      CASE WHEN p_on_hold THEN v_reason ELSE coalesce(v_reason, 'Hold released') END,
      'piece_control',
      v_actor
    );
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'updated', v_updated,
    'on_hold', p_on_hold
  );
END;
$$;

-- Source body: 20260727224500_bulk_update_piece_attributes.sql (bulk_update_piece_attributes_impl)
CREATE OR REPLACE FUNCTION public.bulk_update_piece_attributes_impl(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_patch jsonb
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
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_has_sequence boolean := v_patch ? 'sequence_number';
  v_has_area boolean := v_patch ? 'erection_area';
  v_next_sequence text;
  v_next_area text;
  v_prev jsonb;
  v_next jsonb;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to update pieces in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT v_has_sequence AND NOT v_has_area THEN
    RAISE EXCEPTION 'At least one allowlisted attribute is required';
  END IF;

  -- Reject unknown / forbidden keys (fail closed).
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_patch) AS key
    WHERE key NOT IN ('sequence_number', 'erection_area')
  ) THEN
    RAISE EXCEPTION 'Patch contains unsupported piece attributes';
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'At least one piece is required';
  END IF;

  IF (
    SELECT count(*) FROM public.pieces
    WHERE id = ANY (v_ids)
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
    WHERE parent.id = ANY (v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be bulk-updated; use active leaf lots';
  END IF;

  IF v_has_sequence THEN
    IF jsonb_typeof(v_patch -> 'sequence_number') = 'null' THEN
      v_next_sequence := NULL;
    ELSE
      v_next_sequence := nullif(btrim(v_patch ->> 'sequence_number'), '');
    END IF;
  END IF;

  IF v_has_area THEN
    IF jsonb_typeof(v_patch -> 'erection_area') = 'null' THEN
      v_next_area := NULL;
    ELSE
      v_next_area := nullif(btrim(v_patch ->> 'erection_area'), '');
    END IF;
  END IF;

  FOR v_piece IN
    SELECT * FROM public.pieces
    WHERE id = ANY (v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF (
      (NOT v_has_sequence OR v_piece.sequence_number IS NOT DISTINCT FROM v_next_sequence)
      AND (NOT v_has_area OR v_piece.erection_area IS NOT DISTINCT FROM v_next_area)
    ) THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    v_prev := jsonb_build_object(
      'sequence_number', v_piece.sequence_number,
      'erection_area', v_piece.erection_area
    );

    UPDATE public.pieces
    SET
      sequence_number = CASE
        WHEN v_has_sequence THEN v_next_sequence
        ELSE sequence_number
      END,
      erection_area = CASE
        WHEN v_has_area THEN v_next_area
        ELSE erection_area
      END,
      updated_at = now()
    WHERE id = v_piece.id;

    v_next := jsonb_build_object(
      'sequence_number', CASE
        WHEN v_has_sequence THEN v_next_sequence
        ELSE v_piece.sequence_number
      END,
      'erection_area', CASE
        WHEN v_has_area THEN v_next_area
        ELSE v_piece.erection_area
      END
    );

    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      v_piece.id,
      'attributes_updated',
      v_prev,
      v_next,
      'Bulk attribute update from Piece Register',
      'piece_control',
      v_actor
    );
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'fields', (
      SELECT coalesce(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      FROM jsonb_object_keys(v_patch) AS key
    )
  );
END;
$$;

-- Source body: 20260720195844_optimize_piece_import_staging.sql (stage_piece_import_batch)
CREATE OR REPLACE FUNCTION "public"."stage_piece_import_batch"(
  p_project_id uuid,
  p_source_type text,
  p_source_name text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '60s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_batch_id uuid;
  v_counts jsonb;
BEGIN
  IF v_actor IS NULL OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to stage piece imports for this project';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;
  IF p_source_type NOT IN (
    'ifc', 'csv', 'kiss', 'powerfab_xml', 'fabsuite_xml',
    'model_elements', 'production_status', 'shipping_list', 'manual'
  ) THEN
    RAISE EXCEPTION 'Unsupported piece import source type';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Import rows must be a non-empty JSON array';
  END IF;
  IF jsonb_array_length(p_rows) > 10000 THEN
    RAISE EXCEPTION 'Import batch exceeds the 10000 row limit';
  END IF;

  INSERT INTO "public"."piece_import_batches" (
    "project_id", "source_type", "source_name", "uploaded_by"
  ) VALUES (
    p_project_id, p_source_type, nullif(btrim(p_source_name), ''), v_actor
  )
  RETURNING "id" INTO v_batch_id;

  INSERT INTO "public"."piece_import_rows" (
    "batch_id", "project_id", "source_row_number", "original_payload",
    "normalized_payload", "decision", "warnings", "matched_piece_id"
  )
  SELECT
    v_batch_id,
    p_project_id,
    source_row.row_number::integer,
    source_row.payload,
    reconciled.normalized_payload,
    reconciled.decision,
    reconciled.warnings,
    reconciled.matched_piece_id
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY
    AS source_row(payload, row_number)
  CROSS JOIN LATERAL "public"."piece_import_reconcile_row"(
    p_project_id,
    source_row.payload,
    p_source_type
  ) AS reconciled;

  UPDATE "public"."piece_import_rows" AS import_row
  SET "decision" = 'conflict',
      "warnings" = CASE
        WHEN 'duplicate source row' = ANY(import_row."warnings") THEN import_row."warnings"
        ELSE array_append(import_row."warnings", 'duplicate source row')
      END
  WHERE import_row."batch_id" = v_batch_id
    AND import_row."normalized_payload" ->> 'normalized_piece_mark' IN (
      SELECT duplicate_row."normalized_payload" ->> 'normalized_piece_mark'
      FROM "public"."piece_import_rows" AS duplicate_row
      WHERE duplicate_row."batch_id" = v_batch_id
        AND nullif(
          duplicate_row."normalized_payload" ->> 'normalized_piece_mark',
          ''
        ) IS NOT NULL
      GROUP BY duplicate_row."normalized_payload" ->> 'normalized_piece_mark'
      HAVING count(*) > 1
    );

  SELECT jsonb_build_object(
    'new', count(*) FILTER (WHERE "decision" = 'new'),
    'unchanged', count(*) FILTER (WHERE "decision" = 'unchanged'),
    'update_candidate', count(*) FILTER (WHERE "decision" = 'update_candidate'),
    'conflict', count(*) FILTER (WHERE "decision" = 'conflict'),
    'invalid', count(*) FILTER (WHERE "decision" = 'invalid')
  ) INTO v_counts
  FROM "public"."piece_import_rows"
  WHERE "batch_id" = v_batch_id;

  UPDATE "public"."piece_import_batches"
  SET "row_count" = jsonb_array_length(p_rows),
      "decision_counts" = v_counts
  WHERE "id" = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'row_count', jsonb_array_length(p_rows),
    'decision_counts', v_counts
  );
END;
$$;

-- Source body: 20260718010000_piece_control_slice1.sql (approve_piece_import_batch)
CREATE OR REPLACE FUNCTION "public"."approve_piece_import_batch"(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch "public"."piece_import_batches"%ROWTYPE;
  v_mode text;
BEGIN
  SELECT * INTO v_batch
  FROM "public"."piece_import_batches"
  WHERE "id" = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Piece import batch not found';
  END IF;
  IF v_actor IS NULL OR NOT "public"."user_has_project_role_at_least"(v_batch.project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to approve this piece import batch';
  END IF;

  v_mode := private.require_active_piece_project(v_batch.project_id);
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;
  IF v_batch.status = 'applied' THEN
    RETURN jsonb_build_object('batch_id', v_batch.id, 'status', v_batch.status);
  END IF;

  UPDATE "public"."piece_import_batches"
  SET "status" = 'approved',
      "approved_by" = v_actor,
      "approved_at" = now()
  WHERE "id" = v_batch.id;

  RETURN jsonb_build_object('batch_id', v_batch.id, 'status', 'approved');
END;
$$;

-- Source body: 20260718010000_piece_control_slice1.sql (apply_piece_import_batch)
CREATE OR REPLACE FUNCTION "public"."apply_piece_import_batch"(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch "public"."piece_import_batches"%ROWTYPE;
  v_row "public"."piece_import_rows"%ROWTYPE;
  v_result record;
  v_piece "public"."pieces"%ROWTYPE;
  v_previous jsonb;
  v_next jsonb;
  v_summary jsonb;
  v_mode text;
  v_duplicate_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_conflicts integer := 0;
  v_invalid integer := 0;
BEGIN
  SELECT * INTO v_batch
  FROM "public"."piece_import_batches"
  WHERE "id" = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Piece import batch not found';
  END IF;
  IF v_actor IS NULL OR NOT "public"."user_has_project_role_at_least"(v_batch.project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to apply this piece import batch';
  END IF;

  v_mode := private.require_active_piece_project(v_batch.project_id);
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;
  IF v_batch.status = 'applied' THEN
    RETURN coalesce(v_batch.apply_summary, jsonb_build_object('batch_id', v_batch.id, 'status', 'applied'));
  END IF;
  IF v_batch.status <> 'approved' THEN
    RAISE EXCEPTION 'Piece import batch must be approved before apply';
  END IF;

  FOR v_row IN
    SELECT *
    FROM "public"."piece_import_rows"
    WHERE "batch_id" = v_batch.id
    ORDER BY "source_row_number"
  LOOP
    SELECT * INTO v_result
    FROM "public"."piece_import_reconcile_row"(
      v_batch.project_id,
      v_row.original_payload,
      v_batch.source_type
    );

    SELECT count(*) INTO v_duplicate_count
    FROM "public"."piece_import_rows"
    WHERE "batch_id" = v_batch.id
      AND "normalized_payload" ->> 'normalized_piece_mark' =
          v_result.normalized_payload ->> 'normalized_piece_mark';

    IF nullif(v_result.normalized_payload ->> 'normalized_piece_mark', '') IS NOT NULL
       AND v_duplicate_count > 1 THEN
      v_result.decision := 'conflict';
      IF NOT ('duplicate source row' = ANY(v_result.warnings)) THEN
        v_result.warnings := array_append(v_result.warnings, 'duplicate source row');
      END IF;
    END IF;

    IF v_result.decision = 'new' THEN
      INSERT INTO "public"."pieces" (
        "project_id", "piece_mark", "lot_code", "parent_piece_id",
        "quantity", "weight_each_lbs", "weight_total_lbs", "profile",
        "material_grade", "length_inches", "sequence_number", "erection_area",
        "source_system", "external_ref", "metadata"
      ) VALUES (
        v_batch.project_id,
        v_result.normalized_payload ->> 'piece_mark',
        'ALL',
        NULL,
        (v_result.normalized_payload ->> 'quantity')::numeric,
        (v_result.normalized_payload ->> 'weight_each_lbs')::numeric,
        (v_result.normalized_payload ->> 'weight_total_lbs')::numeric,
        v_result.normalized_payload ->> 'profile',
        v_result.normalized_payload ->> 'material_grade',
        (v_result.normalized_payload ->> 'length_inches')::numeric,
        v_result.normalized_payload ->> 'sequence_number',
        v_result.normalized_payload ->> 'erection_area',
        v_batch.source_type,
        v_result.normalized_payload ->> 'external_ref',
        jsonb_build_object(
          'import_batch_id', v_batch.id,
          'import_source_name', v_batch.source_name
        )
      )
      RETURNING * INTO v_piece;

      INSERT INTO "public"."piece_events" (
        "project_id", "piece_id", "event_type", "previous_state", "next_state",
        "reason", "source_system", "created_by"
      ) VALUES (
        v_batch.project_id, v_piece.id, 'imported', '{}'::jsonb,
        jsonb_build_object(
          'piece_mark', v_piece.piece_mark,
          'lot_code', v_piece.lot_code,
          'quantity', v_piece.quantity,
          'profile', v_piece.profile,
          'material_grade', v_piece.material_grade,
          'weight_each_lbs', v_piece.weight_each_lbs,
          'weight_total_lbs', v_piece.weight_total_lbs
        ),
        'Created from approved reconciled import batch',
        v_batch.source_type,
        v_actor
      );

      v_created := v_created + 1;
      UPDATE "public"."piece_import_rows"
      SET "decision" = v_result.decision,
          "warnings" = v_result.warnings,
          "resolution" = 'applied_create',
          "matched_piece_id" = v_piece.id
      WHERE "id" = v_row.id;

    ELSIF v_result.decision = 'update_candidate' THEN
      SELECT jsonb_build_object(
        'quantity', "quantity",
        'weight_each_lbs', "weight_each_lbs",
        'weight_total_lbs', "weight_total_lbs",
        'profile', "profile",
        'material_grade', "material_grade",
        'length_inches', "length_inches",
        'sequence_number', "sequence_number",
        'erection_area', "erection_area",
        'source_system', "source_system",
        'external_ref', "external_ref"
      ) INTO v_previous
      FROM "public"."pieces"
      WHERE "id" = v_result.matched_piece_id
        AND "project_id" = v_batch.project_id
        AND "lot_code" = 'ALL'
        AND "parent_piece_id" IS NULL
        AND "deleted_at" IS NULL
      FOR UPDATE;

      IF v_previous IS NULL THEN
        v_result.decision := 'conflict';
        v_result.warnings := array_append(v_result.warnings, 'root piece changed during apply');
        v_conflicts := v_conflicts + 1;
      ELSE
        UPDATE "public"."pieces"
        SET "quantity" = (v_result.normalized_payload ->> 'quantity')::numeric,
            "weight_each_lbs" = coalesce(
              (v_result.normalized_payload ->> 'weight_each_lbs')::numeric,
              "weight_each_lbs"
            ),
            "weight_total_lbs" = coalesce(
              (v_result.normalized_payload ->> 'weight_total_lbs')::numeric,
              "weight_total_lbs"
            ),
            "profile" = coalesce(v_result.normalized_payload ->> 'profile', "profile"),
            "material_grade" = coalesce(v_result.normalized_payload ->> 'material_grade', "material_grade"),
            "length_inches" = coalesce(
              (v_result.normalized_payload ->> 'length_inches')::numeric,
              "length_inches"
            ),
            "sequence_number" = coalesce(v_result.normalized_payload ->> 'sequence_number', "sequence_number"),
            "erection_area" = coalesce(v_result.normalized_payload ->> 'erection_area', "erection_area"),
            "source_system" = v_batch.source_type,
            "external_ref" = coalesce(v_result.normalized_payload ->> 'external_ref', "external_ref"),
            "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
              'last_import_batch_id', v_batch.id,
              'last_import_source_name', v_batch.source_name
            )
        WHERE "id" = v_result.matched_piece_id
        RETURNING jsonb_build_object(
          'quantity', "quantity",
          'weight_each_lbs', "weight_each_lbs",
          'weight_total_lbs', "weight_total_lbs",
          'profile', "profile",
          'material_grade', "material_grade",
          'length_inches', "length_inches",
          'sequence_number', "sequence_number",
          'erection_area', "erection_area",
          'source_system', "source_system",
          'external_ref', "external_ref"
        ) INTO v_next;

        INSERT INTO "public"."piece_events" (
          "project_id", "piece_id", "event_type", "previous_state", "next_state",
          "reason", "source_system", "created_by"
        ) VALUES (
          v_batch.project_id, v_result.matched_piece_id, 'updated_from_import',
          v_previous, v_next,
          'Updated from approved reconciled import batch',
          v_batch.source_type,
          v_actor
        );
        v_updated := v_updated + 1;
      END IF;

      UPDATE "public"."piece_import_rows"
      SET "decision" = v_result.decision,
          "warnings" = v_result.warnings,
          "resolution" = CASE
            WHEN v_result.decision = 'update_candidate' THEN 'applied_update'
            ELSE 'skipped_conflict'
          END,
          "matched_piece_id" = v_result.matched_piece_id
      WHERE "id" = v_row.id;

    ELSE
      IF v_result.decision = 'unchanged' THEN
        v_unchanged := v_unchanged + 1;
      ELSIF v_result.decision = 'conflict' THEN
        v_conflicts := v_conflicts + 1;
      ELSE
        v_invalid := v_invalid + 1;
      END IF;

      UPDATE "public"."piece_import_rows"
      SET "decision" = v_result.decision,
          "warnings" = v_result.warnings,
          "resolution" = 'skipped_' || v_result.decision,
          "matched_piece_id" = v_result.matched_piece_id
      WHERE "id" = v_row.id;
    END IF;
  END LOOP;

  v_summary := jsonb_build_object(
    'batch_id', v_batch.id,
    'status', 'applied',
    'created', v_created,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'conflicts', v_conflicts,
    'invalid', v_invalid
  );

  UPDATE "public"."piece_import_batches"
  SET "status" = 'applied',
      "applied_by" = v_actor,
      "applied_at" = now(),
      "apply_summary" = v_summary
  WHERE "id" = v_batch.id;

  RETURN v_summary;
END;
$$;

-- Source body: 20260905130000_work_package_control_center.sql (assign_pieces_to_work_package)
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

  v_mode := private.require_active_piece_project(p_project_id);
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

-- Source body: 20260905130000_work_package_control_center.sql (unassign_pieces_from_work_package)
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

  v_mode := private.require_active_piece_project(p_project_id);
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

-- Source body: 20260718020000_piece_control_slice2.sql (link_piece_drawing)
CREATE OR REPLACE FUNCTION "public"."link_piece_drawing"(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_inserted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link piece drawings in this project' USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "public"."pieces"
    WHERE "id" = p_piece_id
      AND "project_id" = p_project_id
      AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces"
    WHERE "parent_piece_id" = p_piece_id
      AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "public"."drawings"
    WHERE "id" = p_drawing_id
      AND "project_id" = p_project_id
      AND "is_deleted" = false
      AND "deleted_at" IS NULL
      AND "is_superseded" = false
  ) THEN
    RAISE EXCEPTION 'Active drawing not found in this project';
  END IF;

  INSERT INTO "public"."piece_drawings" (
    "project_id", "piece_id", "drawing_id", "created_by"
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_id, v_actor
  )
  ON CONFLICT ("piece_id", "drawing_id") DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_id', p_drawing_id),
      'Drawing linked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_id', p_drawing_id,
    'linked', v_inserted = 1,
    'unchanged', v_inserted = 0
  );
END;
$$;

-- Source body: 20260718020000_piece_control_slice2.sql (unlink_piece_drawing)
CREATE OR REPLACE FUNCTION "public"."unlink_piece_drawing"(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unlink piece drawings in this project' USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "public"."pieces"
    WHERE "id" = p_piece_id AND "project_id" = p_project_id
  ) OR NOT EXISTS (
    SELECT 1 FROM "public"."drawings"
    WHERE "id" = p_drawing_id AND "project_id" = p_project_id
  ) THEN
    RAISE EXCEPTION 'Piece and drawing must belong to the same project';
  END IF;

  DELETE FROM "public"."piece_drawings"
  WHERE "project_id" = p_project_id
    AND "piece_id" = p_piece_id
    AND "drawing_id" = p_drawing_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_unlinked',
      jsonb_build_object('drawing_id', p_drawing_id),
      '{}'::jsonb,
      'Drawing unlinked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_id', p_drawing_id,
    'unlinked', v_deleted = 1,
    'unchanged', v_deleted = 0
  );
END;
$$;

-- Source body: 20260915120000_adopt_2026_fab_release_gate.sql (link_piece_drawing_set)
CREATE OR REPLACE FUNCTION public.link_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_inserted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id
      AND project_id = p_project_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pieces
    WHERE parent_piece_id = p_piece_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active drawing set not found in this project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_set_id, v_actor
  )
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      'Drawing set linked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'linked', v_inserted = 1,
    'unchanged', v_inserted = 0
  );
END;
$$;

-- Source body: 20260915120000_adopt_2026_fab_release_gate.sql (unlink_piece_drawing_set)
CREATE OR REPLACE FUNCTION public.unlink_piece_drawing_set(
  p_project_id uuid,
  p_piece_id uuid,
  p_drawing_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unlink piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id AND project_id = p_project_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Piece and drawing set must belong to the same project';
  END IF;

  DELETE FROM public.piece_drawing_sets
  WHERE project_id = p_project_id
    AND piece_id = p_piece_id
    AND drawing_set_id = p_drawing_set_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_unlinked',
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      '{}'::jsonb,
      'Drawing set unlinked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'unlinked', v_deleted = 1,
    'unchanged', v_deleted = 0
  );
END;
$$;

-- Source body: 20260718030000_piece_control_slice3.sql (create_material_requirement)
CREATE OR REPLACE FUNCTION "public"."create_material_requirement"(
  p_project_id uuid,
  p_requirement_code text,
  p_description text DEFAULT NULL,
  p_profile text DEFAULT NULL,
  p_material_grade text DEFAULT NULL,
  p_quantity_required numeric DEFAULT NULL,
  p_unit text DEFAULT 'each',
  p_source_system text DEFAULT NULL,
  p_external_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_requirement "public"."material_requirements"%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to create material requirements in this project'
      USING errcode = '42501';
  END IF;
  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;
  IF coalesce(btrim(p_requirement_code), '') = '' THEN
    RAISE EXCEPTION 'Material requirement code is required';
  END IF;

  INSERT INTO "public"."material_requirements" (
    "project_id", "requirement_code", "description", "profile", "material_grade",
    "quantity_required", "unit", "source_system", "external_ref", "created_by"
  ) VALUES (
    p_project_id, btrim(p_requirement_code), nullif(btrim(p_description), ''),
    nullif(btrim(p_profile), ''), nullif(btrim(p_material_grade), ''),
    p_quantity_required, coalesce(nullif(btrim(p_unit), ''), 'each'),
    nullif(btrim(p_source_system), ''), nullif(btrim(p_external_ref), ''), v_actor
  )
  RETURNING * INTO v_requirement;

  RETURN to_jsonb(v_requirement);
END;
$$;

-- Source body: 20260718030000_piece_control_slice3.sql (map_material_requirement_to_pieces)
CREATE OR REPLACE FUNCTION "public"."map_material_requirement_to_pieces"(
  p_project_id uuid,
  p_material_requirement_id uuid,
  p_piece_ids uuid[]
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
  v_inserted integer;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to map material requirements in this project'
      USING errcode = '42501';
  END IF;
  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "public"."material_requirements"
    WHERE "id" = p_material_requirement_id
      AND "project_id" = p_project_id
      AND "is_deleted" = false
      AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Active material requirement not found in this project';
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN RAISE EXCEPTION 'At least one piece is required'; END IF;

  IF (
    SELECT count(*) FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
      AND "project_id" = p_project_id
      AND "deleted_at" IS NULL
  ) <> v_expected THEN
    RAISE EXCEPTION 'All material-mapped pieces must be active and belong to the same project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS parent
    JOIN "public"."pieces" AS child
      ON child."parent_piece_id" = parent."id"
     AND child."deleted_at" IS NULL
    WHERE parent."id" = ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Material requirements must map to active leaf pieces, not containers';
  END IF;

  INSERT INTO "public"."piece_material_requirements" (
    "project_id", "material_requirement_id", "piece_id", "created_by"
  )
  SELECT p_project_id, p_material_requirement_id, id, v_actor
  FROM unnest(v_ids) AS id
  ON CONFLICT ("material_requirement_id", "piece_id") DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'material_requirement_id', p_material_requirement_id,
    'mapped', v_inserted,
    'unchanged', v_expected - v_inserted
  );
END;
$$;

-- Source body: 20260718030000_piece_control_slice3.sql (set_material_requirement_receipt_state)
CREATE OR REPLACE FUNCTION "public"."set_material_requirement_receipt_state"(
  p_project_id uuid,
  p_material_requirement_id uuid,
  p_receipt_state text,
  p_received_quantity numeric DEFAULT NULL,
  p_receipt_source text DEFAULT NULL,
  p_receipt_reference text DEFAULT NULL,
  p_provenance jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_requirement "public"."material_requirements"%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to record material receipt in this project'
      USING errcode = '42501';
  END IF;
  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF p_receipt_state NOT IN ('unknown', 'required', 'ordered', 'partial', 'received', 'on_hand') THEN
    RAISE EXCEPTION 'Invalid material receipt state';
  END IF;
  IF p_receipt_state IN ('received', 'on_hand')
     AND coalesce(btrim(p_receipt_source), '') = '' THEN
    RAISE EXCEPTION 'Receipt source is required for received or on-hand material';
  END IF;

  SELECT * INTO v_requirement
  FROM "public"."material_requirements"
  WHERE "id" = p_material_requirement_id
    AND "project_id" = p_project_id
    AND "is_deleted" = false
    AND "deleted_at" IS NULL
  FOR UPDATE;
  IF v_requirement.id IS NULL THEN
    RAISE EXCEPTION 'Active material requirement not found in this project';
  END IF;

  IF v_requirement.receipt_state IS NOT DISTINCT FROM p_receipt_state
     AND v_requirement.received_quantity IS NOT DISTINCT FROM p_received_quantity
     AND v_requirement.receipt_source IS NOT DISTINCT FROM nullif(btrim(p_receipt_source), '')
     AND v_requirement.receipt_reference IS NOT DISTINCT FROM nullif(btrim(p_receipt_reference), '') THEN
    RETURN jsonb_build_object(
      'material_requirement_id', v_requirement.id,
      'receipt_state', v_requirement.receipt_state,
      'unchanged', true
    );
  END IF;

  UPDATE "public"."material_requirements"
  SET "receipt_state" = p_receipt_state,
      "received_quantity" = p_received_quantity,
      "receipt_verified_at" = CASE
        WHEN p_receipt_state IN ('received', 'on_hand') THEN now()
        ELSE NULL
      END,
      "receipt_verified_by" = CASE
        WHEN p_receipt_state IN ('received', 'on_hand') THEN v_actor
        ELSE NULL
      END,
      "receipt_source" = nullif(btrim(p_receipt_source), ''),
      "receipt_reference" = nullif(btrim(p_receipt_reference), '')
  WHERE "id" = v_requirement.id;

  INSERT INTO "public"."material_receipt_events" (
    "project_id", "material_requirement_id", "previous_state", "next_state",
    "received_quantity", "receipt_source", "receipt_reference", "provenance",
    "recorded_by"
  ) VALUES (
    p_project_id, v_requirement.id, v_requirement.receipt_state, p_receipt_state,
    p_received_quantity, nullif(btrim(p_receipt_source), ''),
    nullif(btrim(p_receipt_reference), ''), coalesce(p_provenance, '{}'::jsonb),
    v_actor
  );

  RETURN jsonb_build_object(
    'material_requirement_id', v_requirement.id,
    'receipt_state', p_receipt_state,
    'unchanged', false
  );
END;
$$;

-- Source body: 20260718040000_piece_control_slice4.sql (set_project_station_configuration)
CREATE OR REPLACE FUNCTION "public"."set_project_station_configuration"(
  p_project_id uuid,
  p_stations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_count integer;
  v_key_count integer;
  v_order_count integer;
  v_total numeric;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to configure production stations in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF jsonb_typeof(p_stations) <> 'array' THEN
    RAISE EXCEPTION 'Station configuration must be a JSON array';
  END IF;

  SELECT
    count(*),
    count(DISTINCT station_key),
    count(DISTINCT sort_order),
    coalesce(sum(earned_percent), 0)
  INTO v_count, v_key_count, v_order_count, v_total
  FROM (
    SELECT
      value->>'station_key' AS station_key,
      (value->>'sort_order')::integer AS sort_order,
      (value->>'earned_percent')::numeric AS earned_percent
    FROM jsonb_array_elements(p_stations)
  ) AS parsed;

  IF v_count <> 6 OR v_key_count <> 6 OR v_order_count <> 6 OR v_total <> 100 THEN
    RAISE EXCEPTION 'Station configuration requires six unique stations and earned percentages totaling 100';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_stations) AS entry(value)
    WHERE value->>'station_key' <> ALL (
      ARRAY['cut', 'fit', 'weld', 'qc', 'paint', 'ready_to_ship']::text[]
    )
      OR (value->>'sort_order')::integer NOT BETWEEN 1 AND 6
      OR (value->>'earned_percent')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Station configuration contains an invalid station, order, or earned percentage';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."piece_station_completions"
    WHERE "project_id" = p_project_id
  ) THEN
    RAISE EXCEPTION 'Station configuration cannot change after production completions have been recorded';
  END IF;

  DELETE FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id;

  INSERT INTO "public"."piece_station_configurations" (
    "project_id", "station_key", "station_name", "sort_order", "earned_percent",
    "created_by", "updated_by"
  )
  SELECT
    p_project_id,
    value->>'station_key',
    nullif(btrim(value->>'station_name'), ''),
    (value->>'sort_order')::integer,
    (value->>'earned_percent')::numeric,
    v_actor,
    v_actor
  FROM jsonb_array_elements(p_stations);

  PERFORM "public"."validate_piece_station_configuration"(p_project_id);

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'station_count', 6,
    'earned_percent_total', 100
  );
END;
$$;

-- Source body: 20260718040000_piece_control_slice4.sql (split_piece_lot)
CREATE OR REPLACE FUNCTION "public"."split_piece_lot_impl"(
  p_project_id uuid,
  p_piece_id uuid,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_source "public"."pieces"%ROWTYPE;
  v_child "public"."pieces"%ROWTYPE;
  v_allocation jsonb;
  v_lot_code text;
  v_quantity numeric;
  v_total_quantity numeric := 0;
  v_child_ids jsonb := '[]'::jsonb;
  v_allocation_count integer;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to split piece lots in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT * INTO v_source
  FROM "public"."pieces"
  WHERE "id" = p_piece_id
    AND "project_id" = p_project_id
  FOR UPDATE;

  IF v_source.id IS NULL
     OR v_source.is_deleted = true
     OR v_source.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active source piece not found';
  END IF;
  IF v_source.is_container = true
     OR EXISTS (
       SELECT 1
       FROM "public"."pieces" AS child
       WHERE child."parent_piece_id" = v_source.id
         AND child."is_deleted" = false
         AND child."deleted_at" IS NULL
     ) THEN
    RAISE EXCEPTION 'Only an active actionable leaf lot can be split';
  END IF;
  IF v_source.lifecycle_status = ANY (ARRAY['shipped', 'delivered', 'erected']::text[]) THEN
    RAISE EXCEPTION 'A shipped, delivered, or erected lot cannot be split';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Child allocations must be a JSON array';
  END IF;

  v_allocation_count := jsonb_array_length(p_allocations);
  IF v_allocation_count < 2 THEN
    RAISE EXCEPTION 'A split requires at least two child-lot allocations';
  END IF;

  FOR v_allocation IN
    SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_lot_code := upper(btrim(v_allocation->>'lot_code'));
    IF v_lot_code IS NULL OR v_lot_code = '' OR v_lot_code = 'ALL' THEN
      RAISE EXCEPTION 'Each child lot requires a non-ALL lot code';
    END IF;
    IF jsonb_typeof(v_allocation->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'Each child lot quantity must be numeric';
    END IF;
    v_quantity := (v_allocation->>'quantity')::numeric;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each child lot quantity must be positive';
    END IF;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  IF v_total_quantity <> v_source.quantity THEN
    RAISE EXCEPTION 'Child quantities must sum exactly to the source quantity (%)', v_source.quantity;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(btrim(value->>'lot_code')) AS lot_code, count(*) AS duplicate_count
      FROM jsonb_array_elements(p_allocations)
      GROUP BY upper(btrim(value->>'lot_code'))
    ) AS source_codes
    WHERE duplicate_count > 1
  ) THEN
    RAISE EXCEPTION 'Child lot codes must be unique within the split';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS existing_piece
    JOIN jsonb_array_elements(p_allocations) AS allocation(value)
      ON existing_piece."lot_code" = upper(btrim(allocation.value->>'lot_code'))
    WHERE existing_piece."project_id" = p_project_id
      AND existing_piece."normalized_piece_mark" = v_source.normalized_piece_mark
      AND existing_piece."is_deleted" = false
      AND existing_piece."deleted_at" IS NULL
      AND existing_piece."id" <> v_source.id
  ) THEN
    RAISE EXCEPTION 'A child lot code already exists for this piece mark';
  END IF;

  UPDATE "public"."pieces"
  SET "is_container" = true,
      "updated_at" = now()
  WHERE "id" = v_source.id;

  FOR v_allocation IN
    SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_lot_code := upper(btrim(v_allocation->>'lot_code'));
    v_quantity := (v_allocation->>'quantity')::numeric;

    INSERT INTO "public"."pieces" (
      "project_id", "piece_mark", "lot_code", "parent_piece_id", "quantity",
      "weight_each_lbs", "weight_total_lbs", "profile", "material_grade",
      "length_inches", "sequence_number", "erection_area", "work_package_id",
      "lifecycle_status", "current_station", "on_hold", "on_hold_reason",
      "on_hold_at", "on_hold_by", "source_system", "external_ref",
      "metadata", "is_deleted", "is_container"
    ) VALUES (
      v_source.project_id,
      v_source.piece_mark,
      v_lot_code,
      v_source.id,
      v_quantity,
      v_source.weight_each_lbs,
      CASE
        WHEN v_source.weight_each_lbs IS NOT NULL
          THEN v_source.weight_each_lbs * v_quantity
        WHEN v_source.weight_total_lbs IS NOT NULL
          THEN (v_source.weight_total_lbs / v_source.quantity) * v_quantity
        ELSE NULL
      END,
      v_source.profile,
      v_source.material_grade,
      v_source.length_inches,
      v_source.sequence_number,
      v_source.erection_area,
      v_source.work_package_id,
      v_source.lifecycle_status,
      v_source.current_station,
      v_source.on_hold,
      v_source.on_hold_reason,
      v_source.on_hold_at,
      v_source.on_hold_by,
      v_source.source_system,
      v_source.external_ref,
      coalesce(v_source.metadata, '{}'::jsonb) || jsonb_build_object(
        'split_from_piece_id', v_source.id,
        'split_at', now()
      ),
      false,
      false
    )
    RETURNING * INTO v_child;

    INSERT INTO "public"."piece_drawings" (
      "project_id", "piece_id", "drawing_id", "created_by"
    )
    SELECT "project_id", v_child.id, "drawing_id", v_actor
    FROM "public"."piece_drawings"
    WHERE "piece_id" = v_source.id
    ON CONFLICT ("piece_id", "drawing_id") DO NOTHING;

    INSERT INTO "public"."piece_material_requirements" (
      "project_id", "material_requirement_id", "piece_id", "created_by"
    )
    SELECT "project_id", "material_requirement_id", v_child.id, v_actor
    FROM "public"."piece_material_requirements"
    WHERE "piece_id" = v_source.id
    ON CONFLICT ("material_requirement_id", "piece_id") DO NOTHING;

    INSERT INTO "public"."piece_station_completions" (
      "project_id", "piece_id", "station_configuration_id", "station_key",
      "station_name", "sort_order", "earned_percent", "completed_at",
      "completed_by", "is_override", "override_reason",
      "inherited_from_completion_id", "metadata"
    )
    SELECT
      completion."project_id",
      v_child.id,
      completion."station_configuration_id",
      completion."station_key",
      completion."station_name",
      completion."sort_order",
      completion."earned_percent",
      completion."completed_at",
      completion."completed_by",
      completion."is_override",
      completion."override_reason",
      completion."id",
      completion."metadata" || jsonb_build_object('inherited_by_lot_split', true)
    FROM "public"."piece_station_completions" AS completion
    WHERE completion."piece_id" = v_source.id
    ORDER BY completion."sort_order";

    v_child_ids := v_child_ids || jsonb_build_array(
      jsonb_build_object(
        'piece_id', v_child.id,
        'lot_code', v_child.lot_code,
        'quantity', v_child.quantity
      )
    );
  END LOOP;

  INSERT INTO "public"."piece_events" (
    "project_id", "piece_id", "event_type", "previous_state", "next_state",
    "reason", "source_system", "created_by"
  ) VALUES (
    p_project_id,
    v_source.id,
    'lot_split',
    jsonb_build_object(
      'lot_code', v_source.lot_code,
      'quantity', v_source.quantity,
      'is_container', false
    ),
    jsonb_build_object(
      'is_container', true,
      'children', v_child_ids
    ),
    'Piece quantity split into actionable child lots',
    'piece_control',
    v_actor
  );

  RETURN jsonb_build_object(
    'source_piece_id', v_source.id,
    'source_is_container', true,
    'source_quantity', v_source.quantity,
    'allocated_quantity', v_total_quantity,
    'children', v_child_ids
  );
END;
$$;

-- Source body: 20260718040000_piece_control_slice4.sql (advance_piece_station)
CREATE OR REPLACE FUNCTION "public"."advance_piece_station_impl"(
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
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_piece "public"."pieces"%ROWTYPE;
  v_station "public"."piece_station_configurations"%ROWTYPE;
  v_missing_previous integer := 0;
  v_max_station_order integer;
  v_current_station_key text;
  v_current_station_order integer;
  v_lifecycle text;
  v_override_used boolean := false;
  v_existing_completion "public"."piece_station_completions"%ROWTYPE;
  v_completion "public"."piece_station_completions"%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to advance production stations in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT * INTO v_piece
  FROM "public"."pieces"
  WHERE "id" = p_piece_id
    AND "project_id" = p_project_id
  FOR UPDATE;

  IF v_piece.id IS NULL
     OR v_piece.is_deleted = true
     OR v_piece.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active piece lot not found';
  END IF;
  IF v_piece.is_container = true
     OR EXISTS (
       SELECT 1
       FROM "public"."pieces" AS child
       WHERE child."parent_piece_id" = v_piece.id
         AND child."is_deleted" = false
         AND child."deleted_at" IS NULL
     ) THEN
    RAISE EXCEPTION 'Production actions are allowed only on actionable leaf lots';
  END IF;
  IF v_piece.on_hold = true THEN
    RAISE EXCEPTION 'Piece lot is on hold and cannot advance';
  END IF;
  IF v_piece.lifecycle_status = ANY (ARRAY['shipped', 'delivered', 'erected']::text[]) THEN
    RAISE EXCEPTION 'A shipped, delivered, or erected lot cannot advance in production';
  END IF;
  IF v_piece.work_package_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM "public"."fab_releases"
       WHERE "work_package_id" = v_piece.work_package_id
         AND "project_id" = p_project_id
         AND "canonical_release" = true
         AND "status" = 'Released'
         AND "is_deleted" = false
     ) THEN
    RAISE EXCEPTION 'Work package must have an active canonical release before production can advance';
  END IF;

  SELECT * INTO v_station
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "station_key" = lower(btrim(p_station_key))
    AND "is_active" = true;
  IF v_station.id IS NULL THEN
    RAISE EXCEPTION 'Active production station not found';
  END IF;

  SELECT * INTO v_existing_completion
  FROM "public"."piece_station_completions"
  WHERE "piece_id" = p_piece_id
    AND "station_configuration_id" = v_station.id;

  IF v_existing_completion.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'piece_id', p_piece_id,
      'station_key', v_station.station_key,
      'unchanged', true,
      'completed_at', v_existing_completion.completed_at,
      'is_override', v_existing_completion.is_override
    );
  END IF;

  SELECT count(*) INTO v_missing_previous
  FROM "public"."piece_station_configurations" AS prior_station
  WHERE prior_station."project_id" = p_project_id
    AND prior_station."is_active" = true
    AND prior_station."sort_order" < v_station.sort_order
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."piece_station_completions" AS prior_completion
      WHERE prior_completion."piece_id" = p_piece_id
        AND prior_completion."station_configuration_id" = prior_station.id
    );

  IF v_missing_previous > 0 AND NOT coalesce(p_override, false) THEN
    RAISE EXCEPTION 'Previous production stations must be completed before %', v_station.station_name;
  END IF;
  IF v_missing_previous > 0 AND nullif(btrim(p_override_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Out-of-sequence station advancement requires a non-empty override reason';
  END IF;
  v_override_used := v_missing_previous > 0;

  INSERT INTO "public"."piece_station_completions" (
    "project_id", "piece_id", "station_configuration_id", "station_key",
    "station_name", "sort_order", "earned_percent", "completed_by",
    "is_override", "override_reason", "metadata"
  ) VALUES (
    p_project_id,
    p_piece_id,
    v_station.id,
    v_station.station_key,
    v_station.station_name,
    v_station.sort_order,
    v_station.earned_percent,
    v_actor,
    v_override_used,
    CASE WHEN v_override_used THEN btrim(p_override_reason) ELSE NULL END,
    jsonb_build_object('missing_previous_station_count', v_missing_previous)
  )
  RETURNING * INTO v_completion;

  SELECT max("sort_order") INTO v_max_station_order
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "is_active" = true;

  SELECT station."station_key", station."sort_order"
  INTO v_current_station_key, v_current_station_order
  FROM "public"."piece_station_completions" AS completion
  JOIN "public"."piece_station_configurations" AS station
    ON station."id" = completion."station_configuration_id"
  WHERE completion."piece_id" = p_piece_id
    AND station."is_active" = true
  ORDER BY station."sort_order" DESC
  LIMIT 1;

  v_lifecycle := CASE
    WHEN v_current_station_order = v_max_station_order THEN 'fabricated'
    ELSE 'in_fabrication'
  END;

  UPDATE "public"."pieces"
  SET "current_station" = v_current_station_key,
      "lifecycle_status" = v_lifecycle,
      "updated_at" = now()
  WHERE "id" = p_piece_id;

  INSERT INTO "public"."piece_events" (
    "project_id", "piece_id", "event_type", "previous_state", "next_state",
    "reason", "source_system", "created_by"
  ) VALUES (
    p_project_id,
    p_piece_id,
    CASE WHEN v_override_used THEN 'station_override' ELSE 'station_advanced' END,
    jsonb_build_object(
      'station', v_piece.current_station,
      'lifecycle_status', v_piece.lifecycle_status
    ),
    jsonb_build_object(
      'station', v_current_station_key,
      'completed_station', v_station.station_key,
      'lifecycle_status', v_lifecycle,
      'earned_percent', v_station.earned_percent,
      'is_override', v_override_used
    ),
    CASE
      WHEN v_override_used THEN btrim(p_override_reason)
      ELSE 'Completed canonical production station'
    END,
    'piece_control',
    v_actor
  );

  RETURN jsonb_build_object(
    'piece_id', p_piece_id,
    'station_key', v_station.station_key,
    'completion_id', v_completion.id,
    'completed_at', v_completion.completed_at,
    'is_override', v_override_used,
    'lifecycle_status', v_lifecycle,
    'earned_percent', v_station.earned_percent,
    'unchanged', false
  );
END;
$$;

-- Source body: 20260718050000_piece_control_slice5.sql (transition_piece_lots_canonical)
CREATE OR REPLACE FUNCTION "public"."transition_piece_lots_canonical"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_required_status text,
  p_next_status text,
  p_event_type text,
  p_reference_data jsonb DEFAULT '{}'::jsonb
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
  v_piece "public"."pieces"%ROWTYPE;
  v_transitioned integer := 0;
  v_transitioned_at timestamptz := now();
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to record canonical logistics in this project'
      USING errcode = '42501';
  END IF;

  v_mode := private.require_active_piece_project(p_project_id);
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  IF p_required_status NOT IN ('fabricated', 'shipped', 'delivered')
     OR p_next_status NOT IN ('shipped', 'delivered', 'erected')
     OR p_event_type NOT IN ('shipped', 'delivered', 'erected') THEN
    RAISE EXCEPTION 'Invalid canonical logistics transition';
  END IF;
  IF (p_required_status, p_next_status, p_event_type) NOT IN (
    ('fabricated', 'shipped', 'shipped'),
    ('shipped', 'delivered', 'delivered'),
    ('delivered', 'erected', 'erected')
  ) THEN
    RAISE EXCEPTION 'Invalid canonical logistics transition sequence';
  END IF;
  IF p_reference_data IS NULL OR jsonb_typeof(p_reference_data) <> 'object' THEN
    RAISE EXCEPTION 'Reference data must be a JSON object';
  END IF;

  SELECT array_agg(DISTINCT piece_id ORDER BY piece_id)
  INTO v_ids
  FROM unnest(coalesce(p_piece_ids, ARRAY[]::uuid[])) AS selected(piece_id)
  WHERE piece_id IS NOT NULL;

  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Select at least one piece lot';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
      AND "project_id" = p_project_id
    ORDER BY "id"
    FOR UPDATE
  LOOP
    v_locked := v_locked + 1;

    IF v_piece.is_deleted = true OR v_piece.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Deleted piece lots cannot receive logistics actions';
    END IF;
    IF v_piece.is_container = true
       OR EXISTS (
         SELECT 1
         FROM "public"."pieces" AS child
         WHERE child."parent_piece_id" = v_piece.id
           AND child."is_deleted" = false
           AND child."deleted_at" IS NULL
       ) THEN
      RAISE EXCEPTION 'Containers cannot receive logistics actions';
    END IF;
    IF v_piece.on_hold = true THEN
      RAISE EXCEPTION 'Held piece lots cannot receive logistics actions';
    END IF;
    IF v_piece.lifecycle_status <> p_required_status THEN
      RAISE EXCEPTION 'Piece lot % / % must be % before it can be %',
        v_piece.piece_mark,
        v_piece.lot_code,
        p_required_status,
        p_next_status;
    END IF;
  END LOOP;

  IF v_locked <> v_expected THEN
    RAISE EXCEPTION 'Every selected lot must be active and belong to the requested project';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
    ORDER BY "id"
  LOOP
    UPDATE "public"."pieces"
    SET "lifecycle_status" = p_next_status,
        "updated_at" = v_transitioned_at
    WHERE "id" = v_piece.id;

    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by", "created_at"
    ) VALUES (
      p_project_id,
      v_piece.id,
      p_event_type,
      jsonb_build_object(
        'lifecycle_status', v_piece.lifecycle_status,
        'piece_mark', v_piece.piece_mark,
        'lot_code', v_piece.lot_code
      ),
      jsonb_build_object(
        'lifecycle_status', p_next_status,
        'piece_mark', v_piece.piece_mark,
        'lot_code', v_piece.lot_code,
        'reference_data', p_reference_data
      ),
      'Canonical physical logistics transition',
      'piece_control',
      v_actor,
      v_transitioned_at
    );

    v_transitioned := v_transitioned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'from_status', p_required_status,
    'to_status', p_next_status,
    'event_type', p_event_type,
    'transitioned', v_transitioned,
    'piece_ids', to_jsonb(v_ids),
    'transitioned_at', v_transitioned_at,
    'reference_data', p_reference_data,
    'atomic', true
  );
END;
$$;

-- Source body: 20260728040000_advance_piece_stations_bulk.sql (advance_piece_stations_impl)
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

  v_mode := private.require_active_piece_project(p_project_id);
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

-- Source body: 20260905090000_sync_production_stages_to_pieces.sql (sync_production_stages_to_pieces_impl)
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

  v_mode := private.require_active_piece_project(p_project_id);
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

-- Source body: 20260905130000_work_package_control_center.sql (release_work_package_canonical_impl)
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
    AND "deleted_at" IS NULL;
  IF v_work_package.id IS NULL THEN RAISE EXCEPTION 'Active work package not found'; END IF;

  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(v_work_package.project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to release this work package'
      USING errcode = '42501';
  END IF;
  v_mode := private.require_active_piece_project(v_work_package.project_id);

  SELECT * INTO v_work_package
  FROM "public"."work_packages"
  WHERE "id" = p_work_package_id
    AND "project_id" = v_work_package.project_id
    AND "is_deleted" = false
    AND "deleted_at" IS NULL
  FOR UPDATE;
  IF v_work_package.id IS NULL THEN RAISE EXCEPTION 'Active work package not found'; END IF;
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

-- Source body: 20260728053000_link_model_elements_chunked.sql (link_model_elements_to_pieces)
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

  v_mode := private.require_active_piece_project(p_project_id);
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

-- Source body: 20260728053000_link_model_elements_chunked.sql (link_model_elements_to_pieces_page)
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

  v_mode := private.require_active_piece_project(p_project_id);
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
      (array_agg(r.element_id ORDER BY r.element_id DESC))[1] AS next_after,
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

-- Source body: 20260914120000_adopt_production_soft_delete_project.sql (soft_delete_project)
create or replace function public.soft_delete_project(p_project_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_deleted_at timestamptz := now(); v_table text; v_updated int;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings','drawing_sets','expenses','inspections',
    'punchlist_items','safety_incidents','scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions','comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks','email_messages','linked_folders','document_import_queue'
  ];
begin
  perform set_config('app.skip_wp_progress_refresh', '1', true);
  if not public.user_has_project_role_at_least(p_project_id, 'admin') then
    raise exception 'Not authorized to delete project %', p_project_id using errcode = '42501';
  end if;
  -- Match piece-command lock order: project first, then child rows.
  perform 1 from public.projects where id = p_project_id for update;
  foreach v_table in array v_child_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false', v_table)
        using v_deleted_at, p_project_id;
    end if;
  end loop;
  update public.projects set is_deleted = true, deleted_at = v_deleted_at
   where id = p_project_id and coalesce(is_deleted, false) = false;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Project % not found or already archived', p_project_id using errcode = 'P0002';
  end if;
end;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
