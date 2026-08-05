-- Recoverable, server-mediated archival for canonical Piece Control records.

ALTER TABLE "public"."piece_events"
DROP CONSTRAINT IF EXISTS "piece_events_event_type_check";

ALTER TABLE "public"."piece_events"
ADD CONSTRAINT "piece_events_event_type_check" CHECK (
  "event_type" = ANY (
    ARRAY[
      'imported'::text,
      'updated_from_import'::text,
      'lot_split'::text,
      'lot_merged'::text,
      'assigned_to_work_package'::text,
      'drawing_linked'::text,
      'drawing_unlinked'::text,
      'hold_applied'::text,
      'hold_released'::text,
      'released_for_fabrication'::text,
      'release_exception'::text,
      'station_advanced'::text,
      'station_override'::text,
      'shipped'::text,
      'delivered'::text,
      'erected'::text,
      'archived'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION "public"."archive_piece_lots"(
  p_project_id uuid,
  p_piece_ids uuid[],
  p_confirmation text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_piece_ids uuid[];
  v_requested_count integer;
  v_active_count integer;
  v_expected_confirmation text;
  v_archived_at timestamptz := now();
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Only a project admin may archive canonical pieces'
      USING errcode = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT requested.piece_id ORDER BY requested.piece_id), '{}'::uuid[])
  INTO v_piece_ids
  FROM unnest(coalesce(p_piece_ids, '{}'::uuid[])) AS requested(piece_id)
  WHERE requested.piece_id IS NOT NULL;

  v_requested_count := cardinality(v_piece_ids);
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'Select at least one piece to archive';
  END IF;

  v_expected_confirmation := format(
    'ARCHIVE %s %s',
    v_requested_count,
    CASE WHEN v_requested_count = 1 THEN 'PIECE' ELSE 'PIECES' END
  );
  IF btrim(coalesce(p_confirmation, '')) <> v_expected_confirmation THEN
    RAISE EXCEPTION 'Confirmation must exactly match %', v_expected_confirmation;
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'An archive reason is required';
  END IF;

  SELECT "piece_control_mode"
  INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id
  FOR UPDATE;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  PERFORM piece."id"
  FROM "public"."pieces" AS piece
  WHERE piece."id" = ANY(v_piece_ids)
  ORDER BY piece."id"
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_active_count
  FROM "public"."pieces" AS piece
  WHERE piece."id" = ANY(v_piece_ids)
    AND piece."project_id" = p_project_id
    AND piece."is_deleted" = false
    AND piece."deleted_at" IS NULL;

  IF v_active_count <> v_requested_count THEN
    RAISE EXCEPTION 'All selected pieces must be active and belong to the same project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS piece
    WHERE piece."id" = ANY(v_piece_ids)
      AND (
        piece."is_container" = true
        OR piece."parent_piece_id" IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "public"."pieces" AS child
          WHERE child."parent_piece_id" = piece."id"
            AND child."is_deleted" = false
            AND child."deleted_at" IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'Split piece lots cannot be archived; preserve the complete lot topology';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS piece
    WHERE piece."id" = ANY(v_piece_ids)
      AND (
        piece."lifecycle_status" <> 'not_started'
        OR piece."current_station" IS NOT NULL
        OR piece."on_hold" = true
      )
  ) THEN
    RAISE EXCEPTION 'Held or production-started pieces cannot be archived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."piece_station_completions" AS completion
    WHERE completion."piece_id" = ANY(v_piece_ids)
  ) THEN
    RAISE EXCEPTION 'Pieces with production history cannot be archived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS piece
    JOIN "public"."fab_releases" AS release
      ON release."work_package_id" = piece."work_package_id"
     AND release."project_id" = p_project_id
     AND release."canonical_release" = true
     AND coalesce(release."is_deleted", false) = false
    WHERE piece."id" = ANY(v_piece_ids)
  ) THEN
    RAISE EXCEPTION 'Pieces in a canonically released work package cannot be archived';
  END IF;

  INSERT INTO "public"."piece_events" (
    "project_id",
    "piece_id",
    "event_type",
    "previous_state",
    "next_state",
    "reason",
    "source_system",
    "created_by"
  )
  SELECT
    piece."project_id",
    piece."id",
    'archived',
    jsonb_build_object(
      'is_deleted', piece."is_deleted",
      'deleted_at', piece."deleted_at",
      'lifecycle_status', piece."lifecycle_status",
      'work_package_id', piece."work_package_id"
    ),
    jsonb_build_object(
      'is_deleted', true,
      'deleted_at', v_archived_at
    ),
    btrim(p_reason),
    'piece_register',
    v_actor
  FROM "public"."pieces" AS piece
  WHERE piece."id" = ANY(v_piece_ids);

  UPDATE "public"."pieces"
  SET "is_deleted" = true,
      "deleted_at" = v_archived_at
  WHERE "id" = ANY(v_piece_ids);

  RETURN jsonb_build_object(
    'archived', v_requested_count,
    'piece_ids', to_jsonb(v_piece_ids),
    'archived_at', v_archived_at
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."archive_piece_lots"(uuid, uuid[], text, text)
  FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."archive_piece_lots"(uuid, uuid[], text, text)
  TO "authenticated", "service_role";

