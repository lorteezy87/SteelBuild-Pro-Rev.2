-- Piece Control Slice 2: authoritative work-package and drawing relationships.
-- Existing Fab Release, model_elements.drawing_id, and legacy WP drawing fields
-- are intentionally untouched.

CREATE TABLE IF NOT EXISTS "public"."piece_drawings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "piece_id" "uuid" NOT NULL,
    "drawing_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "piece_drawings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_drawings_project_fk" FOREIGN KEY ("project_id")
      REFERENCES "public"."projects" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_drawings_piece_fk" FOREIGN KEY ("piece_id")
      REFERENCES "public"."pieces" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_drawings_drawing_fk" FOREIGN KEY ("drawing_id")
      REFERENCES "public"."drawings" ("id") ON DELETE CASCADE,
    CONSTRAINT "piece_drawings_created_by_fk" FOREIGN KEY ("created_by")
      REFERENCES "auth"."users" ("id"),
    CONSTRAINT "piece_drawings_piece_drawing_unique" UNIQUE ("piece_id", "drawing_id")
);

CREATE INDEX IF NOT EXISTS "piece_drawings_project_piece_idx"
ON "public"."piece_drawings" ("project_id", "piece_id");

CREATE INDEX IF NOT EXISTS "piece_drawings_project_drawing_idx"
ON "public"."piece_drawings" ("project_id", "drawing_id");

CREATE OR REPLACE TRIGGER "set_piece_drawings_updated_at"
BEFORE UPDATE ON "public"."piece_drawings"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."piece_drawings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piece_drawing_read"
ON "public"."piece_drawings"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

REVOKE ALL ON TABLE "public"."piece_drawings" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."piece_drawings" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_drawings" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."assign_pieces_to_work_package"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_work_package_id uuid
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
  v_piece "public"."pieces"%ROWTYPE;
  v_changed integer := 0;
  v_unchanged integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to assign pieces in this project' USING errcode = '42501';
  END IF;

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN RAISE EXCEPTION 'At least one piece is required'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "public"."work_packages"
    WHERE "id" = p_work_package_id
      AND "project_id" = p_project_id
      AND "is_deleted" = false
      AND "deleted_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Active work package not found in this project';
  END IF;

  IF (
    SELECT count(*)
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
      AND "project_id" = p_project_id
      AND "deleted_at" IS NULL
  ) <> v_expected THEN
    RAISE EXCEPTION 'All pieces must be active and belong to the same project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS parent
    JOIN "public"."pieces" AS child
      ON child."parent_piece_id" = parent."id"
     AND child."deleted_at" IS NULL
    WHERE parent."id" = ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be assigned; assign active leaf lots instead';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
    ORDER BY "id"
    FOR UPDATE
  LOOP
    IF v_piece.work_package_id IS NOT DISTINCT FROM p_work_package_id THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE "public"."pieces"
    SET "work_package_id" = p_work_package_id
    WHERE "id" = v_piece.id;

    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
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

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'work_package_id', p_work_package_id,
    'assigned', v_changed,
    'unchanged', v_unchanged
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."unassign_pieces_from_work_package"(
  p_project_id uuid,
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
  v_piece "public"."pieces"%ROWTYPE;
  v_changed integer := 0;
  v_unchanged integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unassign pieces in this project' USING errcode = '42501';
  END IF;

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS id;
  v_expected := coalesce(cardinality(v_ids), 0);
  IF v_expected = 0 THEN RAISE EXCEPTION 'At least one piece is required'; END IF;

  IF (
    SELECT count(*)
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
      AND "project_id" = p_project_id
      AND "deleted_at" IS NULL
  ) <> v_expected THEN
    RAISE EXCEPTION 'All pieces must be active and belong to the same project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS parent
    JOIN "public"."pieces" AS child
      ON child."parent_piece_id" = parent."id"
     AND child."deleted_at" IS NULL
    WHERE parent."id" = ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be unassigned; use active leaf lots instead';
  END IF;

  FOR v_piece IN
    SELECT *
    FROM "public"."pieces"
    WHERE "id" = ANY(v_ids)
    ORDER BY "id"
    FOR UPDATE
  LOOP
    IF v_piece.work_package_id IS NULL THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE "public"."pieces"
    SET "work_package_id" = NULL
    WHERE "id" = v_piece.id;

    INSERT INTO "public"."piece_events" (
      "project_id", "piece_id", "event_type", "previous_state", "next_state",
      "reason", "source_system", "created_by"
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

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'unassigned', v_changed,
    'unchanged', v_unchanged
  );
END;
$$;

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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

REVOKE ALL ON FUNCTION "public"."assign_pieces_to_work_package"(uuid, uuid[], uuid) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."unassign_pieces_from_work_package"(uuid, uuid[]) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."link_piece_drawing"(uuid, uuid, uuid) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."unlink_piece_drawing"(uuid, uuid, uuid) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."assign_pieces_to_work_package"(uuid, uuid[], uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."unassign_pieces_from_work_package"(uuid, uuid[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."link_piece_drawing"(uuid, uuid, uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."unlink_piece_drawing"(uuid, uuid, uuid) TO "authenticated";

