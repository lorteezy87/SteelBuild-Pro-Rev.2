-- Slice 5: immutable downstream logistics lifecycle for canonical piece lots.

CREATE OR REPLACE FUNCTION "public"."guard_piece_event_immutable"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Piece events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS "guard_piece_event_update" ON "public"."piece_events";
CREATE TRIGGER "guard_piece_event_update"
BEFORE UPDATE ON "public"."piece_events"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_event_immutable"();

DROP TRIGGER IF EXISTS "guard_piece_event_delete" ON "public"."piece_events";
CREATE TRIGGER "guard_piece_event_delete"
BEFORE DELETE ON "public"."piece_events"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_event_immutable"();

REVOKE ALL ON TABLE "public"."piece_events" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."piece_events" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_events" TO "service_role";

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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

CREATE OR REPLACE FUNCTION "public"."ship_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'fabricated', 'shipped', 'shipped',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION "public"."deliver_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'shipped', 'delivered', 'delivered',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION "public"."erect_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_reference_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'delivered', 'erected', 'erected',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION "public"."transition_piece_lots_canonical"(
  uuid, uuid[], text, text, text, jsonb
) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."ship_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."deliver_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."erect_piece_lots"(uuid, uuid[], jsonb)
  FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."transition_piece_lots_canonical"(
  uuid, uuid[], text, text, text, jsonb
) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."ship_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."deliver_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."erect_piece_lots"(uuid, uuid[], jsonb)
  TO "authenticated", "service_role";

