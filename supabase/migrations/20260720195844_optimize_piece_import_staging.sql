-- Keep large, reviewable Piece Control imports inside the Data API timeout
-- without changing the project-wide timeout. The original Slice 1 function
-- inserted each staged row in a PL/pgSQL loop; production-status files near the
-- supported 10,000-row ceiling exceeded the authenticated role's 8s limit.

CREATE INDEX IF NOT EXISTS "piece_import_rows_batch_mark_idx"
ON "public"."piece_import_rows" (
  "batch_id",
  (("normalized_payload" ->> 'normalized_piece_mark'))
);

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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

REVOKE ALL ON FUNCTION "public"."stage_piece_import_batch"(uuid, text, text, jsonb)
FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."stage_piece_import_batch"(uuid, text, text, jsonb)
TO "authenticated";
