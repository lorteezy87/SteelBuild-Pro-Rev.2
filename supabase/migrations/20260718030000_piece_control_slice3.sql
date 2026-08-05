-- Piece Control Slice 3: material-aware canonical fabrication release.
-- The legacy fab_release_log and submittal release triggers remain unchanged.

CREATE TABLE IF NOT EXISTS "public"."material_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "requirement_code" "text" NOT NULL,
    "description" "text",
    "profile" "text",
    "material_grade" "text",
    "quantity_required" numeric,
    "unit" "text" NOT NULL DEFAULT 'each',
    "receipt_state" "text" NOT NULL DEFAULT 'unknown',
    "received_quantity" numeric,
    "receipt_verified_at" timestamp with time zone,
    "receipt_verified_by" "uuid",
    "receipt_source" "text",
    "receipt_reference" "text",
    "source_system" "text",
    "external_ref" "text",
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_by" "uuid",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "is_deleted" boolean NOT NULL DEFAULT false,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "material_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "material_requirements_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "material_requirements_verified_by_fk" FOREIGN KEY ("receipt_verified_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "material_requirements_created_by_fk" FOREIGN KEY ("created_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "material_requirements_code_nonempty" CHECK (length(btrim("requirement_code")) > 0),
    CONSTRAINT "material_requirements_quantity_check" CHECK (
      "quantity_required" IS NULL OR "quantity_required" >= 0
    ),
    CONSTRAINT "material_requirements_received_quantity_check" CHECK (
      "received_quantity" IS NULL OR "received_quantity" >= 0
    ),
    CONSTRAINT "material_requirements_receipt_state_check" CHECK (
      "receipt_state" = ANY (ARRAY[
        'unknown'::text,
        'required'::text,
        'ordered'::text,
        'partial'::text,
        'received'::text,
        'on_hand'::text
      ])
    )
);

CREATE TABLE IF NOT EXISTS "public"."piece_material_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "material_requirement_id" "uuid" NOT NULL,
    "piece_id" "uuid" NOT NULL,
    "quantity_allocated" numeric,
    "created_by" "uuid",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "piece_material_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_material_requirements_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_material_requirements_requirement_fk" FOREIGN KEY ("material_requirement_id")
      REFERENCES "public"."material_requirements" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_material_requirements_piece_fk" FOREIGN KEY ("piece_id")
      REFERENCES "public"."pieces" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_material_requirements_created_by_fk" FOREIGN KEY ("created_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "piece_material_requirements_quantity_check" CHECK (
      "quantity_allocated" IS NULL OR "quantity_allocated" > 0
    ),
    CONSTRAINT "piece_material_requirement_unique" UNIQUE ("material_requirement_id", "piece_id")
);

CREATE TABLE IF NOT EXISTS "public"."material_receipt_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "material_requirement_id" "uuid" NOT NULL,
    "previous_state" "text",
    "next_state" "text" NOT NULL,
    "received_quantity" numeric,
    "receipt_source" "text",
    "receipt_reference" "text",
    "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "recorded_by" "uuid" NOT NULL,
    "recorded_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "material_receipt_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "material_receipt_events_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "material_receipt_events_requirement_fk" FOREIGN KEY ("material_requirement_id")
      REFERENCES "public"."material_requirements" ("id") ON DELETE CASCADE,
    CONSTRAINT "material_receipt_events_recorded_by_fk" FOREIGN KEY ("recorded_by")
      REFERENCES "auth"."users" ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "material_requirements_project_code_active_unique"
ON "public"."material_requirements" ("project_id", lower("requirement_code"))
WHERE "is_deleted" = false AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "piece_material_requirements_project_piece_idx"
ON "public"."piece_material_requirements" ("project_id", "piece_id");

CREATE INDEX IF NOT EXISTS "material_receipt_events_requirement_recorded_idx"
ON "public"."material_receipt_events" ("material_requirement_id", "recorded_at" DESC);

CREATE OR REPLACE TRIGGER "set_material_requirements_updated_at"
BEFORE UPDATE ON "public"."material_requirements"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."material_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."piece_material_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."material_receipt_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_requirement_read"
ON "public"."material_requirements"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "piece_material_requirement_read"
ON "public"."piece_material_requirements"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "material_receipt_event_read"
ON "public"."material_receipt_events"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

