-- Piece Control Slice 1: reconciled imports and a read-only piece register.
-- Legacy import tables and workflows are intentionally untouched.

CREATE TABLE IF NOT EXISTS "public"."piece_import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_name" "text",
    "uploaded_by" "uuid" NOT NULL,
    "status" "text" NOT NULL DEFAULT 'pending_review',
    "row_count" integer NOT NULL DEFAULT 0,
    "decision_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "applied_by" "uuid",
    "applied_at" timestamp with time zone,
    "apply_summary" jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "piece_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_import_batches_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_import_batches_uploaded_by_fk" FOREIGN KEY ("uploaded_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "piece_import_batches_approved_by_fk" FOREIGN KEY ("approved_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "piece_import_batches_applied_by_fk" FOREIGN KEY ("applied_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "piece_import_batches_source_type_check" CHECK (
      "source_type" = ANY (ARRAY[
        'ifc'::text,
        'csv'::text,
        'kiss'::text,
        'powerfab_xml'::text,
        'fabsuite_xml'::text,
        'model_elements'::text,
        'production_status'::text,
        'shipping_list'::text,
        'manual'::text
      ])
    ),
    CONSTRAINT "piece_import_batches_status_check" CHECK (
      "status" = ANY (ARRAY[
        'pending_review'::text,
        'approved'::text,
        'applied'::text
      ])
    )
);

CREATE TABLE IF NOT EXISTS "public"."piece_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_row_number" integer NOT NULL,
    "original_payload" jsonb NOT NULL,
    "normalized_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "decision" "text" NOT NULL,
    "warnings" text[] NOT NULL DEFAULT '{}'::text[],
    "resolution" "text",
    "matched_piece_id" "uuid",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "piece_import_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_import_rows_batch_fk" FOREIGN KEY ("batch_id")
      REFERENCES "public"."piece_import_batches" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_import_rows_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_import_rows_piece_fk" FOREIGN KEY ("matched_piece_id")
      REFERENCES "public"."pieces" ("id"),
    CONSTRAINT "piece_import_rows_batch_row_unique" UNIQUE ("batch_id", "source_row_number"),
    CONSTRAINT "piece_import_rows_decision_check" CHECK (
      "decision" = ANY (ARRAY[
        'new'::text,
        'unchanged'::text,
        'update_candidate'::text,
        'conflict'::text,
        'invalid'::text
      ])
    )
);

