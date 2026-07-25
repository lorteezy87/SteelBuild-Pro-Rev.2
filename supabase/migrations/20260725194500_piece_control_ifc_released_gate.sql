-- Slice 6 (2026-07-25): piece-control drawing readiness = IFC / Released.
--
-- Aligns SQL piece_control_drawing_is_approved with client
-- isGoverningDrawingReleaseReady / isDrawingApproved:
--   - Ready: most-recent linked submittal derives IFC (Approved/AAN + GC/Owner)
--     or Released for Fabrication; OR drawings.stage IFC/Released;
--     OR current-revision fab signoff (approved_for_fabrication).
--   - Not ready: bare set_approval_status, sheet-response-only, review-only,
--     OFS (Approved/AAN + Detailer-class BIC), R&R, BFA, OFA, IFA.

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
        -- Legacy sheet-stage enum (7 values; R&R is never stored here).
        d."stage" IN ('IFC', 'Released')

        -- Current-revision fabrication signoff.
        OR EXISTS (
          SELECT 1
          FROM "public"."drawing_signoffs" AS signoff
          WHERE signoff."drawing_id" = d."id"
            AND signoff."is_voided" = false
            AND signoff."stamp_type" = 'approved_for_fabrication'
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

        -- Most-recent linked submittal at IFC or Released.
        OR EXISTS (
          SELECT 1
          FROM (
            SELECT
              s."status",
              s."ball_in_court"
            FROM "public"."submittals" AS s
            WHERE d."drawing_set_id" = ANY(coalesce(s."drawing_set_ids", '{}'::uuid[]))
              AND s."is_deleted" = false
              AND s."deleted_at" IS NULL
            ORDER BY
              s."submitted_date" DESC NULLS LAST,
              s."updated_at" DESC NULLS LAST,
              coalesce(s."round_number", 1) DESC
            LIMIT 1
          ) AS recent
          WHERE recent."status" = 'Released for Fabrication'
             OR (
               recent."status" IN ('Approved', 'Approved as Noted')
               AND recent."ball_in_court" IN ('GC', 'Owner')
             )
        )
      )
  );
$$;

COMMENT ON FUNCTION "public"."piece_control_drawing_is_approved"(uuid) IS
  'True when governing drawing is release-ready (IFC/Released via submittal+BIC, drawings.stage, or fab signoff). Bare Approved/AAN without GC/Owner BIC is not enough (OFS/BFA).';

REVOKE ALL ON FUNCTION "public"."piece_control_drawing_is_approved"(uuid) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."piece_control_drawing_is_approved"(uuid) TO "service_role";

-- Keep evaluate_release_gate blocker copy aligned with IFC/Released.
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
        '%s required shop drawing(s) are not IFC / Released for fabrication.',
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

