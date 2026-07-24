-- Piece Control production hardening:
-- 1) Add `released` to the canonical lifecycle (between not_started and in_fabrication)
-- 2) Set lifecycle to released on successful canonical fab release
-- 3) Hold apply/release RPCs (pieces remain SELECT-only for clients)
-- 4) Backfill released status from existing released_for_fabrication events

-- ── Lifecycle CHECK: include released ──────────────────────────────────────
ALTER TABLE "public"."pieces"
  DROP CONSTRAINT IF EXISTS "pieces_lifecycle_status_check";

ALTER TABLE "public"."pieces"
  ADD CONSTRAINT "pieces_lifecycle_status_check" CHECK (
    "lifecycle_status" = ANY (
      ARRAY[
        'not_started'::text,
        'released'::text,
        'in_fabrication'::text,
        'fabricated'::text,
        'shipped'::text,
        'delivered'::text,
        'erected'::text
      ]
    )
  );

-- Backfill: pieces that already have a release event but are still not_started
UPDATE "public"."pieces" AS piece
SET "lifecycle_status" = 'released',
    "updated_at" = now()
WHERE piece."lifecycle_status" = 'not_started'
  AND piece."deleted_at" IS NULL
  AND coalesce(piece."is_deleted", false) = false
  AND EXISTS (
    SELECT 1
    FROM "public"."piece_events" AS event
    WHERE event."piece_id" = piece."id"
      AND event."event_type" = 'released_for_fabrication'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "public"."piece_events" AS event
    WHERE event."piece_id" = piece."id"
      AND event."event_type" IN (
        'station_advanced',
        'station_override',
        'shipped',
        'delivered',
        'erected'
      )
  );

-- ── Release sets lifecycle to released when still pre-fab ────────────────
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

-- ── Hold apply / release ───────────────────────────────────────────────────
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

CREATE OR REPLACE FUNCTION "public"."set_piece_hold"(
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
  v_state text;
  v_message text;
  v_detail text;
BEGIN
  RETURN "public"."set_piece_hold_impl"(
    p_project_id,
    p_piece_ids,
    p_on_hold,
    p_reason
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_state = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL;
  RETURN "public"."record_piece_control_command_failure"(
    p_project_id,
    'set_piece_hold',
    coalesce(p_piece_ids, '{}'::uuid[]),
    v_state,
    v_message,
    v_detail,
    jsonb_build_object('on_hold', p_on_hold)
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."set_piece_hold_impl"(uuid, uuid[], boolean, text)
  FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."set_piece_hold"(uuid, uuid[], boolean, text)
  FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."set_piece_hold"(uuid, uuid[], boolean, text)
  TO "authenticated";

-- Align model_elements.fab_status vocabulary with canonical lifecycle (+ delivered/delivered)
ALTER TABLE "public"."model_elements"
  DROP CONSTRAINT IF EXISTS "model_elements_fab_status_check";

ALTER TABLE "public"."model_elements"
  ADD CONSTRAINT "model_elements_fab_status_check" CHECK (
    ("fab_status" IS NULL) OR ("fab_status" = ANY (
      ARRAY[
        'not_started'::text,
        'released'::text,
        'in_fabrication'::text,
        'fabricated'::text,
        'shipped'::text,
        'delivered'::text,
        'erected'::text
      ]
    ))
  );
