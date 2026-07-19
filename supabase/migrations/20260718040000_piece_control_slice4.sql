-- Slice 4: controlled lot splitting and canonical production stations.

ALTER TABLE "public"."pieces"
ADD COLUMN IF NOT EXISTS "is_container" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."pieces"."is_container" IS
  'Roll-up traceability row. Containers are not actionable and are excluded from piece counts, tons, release scope, and production rollups.';

CREATE INDEX IF NOT EXISTS "pieces_actionable_project_work_package_idx"
ON "public"."pieces" ("project_id", "work_package_id", "lifecycle_status")
WHERE "is_deleted" = false AND "deleted_at" IS NULL AND "is_container" = false;

CREATE TABLE IF NOT EXISTS "public"."piece_station_configurations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "station_key" text NOT NULL,
  "station_name" text NOT NULL,
  "sort_order" integer NOT NULL CHECK ("sort_order" > 0),
  "earned_percent" numeric(7,4) NOT NULL CHECK ("earned_percent" > 0 AND "earned_percent" <= 100),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "piece_station_configuration_key_check"
    CHECK ("station_key" = ANY (ARRAY['cut', 'fit', 'weld', 'qc', 'paint', 'ready_to_ship']::text[])),
  CONSTRAINT "piece_station_configuration_project_key_unique"
    UNIQUE ("project_id", "station_key"),
  CONSTRAINT "piece_station_configuration_project_order_unique"
    UNIQUE ("project_id", "sort_order")
);

CREATE TABLE IF NOT EXISTS "public"."piece_station_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "piece_id" uuid NOT NULL REFERENCES "public"."pieces"("id") ON DELETE RESTRICT,
  "station_configuration_id" uuid NOT NULL REFERENCES "public"."piece_station_configurations"("id") ON DELETE RESTRICT,
  "station_key" text NOT NULL,
  "station_name" text NOT NULL,
  "sort_order" integer NOT NULL CHECK ("sort_order" > 0),
  "earned_percent" numeric(7,4) NOT NULL CHECK ("earned_percent" > 0 AND "earned_percent" <= 100),
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  "completed_by" uuid NOT NULL,
  "is_override" boolean NOT NULL DEFAULT false,
  "override_reason" text,
  "inherited_from_completion_id" uuid REFERENCES "public"."piece_station_completions"("id") ON DELETE RESTRICT,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "piece_station_completion_override_reason_check"
    CHECK (NOT "is_override" OR nullif(btrim("override_reason"), '') IS NOT NULL),
  CONSTRAINT "piece_station_completion_piece_station_unique"
    UNIQUE ("piece_id", "station_configuration_id")
);

CREATE INDEX IF NOT EXISTS "piece_station_configurations_project_order_idx"
ON "public"."piece_station_configurations" ("project_id", "sort_order")
WHERE "is_active" = true;

CREATE INDEX IF NOT EXISTS "piece_station_completions_project_piece_idx"
ON "public"."piece_station_completions" ("project_id", "piece_id", "sort_order");

ALTER TABLE "public"."piece_station_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."piece_station_completions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piece_station_configuration_read"
ON "public"."piece_station_configurations"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "piece_station_completion_read"
ON "public"."piece_station_completions"
FOR SELECT TO "authenticated"
USING ("public"."user_has_project_access"("project_id"));

REVOKE ALL ON TABLE "public"."piece_station_configurations" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON TABLE "public"."piece_station_completions" FROM PUBLIC, "anon", "authenticated";
GRANT SELECT ON TABLE "public"."piece_station_configurations" TO "authenticated";
GRANT SELECT ON TABLE "public"."piece_station_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_station_configurations" TO "service_role";
GRANT ALL ON TABLE "public"."piece_station_completions" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."guard_piece_station_completion_immutable"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Piece station completions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS "guard_piece_station_completion_update" ON "public"."piece_station_completions";
CREATE TRIGGER "guard_piece_station_completion_update"
BEFORE UPDATE ON "public"."piece_station_completions"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_station_completion_immutable"();