REVOKE ALL ON TABLE "public"."material_requirements" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."piece_material_requirements" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."material_receipt_events" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."material_requirements" TO "authenticated";
GRANT SELECT ON TABLE "public"."piece_material_requirements" TO "authenticated";
GRANT SELECT ON TABLE "public"."material_receipt_events" TO "authenticated";
GRANT ALL ON TABLE "public"."material_requirements" TO "service_role";
GRANT ALL ON TABLE "public"."piece_material_requirements" TO "service_role";
GRANT ALL ON TABLE "public"."material_receipt_events" TO "service_role";

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
  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects" WHERE "id" = p_project_id;
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
  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects" WHERE "id" = p_project_id;
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
  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects" WHERE "id" = p_project_id;
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

ALTER TABLE "public"."fab_releases"
ADD COLUMN IF NOT EXISTS "canonical_release" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "released_by" "uuid",
ADD COLUMN IF NOT EXISTS "released_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "gate_snapshot" jsonb,
ADD COLUMN IF NOT EXISTS "is_exception" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "exception_reason" "text",
ADD COLUMN IF NOT EXISTS "risk_id" "uuid",
ADD COLUMN IF NOT EXISTS "release_source" "text";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fab_releases_work_package_fk'
      AND conrelid = 'public.fab_releases'::regclass
  ) THEN
    ALTER TABLE "public"."fab_releases"
    ADD CONSTRAINT "fab_releases_work_package_fk"
    FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages" ("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fab_releases_released_by_fk'
      AND conrelid = 'public.fab_releases'::regclass
  ) THEN
    ALTER TABLE "public"."fab_releases"
    ADD CONSTRAINT "fab_releases_released_by_fk"
    FOREIGN KEY ("released_by") REFERENCES "auth"."users" ("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fab_releases_risk_fk'
      AND conrelid = 'public.fab_releases'::regclass
  ) THEN
    ALTER TABLE "public"."fab_releases"
    ADD CONSTRAINT "fab_releases_risk_fk"
    FOREIGN KEY ("risk_id") REFERENCES "public"."risks" ("id");
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "fab_releases_canonical_work_package_unique"
ON "public"."fab_releases" ("work_package_id")
WHERE "canonical_release" = true AND coalesce("is_deleted", false) = false;