CREATE INDEX IF NOT EXISTS "piece_import_batches_project_created_idx"
ON "public"."piece_import_batches" ("project_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "piece_import_rows_batch_row_idx"
ON "public"."piece_import_rows" ("batch_id", "source_row_number");

CREATE INDEX IF NOT EXISTS "piece_import_rows_project_mark_idx"
ON "public"."piece_import_rows" ("project_id", (("normalized_payload" ->> 'normalized_piece_mark')));

CREATE OR REPLACE TRIGGER "set_piece_import_batches_updated_at"
BEFORE UPDATE ON "public"."piece_import_batches"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."piece_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."piece_import_rows" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piece_import_batch_read"
ON "public"."piece_import_batches"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "piece_import_row_read"
ON "public"."piece_import_rows"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

REVOKE ALL ON TABLE "public"."piece_import_batches" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."piece_import_rows" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."piece_import_batches" TO "authenticated";
GRANT SELECT ON TABLE "public"."piece_import_rows" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_import_batches" TO "service_role";
GRANT ALL ON TABLE "public"."piece_import_rows" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."piece_import_normalize_payload"(
  p_payload jsonb,
  p_source_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_mark text;
  v_normalized_mark text;
  v_quantity_text text;
  v_quantity numeric;
  v_each_text text;
  v_total_text text;
  v_kg_text text;
  v_weight_each numeric;
  v_weight_total numeric;
  v_length_text text;
  v_length numeric;
  v_warnings text[] := '{}'::text[];
  v_number_pattern constant text := '^[[:space:]]*[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)[[:space:]]*$';
BEGIN
  v_mark := nullif(btrim(coalesce(
    p_payload ->> 'piece_mark',
    p_payload ->> 'mark',
    p_payload ->> 'assembly_mark',
    p_payload ->> 'part_mark'
  )), '');
  v_normalized_mark := upper(v_mark);

  IF v_mark IS NULL THEN
    v_warnings := array_append(v_warnings, 'missing piece mark');
  END IF;

  v_quantity_text := nullif(btrim(p_payload ->> 'quantity'), '');
  IF v_quantity_text IS NULL THEN
    v_quantity := 1;
  ELSIF v_quantity_text !~ v_number_pattern THEN
    v_warnings := array_append(v_warnings, 'malformed quantity');
  ELSE
    v_quantity := v_quantity_text::numeric;
    IF v_quantity <= 0 THEN
      v_warnings := array_append(v_warnings, 'quantity must be greater than zero');
    END IF;
  END IF;

  v_each_text := nullif(btrim(coalesce(
    p_payload ->> 'weight_each_lbs',
    p_payload ->> 'unit_weight_lbs'
  )), '');
  IF v_each_text IS NOT NULL THEN
    IF v_each_text !~ v_number_pattern THEN
      v_warnings := array_append(v_warnings, 'malformed weight each');
    ELSE
      v_weight_each := v_each_text::numeric;
      IF v_weight_each < 0 THEN
        v_warnings := array_append(v_warnings, 'weight each cannot be negative');
      END IF;
    END IF;
  END IF;

  v_total_text := nullif(btrim(coalesce(
    p_payload ->> 'weight_total_lbs',
    p_payload ->> 'total_weight_lbs',
    CASE WHEN p_source_type = 'production_status' THEN p_payload ->> 'weight' END
  )), '');
  v_kg_text := nullif(btrim(p_payload ->> 'weight_kg'), '');

  IF v_total_text IS NOT NULL THEN
    IF v_total_text !~ v_number_pattern THEN
      v_warnings := array_append(v_warnings, 'malformed total weight');
    ELSE
      v_weight_total := v_total_text::numeric;
      IF v_weight_total < 0 THEN
        v_warnings := array_append(v_warnings, 'total weight cannot be negative');
      END IF;
    END IF;
  ELSIF v_kg_text IS NOT NULL THEN
    IF v_kg_text !~ v_number_pattern THEN
      v_warnings := array_append(v_warnings, 'malformed metric weight');
    ELSE
      v_weight_total := v_kg_text::numeric * 2.2046226218;
      IF v_weight_total < 0 THEN
        v_warnings := array_append(v_warnings, 'total weight cannot be negative');
      END IF;
    END IF;
  END IF;

  v_length_text := nullif(btrim(p_payload ->> 'length_inches'), '');
  IF v_length_text IS NOT NULL THEN
    IF v_length_text !~ v_number_pattern THEN
      v_warnings := array_append(v_warnings, 'malformed length');
    ELSE
      v_length := v_length_text::numeric;
      IF v_length < 0 THEN
        v_warnings := array_append(v_warnings, 'length cannot be negative');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'piece_mark', v_mark,
    'normalized_piece_mark', v_normalized_mark,
    'quantity', v_quantity,
    'weight_each_lbs', v_weight_each,
    'weight_total_lbs', v_weight_total,
    'profile', nullif(btrim(coalesce(p_payload ->> 'profile', p_payload ->> 'section', p_payload ->> 'shape')), ''),
    'material_grade', nullif(btrim(coalesce(p_payload ->> 'material_grade', p_payload ->> 'grade')), ''),
    'length_inches', v_length,
    'sequence_number', nullif(btrim(coalesce(p_payload ->> 'sequence_number', p_payload ->> 'sequence')), ''),
    'erection_area', nullif(btrim(p_payload ->> 'erection_area'), ''),
    'external_ref', nullif(btrim(coalesce(p_payload ->> 'external_ref', p_payload ->> 'element_guid')), ''),
    'source_system', p_source_type,
    '_validation_warnings', to_jsonb(v_warnings)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION "public"."piece_import_reconcile_row"(
  p_project_id uuid,
  p_payload jsonb,
  p_source_type text
)
RETURNS TABLE (
  normalized_payload jsonb,
  decision text,
  warnings text[],
  matched_piece_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_normalized jsonb;
  v_warnings text[];
  v_root "public"."pieces"%ROWTYPE;
  v_has_children boolean;
  v_changed boolean := false;
  v_physical_conflict boolean := false;
  v_mark text;
  v_quantity numeric;
  v_weight_each numeric;
  v_weight_total numeric;
  v_length numeric;
  v_profile text;
  v_grade text;
  v_sequence text;
  v_area text;
  v_external_ref text;
BEGIN
  v_normalized := "public"."piece_import_normalize_payload"(p_payload, p_source_type);
  SELECT coalesce(array_agg(value), '{}'::text[])
    INTO v_warnings
  FROM jsonb_array_elements_text(coalesce(v_normalized -> '_validation_warnings', '[]'::jsonb));
  v_normalized := v_normalized - '_validation_warnings';

  IF cardinality(v_warnings) > 0 THEN
    RETURN QUERY SELECT v_normalized, 'invalid'::text, v_warnings, NULL::uuid;
    RETURN;
  END IF;

  v_mark := v_normalized ->> 'normalized_piece_mark';
  v_quantity := (v_normalized ->> 'quantity')::numeric;
  v_weight_each := (v_normalized ->> 'weight_each_lbs')::numeric;
  v_weight_total := (v_normalized ->> 'weight_total_lbs')::numeric;
  v_length := (v_normalized ->> 'length_inches')::numeric;
  v_profile := v_normalized ->> 'profile';
  v_grade := v_normalized ->> 'material_grade';
  v_sequence := v_normalized ->> 'sequence_number';
  v_area := v_normalized ->> 'erection_area';
  v_external_ref := v_normalized ->> 'external_ref';

  SELECT *
    INTO v_root
  FROM "public"."pieces"
  WHERE "project_id" = p_project_id
    AND "normalized_piece_mark" = v_mark
    AND "lot_code" = 'ALL'
    AND "parent_piece_id" IS NULL
    AND "deleted_at" IS NULL
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM "public"."pieces"
    WHERE "project_id" = p_project_id
      AND "normalized_piece_mark" = v_mark
      AND "deleted_at" IS NULL
      AND ("lot_code" <> 'ALL' OR "parent_piece_id" IS NOT NULL)
  ) INTO v_has_children;

  IF v_root.id IS NULL THEN
    IF v_has_children THEN
      v_warnings := array_append(v_warnings, 'mark has split lots but no active ALL root');
      RETURN QUERY SELECT v_normalized, 'conflict'::text, v_warnings, NULL::uuid;
    ELSE
      RETURN QUERY SELECT v_normalized, 'new'::text, v_warnings, NULL::uuid;
    END IF;
    RETURN;
  END IF;

  v_changed :=
    v_root.quantity IS DISTINCT FROM v_quantity OR
    (v_weight_each IS NOT NULL AND v_root.weight_each_lbs IS DISTINCT FROM v_weight_each) OR
    (v_weight_total IS NOT NULL AND v_root.weight_total_lbs IS DISTINCT FROM v_weight_total) OR
    (v_profile IS NOT NULL AND v_root.profile IS DISTINCT FROM v_profile) OR
    (v_grade IS NOT NULL AND v_root.material_grade IS DISTINCT FROM v_grade) OR
    (v_length IS NOT NULL AND v_root.length_inches IS DISTINCT FROM v_length) OR
    (v_sequence IS NOT NULL AND v_root.sequence_number IS DISTINCT FROM v_sequence) OR
    (v_area IS NOT NULL AND v_root.erection_area IS DISTINCT FROM v_area) OR
    (v_external_ref IS NOT NULL AND v_root.external_ref IS DISTINCT FROM v_external_ref);

  IF NOT v_changed THEN
    RETURN QUERY SELECT v_normalized, 'unchanged'::text, v_warnings, v_root.id;
    RETURN;
  END IF;

  IF v_has_children THEN
    v_warnings := array_append(v_warnings, 'automatic changes to a split lot are not allowed');
    RETURN QUERY SELECT v_normalized, 'conflict'::text, v_warnings, v_root.id;
    RETURN;
  END IF;

  IF v_weight_each IS NOT NULL
     AND v_root.weight_each_lbs IS NOT NULL
     AND abs(v_root.weight_each_lbs - v_weight_each) > 0.01 THEN
    v_warnings := array_append(v_warnings, 'conflicting weight each');
    v_physical_conflict := true;
  END IF;
  IF v_weight_total IS NOT NULL
     AND v_root.weight_total_lbs IS NOT NULL
     AND abs(v_root.weight_total_lbs - v_weight_total) > 0.01 THEN
    v_warnings := array_append(v_warnings, 'conflicting total weight');
    v_physical_conflict := true;
  END IF;
  IF v_profile IS NOT NULL
     AND v_root.profile IS NOT NULL
     AND upper(v_root.profile) IS DISTINCT FROM upper(v_profile) THEN
    v_warnings := array_append(v_warnings, 'conflicting profile');
    v_physical_conflict := true;
  END IF;
  IF v_grade IS NOT NULL
     AND v_root.material_grade IS NOT NULL
     AND upper(v_root.material_grade) IS DISTINCT FROM upper(v_grade) THEN
    v_warnings := array_append(v_warnings, 'conflicting material grade');
    v_physical_conflict := true;
  END IF;

  RETURN QUERY SELECT
    v_normalized,
    CASE WHEN v_physical_conflict THEN 'conflict' ELSE 'update_candidate' END,
    v_warnings,
    v_root.id;
END;
$$;

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
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_batch_id uuid;
  v_item record;
  v_result record;
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

  FOR v_item IN
    SELECT value AS payload, ordinality::integer AS row_number
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY
  LOOP
    SELECT * INTO v_result
    FROM "public"."piece_import_reconcile_row"(p_project_id, v_item.payload, p_source_type);

    INSERT INTO "public"."piece_import_rows" (
      "batch_id", "project_id", "source_row_number", "original_payload",
      "normalized_payload", "decision", "warnings", "matched_piece_id"
    ) VALUES (
      v_batch_id, p_project_id, v_item.row_number, v_item.payload,
      v_result.normalized_payload, v_result.decision, v_result.warnings, v_result.matched_piece_id
    );
  END LOOP;

  UPDATE "public"."piece_import_rows" AS r
  SET "decision" = 'conflict',
      "warnings" = CASE
        WHEN 'duplicate source row' = ANY(r."warnings") THEN r."warnings"
        ELSE array_append(r."warnings", 'duplicate source row')
      END
  WHERE r."batch_id" = v_batch_id
    AND r."normalized_payload" ->> 'normalized_piece_mark' IN (
      SELECT d."normalized_payload" ->> 'normalized_piece_mark'
      FROM "public"."piece_import_rows" AS d
      WHERE d."batch_id" = v_batch_id
        AND nullif(d."normalized_payload" ->> 'normalized_piece_mark', '') IS NOT NULL
      GROUP BY d."normalized_payload" ->> 'normalized_piece_mark'
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = v_batch.project_id;
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = v_batch.project_id;
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

REVOKE ALL ON FUNCTION "public"."piece_import_normalize_payload"(jsonb, text) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."piece_import_reconcile_row"(uuid, jsonb, text) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."stage_piece_import_batch"(uuid, text, text, jsonb) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."approve_piece_import_batch"(uuid) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."apply_piece_import_batch"(uuid) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_piece_import_batch"(uuid, text, text, jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."approve_piece_import_batch"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."apply_piece_import_batch"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."piece_import_normalize_payload"(jsonb, text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."piece_import_reconcile_row"(uuid, jsonb, text) TO "service_role";

