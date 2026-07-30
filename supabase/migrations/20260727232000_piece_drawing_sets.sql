-- Piece links target drawing SETS (not individual sheet pages).
-- Fab-release still expands each linked set to its active sheets and requires
-- IFC/Released per sheet. Legacy piece_drawings rows remain as a fallback.

ALTER TABLE public.piece_events
  DROP CONSTRAINT IF EXISTS piece_events_event_type_check;

ALTER TABLE public.piece_events
  ADD CONSTRAINT piece_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'imported'::text,
      'updated_from_import'::text,
      'lot_split'::text,
      'lot_merged'::text,
      'assigned_to_work_package'::text,
      'drawing_linked'::text,
      'drawing_unlinked'::text,
      'drawing_set_linked'::text,
      'drawing_set_unlinked'::text,
      'hold_applied'::text,
      'hold_released'::text,
      'released_for_fabrication'::text,
      'release_exception'::text,
      'station_advanced'::text,
      'station_override'::text,
      'shipped'::text,
      'delivered'::text,
      'erected'::text,
      'archived'::text,
      'attributes_updated'::text
    ])
  );

CREATE TABLE IF NOT EXISTS public.piece_drawing_sets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  piece_id uuid NOT NULL,
  drawing_set_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT piece_drawing_sets_pkey PRIMARY KEY (id),
  CONSTRAINT piece_drawing_sets_project_fk FOREIGN KEY (project_id)
    REFERENCES public.projects (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_piece_fk FOREIGN KEY (piece_id)
    REFERENCES public.pieces (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_set_fk FOREIGN KEY (drawing_set_id)
    REFERENCES public.drawing_sets (id) ON DELETE CASCADE,
  CONSTRAINT piece_drawing_sets_created_by_fk FOREIGN KEY (created_by)
    REFERENCES auth.users (id),
  CONSTRAINT piece_drawing_sets_piece_set_unique UNIQUE (piece_id, drawing_set_id)
);

CREATE INDEX IF NOT EXISTS piece_drawing_sets_project_piece_idx
  ON public.piece_drawing_sets (project_id, piece_id);

CREATE INDEX IF NOT EXISTS piece_drawing_sets_project_set_idx
  ON public.piece_drawing_sets (project_id, drawing_set_id);

CREATE OR REPLACE TRIGGER set_piece_drawing_sets_updated_at
BEFORE UPDATE ON public.piece_drawing_sets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.piece_drawing_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY piece_drawing_set_read
ON public.piece_drawing_sets
FOR SELECT TO authenticated
USING (public.user_has_project_access(project_id));

REVOKE ALL ON TABLE public.piece_drawing_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.piece_drawing_sets TO authenticated;
GRANT ALL ON TABLE public.piece_drawing_sets TO service_role;

-- Backfill from existing sheet links (distinct sets only).
INSERT INTO public.piece_drawing_sets (project_id, piece_id, drawing_set_id, created_by)
SELECT DISTINCT
  pd.project_id,
  pd.piece_id,
  d.drawing_set_id,
  pd.created_by
FROM public.piece_drawings AS pd
JOIN public.drawings AS d
  ON d.id = pd.drawing_id
 AND d.project_id = pd.project_id
WHERE d.drawing_set_id IS NOT NULL
  AND d.is_deleted = false
  AND d.deleted_at IS NULL
ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;

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

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
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

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
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

REVOKE ALL ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_piece_drawing_set(uuid, uuid, uuid)
  TO authenticated;

-- Patch fab gate: expand set links → sheets; keep legacy sheet links.
-- Body mirrors 20260725194500 with only the linked / unmapped drawing checks changed.
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
    SELECT DISTINCT "drawing_id"
    FROM (
      SELECT pd."drawing_id"
      FROM "public"."piece_drawings" AS pd
      JOIN scope ON scope."id" = pd."piece_id"
      WHERE pd."project_id" = v_project_id
      UNION
      SELECT d."id" AS "drawing_id"
      FROM "public"."piece_drawing_sets" AS pds
      JOIN scope ON scope."id" = pds."piece_id"
      JOIN "public"."drawings" AS d
        ON d."drawing_set_id" = pds."drawing_set_id"
       AND d."project_id" = pds."project_id"
      WHERE pds."project_id" = v_project_id
        AND d."is_deleted" = false
        AND d."deleted_at" IS NULL
        AND d."is_superseded" = false
    ) AS expanded
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
    SELECT 1 FROM "public"."piece_drawing_sets" AS pds
    WHERE pds."piece_id" = scope."id"
      AND pds."project_id" = v_project_id
  )
  AND NOT EXISTS (
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
      format('%s scoped piece(s) have no linked shop drawing set.', v_unmapped_drawing_piece_count)
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