CREATE OR REPLACE FUNCTION "public"."guard_canonical_fab_release_write"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW."canonical_release" = true
    OR (TG_OP = 'UPDATE' AND OLD."canonical_release" = true)
  ) AND coalesce(current_setting('app.canonical_release_command', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Canonical fabrication releases may only be written through release_work_package_canonical'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."guard_canonical_fab_release_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."canonical_release" = true THEN
    RAISE EXCEPTION 'Canonical fabrication releases are immutable';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "trg_guard_canonical_fab_release_write" ON "public"."fab_releases";
CREATE TRIGGER "trg_guard_canonical_fab_release_write"
BEFORE INSERT OR UPDATE ON "public"."fab_releases"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_canonical_fab_release_write"();

DROP TRIGGER IF EXISTS "trg_guard_canonical_fab_release_delete" ON "public"."fab_releases";
CREATE TRIGGER "trg_guard_canonical_fab_release_delete"
BEFORE DELETE ON "public"."fab_releases"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_canonical_fab_release_delete"();

CREATE OR REPLACE FUNCTION "public"."piece_control_drawing_is_approved"(p_drawing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."drawings" AS d
    WHERE d."id" = p_drawing_id
      AND d."is_deleted" = false
      AND d."deleted_at" IS NULL
      AND d."is_superseded" = false
      AND (
        lower(replace(coalesce(d."set_approval_status", ''), ' ', '_'))
          IN ('approved', 'approved_as_noted')
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_sets" AS ds
          WHERE ds."id" = d."drawing_set_id"
            AND ds."is_deleted" = false
            AND ds."deleted_at" IS NULL
            AND lower(replace(coalesce(ds."set_approval_status", ''), ' ', '_'))
              IN ('approved', 'approved_as_noted')
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_signoffs" AS signoff
          WHERE signoff."drawing_id" = d."id"
            AND signoff."is_voided" = false
            AND signoff."stamp_type" IN ('approved_for_fabrication', 'approved_as_noted')
            AND (
              NOT EXISTS (
                SELECT 1 FROM "public"."drawing_revisions" AS current_revision
                WHERE current_revision."drawing_id" = d."id"
                  AND current_revision."is_current" = true
                  AND current_revision."archived_at" IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM "public"."drawing_revisions" AS current_revision
                WHERE current_revision."id" = signoff."drawing_revision_id"
                  AND current_revision."drawing_id" = d."id"
                  AND current_revision."is_current" = true
                  AND current_revision."archived_at" IS NULL
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_revisions" AS revision
          WHERE revision."drawing_id" = d."id"
            AND revision."is_current" = true
            AND revision."archived_at" IS NULL
            AND EXISTS (
              SELECT 1 FROM "public"."drawing_reviews" AS review
              WHERE review."drawing_revision_id" = revision."id"
                AND review."decision" IN ('approved', 'approved_with_notes')
            )
            AND NOT EXISTS (
              SELECT 1 FROM "public"."drawing_reviews" AS review
              WHERE review."drawing_revision_id" = revision."id"
                AND review."decision" NOT IN ('approved', 'approved_with_notes', 'not_required')
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."submittals" AS submittal
          WHERE d."drawing_set_id" = ANY(coalesce(submittal."drawing_set_ids", '{}'::uuid[]))
            AND submittal."is_deleted" = false
            AND submittal."deleted_at" IS NULL
            AND submittal."status" IN ('Approved', 'Approved as Noted')
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."submittals" AS submittal
          JOIN "public"."submittal_sheet_responses" AS response
            ON response."submittal_round_id" = submittal."current_round_id"
           AND response."drawing_id" = d."id"
           AND response."is_deleted" = false
           AND response."deleted_at" IS NULL
          WHERE d."drawing_set_id" = ANY(coalesce(submittal."drawing_set_ids", '{}'::uuid[]))
            AND submittal."is_deleted" = false
            AND submittal."deleted_at" IS NULL
            AND response."response_status" IN ('No Exception', 'Approved as Noted')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."evaluate_release_gate"(p_work_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_mode text;
  v_scope_count integer := 0;
  v_linked_drawing_count integer := 0;
  v_approved_drawing_count integer := 0;
  v_missing_drawing_count integer := 0;
  v_unmapped_drawing_piece_count integer := 0;
  v_requirement_count integer := 0;
  v_received_requirement_count integer := 0;
  v_unmapped_material_piece_count integer := 0;
  v_held_piece_count integer := 0;
  v_already_released boolean := false;
  v_scope_pass boolean;
  v_drawings_pass boolean;
  v_material_pass boolean;
  v_holds_pass boolean;
  v_blockers text[] := '{}'::text[];
  v_scope_blockers text[] := '{}'::text[];
  v_drawing_blockers text[] := '{}'::text[];
  v_material_blockers text[] := '{}'::text[];
  v_hold_blockers text[] := '{}'::text[];
BEGIN
  SELECT wp."project_id", p."piece_control_mode"
  INTO v_project_id, v_mode
  FROM "public"."work_packages" AS wp
  JOIN "public"."projects" AS p ON p."id" = wp."project_id"
  WHERE wp."id" = p_work_package_id
    AND wp."is_deleted" = false
    AND wp."deleted_at" IS NULL;

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Active work package not found'; END IF;
  IF v_actor IS NULL OR NOT "public"."user_has_project_access"(v_project_id) THEN
    RAISE EXCEPTION 'Not authorized to evaluate release readiness for this project'
      USING errcode = '42501';
  END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM "public"."fab_releases"
    WHERE "work_package_id" = p_work_package_id
      AND coalesce("is_deleted", false) = false
      AND (
        "canonical_release" = true
        OR lower(coalesce("status", '')) = 'released'
      )
  ) INTO v_already_released;

  WITH scope AS (
    SELECT piece.*
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  )
  SELECT count(*), count(*) FILTER (WHERE "on_hold" = true)
  INTO v_scope_count, v_held_piece_count
  FROM scope;

  v_scope_pass := v_scope_count > 0;
  IF NOT v_scope_pass THEN
    v_scope_blockers := array_append(v_scope_blockers, 'No active, actionable canonical leaf pieces are assigned to this work package.');
  END IF;

  WITH scope AS (
    SELECT piece."id"
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  ),
  linked AS (
    SELECT DISTINCT pd."drawing_id"
    FROM "public"."piece_drawings" AS pd
    JOIN scope ON scope."id" = pd."piece_id"
    WHERE pd."project_id" = v_project_id
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM "public"."drawings" AS drawing
        WHERE drawing."id" = linked."drawing_id"
          AND drawing."project_id" = v_project_id
          AND drawing."is_deleted" = false
          AND drawing."deleted_at" IS NULL
          AND drawing."is_superseded" = false
      )
      AND "public"."piece_control_drawing_is_approved"(linked."drawing_id")
    ),
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM "public"."drawings" AS drawing
        WHERE drawing."id" = linked."drawing_id"
          AND drawing."project_id" = v_project_id
          AND drawing."is_deleted" = false
          AND drawing."deleted_at" IS NULL
          AND drawing."is_superseded" = false
      )
    )
  INTO v_linked_drawing_count, v_approved_drawing_count, v_missing_drawing_count
  FROM linked;

  WITH scope AS (
    SELECT piece."id"
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  )
  SELECT count(*) INTO v_unmapped_drawing_piece_count
  FROM scope
  WHERE NOT EXISTS (
    SELECT 1 FROM "public"."piece_drawings" AS pd
    WHERE pd."piece_id" = scope."id"
      AND pd."project_id" = v_project_id
  );

  v_drawings_pass :=
    v_scope_pass
    AND v_linked_drawing_count > 0
    AND v_unmapped_drawing_piece_count = 0
    AND v_missing_drawing_count = 0
    AND v_approved_drawing_count = v_linked_drawing_count;
  IF v_scope_pass AND v_linked_drawing_count = 0 THEN
    v_drawing_blockers := array_append(v_drawing_blockers, 'No required shop drawings are linked to the scoped pieces.');
  END IF;
  IF v_unmapped_drawing_piece_count > 0 THEN
    v_drawing_blockers := array_append(
      v_drawing_blockers,
      format('%s scoped piece(s) have no linked shop drawing.', v_unmapped_drawing_piece_count)
    );
  END IF;
  IF v_missing_drawing_count > 0 THEN
    v_drawing_blockers := array_append(
      v_drawing_blockers,
      format('%s linked drawing record(s) are missing or inactive.', v_missing_drawing_count)
    );
  END IF;
  IF v_linked_drawing_count - v_missing_drawing_count - v_approved_drawing_count > 0 THEN
    v_drawing_blockers := array_append(
      v_drawing_blockers,
      format(
        '%s required shop drawing(s) are not approved or approved as noted.',
        v_linked_drawing_count - v_missing_drawing_count - v_approved_drawing_count
      )
    );
  END IF;

  WITH scope AS (
    SELECT piece."id"
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  ),
  requirements AS (
    SELECT DISTINCT requirement."id", requirement."receipt_state"
    FROM scope
    JOIN "public"."piece_material_requirements" AS mapping
      ON mapping."piece_id" = scope."id"
     AND mapping."project_id" = v_project_id
    JOIN "public"."material_requirements" AS requirement
      ON requirement."id" = mapping."material_requirement_id"
     AND requirement."project_id" = v_project_id
     AND requirement."is_deleted" = false
     AND requirement."deleted_at" IS NULL
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE "receipt_state" IN ('received', 'on_hand'))
  INTO v_requirement_count, v_received_requirement_count
  FROM requirements;

  WITH scope AS (
    SELECT piece."id"
    FROM "public"."pieces" AS piece
    WHERE piece."project_id" = v_project_id
      AND piece."work_package_id" = p_work_package_id
      AND piece."deleted_at" IS NULL
      AND piece."lifecycle_status" NOT IN ('shipped', 'delivered', 'erected')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."pieces" AS child
        WHERE child."parent_piece_id" = piece."id"
          AND child."deleted_at" IS NULL
      )
  )
  SELECT count(*) INTO v_unmapped_material_piece_count
  FROM scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."piece_material_requirements" AS mapping
    JOIN "public"."material_requirements" AS requirement
      ON requirement."id" = mapping."material_requirement_id"
     AND requirement."project_id" = v_project_id
     AND requirement."is_deleted" = false
     AND requirement."deleted_at" IS NULL
    WHERE mapping."piece_id" = scope."id"
      AND mapping."project_id" = v_project_id
  );

  v_material_pass :=
    v_scope_pass
    AND v_requirement_count > 0
    AND v_unmapped_material_piece_count = 0
    AND v_received_requirement_count = v_requirement_count;
  IF v_scope_pass AND v_requirement_count = 0 THEN
    v_material_blockers := array_append(v_material_blockers, 'Material requirements are unknown or unmapped for this work package.');
  END IF;
  IF v_unmapped_material_piece_count > 0 THEN
    v_material_blockers := array_append(
      v_material_blockers,
      format('%s scoped piece(s) have unknown or unmapped material.', v_unmapped_material_piece_count)
    );
  END IF;
  IF v_requirement_count - v_received_requirement_count > 0 THEN
    v_material_blockers := array_append(
      v_material_blockers,
      format(
        '%s material requirement(s) are not explicitly received or on hand.',
        v_requirement_count - v_received_requirement_count
      )
    );
  END IF;

  v_holds_pass := v_scope_pass AND v_held_piece_count = 0;
  IF v_held_piece_count > 0 THEN
    v_hold_blockers := array_append(
      v_hold_blockers,
      format('%s scoped piece(s) are on hold.', v_held_piece_count)
    );
  END IF;

  v_blockers :=
    v_scope_blockers ||
    v_drawing_blockers ||
    v_material_blockers ||
    v_hold_blockers;
  IF v_already_released THEN
    v_blockers := array_append(v_blockers, 'This work package already has an active fabrication release.');
  END IF;

  RETURN jsonb_build_object(
    'work_package_id', p_work_package_id,
    'project_id', v_project_id,
    'passes', (
      v_scope_pass AND v_drawings_pass AND v_material_pass AND v_holds_pass
      AND NOT v_already_released
    ),
    'already_released', v_already_released,
    'checks', jsonb_build_object(
      'scope', jsonb_build_object(
        'passed', v_scope_pass,
        'piece_count', v_scope_count,
        'blockers', to_jsonb(v_scope_blockers)
      ),
      'drawings', jsonb_build_object(
        'passed', v_drawings_pass,
        'linked_count', v_linked_drawing_count,
        'approved_count', v_approved_drawing_count,
        'missing_count', v_missing_drawing_count,
        'unmapped_piece_count', v_unmapped_drawing_piece_count,
        'blockers', to_jsonb(v_drawing_blockers)
      ),
      'material', jsonb_build_object(
        'passed', v_material_pass,
        'requirement_count', v_requirement_count,
        'received_or_on_hand_count', v_received_requirement_count,
        'unmapped_piece_count', v_unmapped_material_piece_count,
        'blockers', to_jsonb(v_material_blockers)
      ),
      'holds', jsonb_build_object(
        'passed', v_holds_pass,
        'held_piece_count', v_held_piece_count,
        'blockers', to_jsonb(v_hold_blockers)
      )
    ),
    'blockers', to_jsonb(v_blockers),
    'evaluated_at', now()
  );
END;
$$;

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
    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
    ) VALUES (
      v_work_package.project_id,
      v_piece.id,
      'released_for_fabrication',
      jsonb_build_object('lifecycle_status', v_piece.lifecycle_status),
      jsonb_build_object(
        'lifecycle_status', v_piece.lifecycle_status,
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

REVOKE ALL ON FUNCTION "public"."create_material_requirement"(uuid, text, text, text, text, numeric, text, text, text) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."map_material_requirement_to_pieces"(uuid, uuid, uuid[]) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."set_material_requirement_receipt_state"(uuid, uuid, text, numeric, text, text, jsonb) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."piece_control_drawing_is_approved"(uuid) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."evaluate_release_gate"(uuid) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."release_work_package_canonical"(uuid, text) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."create_material_requirement"(uuid, text, text, text, text, numeric, text, text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."map_material_requirement_to_pieces"(uuid, uuid, uuid[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_material_requirement_receipt_state"(uuid, uuid, text, numeric, text, text, jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."piece_control_drawing_is_approved"(uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."evaluate_release_gate"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_work_package_canonical"(uuid, text) TO "authenticated";