DROP TRIGGER IF EXISTS "guard_piece_station_completion_delete" ON "public"."piece_station_completions";
CREATE TRIGGER "guard_piece_station_completion_delete"
BEFORE DELETE ON "public"."piece_station_completions"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_piece_station_completion_immutable"();

CREATE OR REPLACE FUNCTION "public"."validate_piece_station_configuration"(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_distinct_order_count integer;
  v_min_order integer;
  v_max_order integer;
  v_percent_total numeric;
BEGIN
  SELECT
    count(*),
    count(DISTINCT "sort_order"),
    min("sort_order"),
    max("sort_order"),
    coalesce(sum("earned_percent"), 0)
  INTO
    v_count,
    v_distinct_order_count,
    v_min_order,
    v_max_order,
    v_percent_total
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "is_active" = true;

  IF v_count <> 6
     OR v_distinct_order_count <> 6
     OR v_min_order <> 1
     OR v_max_order <> 6 THEN
    RAISE EXCEPTION 'An active station configuration must contain the six canonical stations in a contiguous order';
  END IF;

  IF v_percent_total <> 100 THEN
    RAISE EXCEPTION 'Active station earned percentages must total exactly 100; received %', v_percent_total;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."validate_piece_station_configuration_trigger"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM "public"."validate_piece_station_configuration"(coalesce(NEW."project_id", OLD."project_id"));
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS "validate_piece_station_configuration_deferred"
ON "public"."piece_station_configurations";
CREATE CONSTRAINT TRIGGER "validate_piece_station_configuration_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "public"."piece_station_configurations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "public"."validate_piece_station_configuration_trigger"();

CREATE OR REPLACE FUNCTION "public"."seed_default_piece_stations"(p_project_id uuid, p_actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO "public"."piece_station_configurations" (
    "project_id", "station_key", "station_name", "sort_order", "earned_percent",
    "created_by", "updated_by"
  )
  VALUES
    (p_project_id, 'cut', 'Cut', 1, 15, p_actor, p_actor),
    (p_project_id, 'fit', 'Fit', 2, 20, p_actor, p_actor),
    (p_project_id, 'weld', 'Weld', 3, 25, p_actor, p_actor),
    (p_project_id, 'qc', 'QC', 4, 15, p_actor, p_actor),
    (p_project_id, 'paint', 'Paint', 5, 15, p_actor, p_actor),
    (p_project_id, 'ready_to_ship', 'Ready to Ship', 6, 10, p_actor, p_actor)
  ON CONFLICT ("project_id", "station_key") DO NOTHING;
$$;

SELECT "public"."seed_default_piece_stations"("id", NULL)
FROM "public"."projects"
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."piece_station_configurations" AS station
  WHERE station."project_id" = "projects"."id"
);

CREATE OR REPLACE FUNCTION "public"."seed_default_piece_stations_for_project"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM "public"."seed_default_piece_stations"(NEW."id", auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "seed_default_piece_stations_after_project_insert" ON "public"."projects";
CREATE TRIGGER "seed_default_piece_stations_after_project_insert"
AFTER INSERT ON "public"."projects"
FOR EACH ROW EXECUTE FUNCTION "public"."seed_default_piece_stations_for_project"();

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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

CREATE OR REPLACE FUNCTION "public"."split_piece_lot"(
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

CREATE OR REPLACE FUNCTION "public"."advance_piece_station"(
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

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
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

REVOKE ALL ON FUNCTION "public"."seed_default_piece_stations"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."validate_piece_station_configuration"(uuid) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."set_project_station_configuration"(uuid, jsonb) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."split_piece_lot"(uuid, uuid, jsonb) FROM PUBLIC, "anon";
REVOKE ALL ON FUNCTION "public"."advance_piece_station"(uuid, uuid, text, boolean, text) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."validate_piece_station_configuration"(uuid) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_project_station_configuration"(uuid, jsonb) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."split_piece_lot"(uuid, uuid, jsonb) TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."advance_piece_station"(uuid, uuid, text, boolean, text) TO "authenticated", "service_role";
