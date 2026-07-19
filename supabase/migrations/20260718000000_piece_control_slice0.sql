-- Slice 0: dormant piece-control foundation (additive, no legacy data migration).

ALTER TABLE "public"."projects"
ADD COLUMN IF NOT EXISTS "piece_control_mode" text NOT NULL DEFAULT 'off';

ALTER TABLE "public"."projects"
ADD CONSTRAINT "projects_piece_control_mode_check"
CHECK ("piece_control_mode" IN ('off'::"text", 'shadow'::"text", 'pilot'::"text", 'live'::"text"));

COMMENT ON COLUMN "public"."projects"."piece_control_mode" IS
  'Piece-control rollout mode: off = legacy workflows only; shadow = dual-write/observe only; pilot = read/write from new tables in scoped pilots; live = canonical piece-control cutover.';

CREATE TABLE IF NOT EXISTS "public"."pieces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "piece_mark" "text" NOT NULL,
    "normalized_piece_mark" "text" GENERATED ALWAYS AS (upper(trim("piece_mark"))) STORED,
    "lot_code" "text" NOT NULL DEFAULT 'ALL'::"text",
    "parent_piece_id" "uuid",
    "quantity" numeric NOT NULL DEFAULT 1,
    "weight_each_lbs" numeric,
    "weight_total_lbs" numeric,
    "profile" "text",
    "material_grade" "text",
    "length_inches" numeric,
    "sequence_number" "text",
    "erection_area" "text",
    "work_package_id" "uuid",
    "lifecycle_status" "text" NOT NULL DEFAULT 'not_started'::"text",
    "current_station" "text",
    "on_hold" boolean NOT NULL DEFAULT false,
    "on_hold_reason" "text",
    "on_hold_at" timestamp with time zone,
    "on_hold_by" "uuid",
    "source_system" "text",
    "external_ref" "text",
    "metadata" jsonb NOT NULL DEFAULT '{}'::"jsonb",
    "is_deleted" boolean NOT NULL DEFAULT false,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pieces_normalized_mark_not_empty_check" CHECK (length("normalized_piece_mark") > 0),
    CONSTRAINT "pieces_normalized_mark_matches_check" CHECK ("normalized_piece_mark" = upper(trim("piece_mark"))),
    CONSTRAINT "pieces_positive_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "pieces_parent_not_self_check" CHECK (("id" <> "parent_piece_id") OR ("parent_piece_id" IS NULL)),
    CONSTRAINT "pieces_lifecycle_status_check" CHECK (
      "lifecycle_status" = ANY (
        ARRAY[
          'not_started'::"text",
          'in_fabrication'::"text",
          'fabricated'::"text",
          'shipped'::"text",
          'delivered'::"text",
          'erected'::"text"
        ]
      )
    ),
    CONSTRAINT "pieces_current_station_check" CHECK (
      ("current_station" IS NULL) OR
      ("current_station" = ANY (
        ARRAY[
          'cut'::"text",
          'fit'::"text",
          'weld'::"text",
          'qc'::"text",
          'paint'::"text",
          'ready_to_ship'::"text"
        ]
      ))
    ),
    CONSTRAINT "pieces_weights_non_negative_check" CHECK (
      ("weight_each_lbs" IS NULL OR "weight_each_lbs" >= 0) AND
      ("weight_total_lbs" IS NULL OR "weight_total_lbs" >= 0)
    ),
    CONSTRAINT "pieces_length_non_negative_check" CHECK ("length_inches" IS NULL OR "length_inches" >= 0),
    CONSTRAINT "pieces_hold_metadata_cleared_check" CHECK (
      ("on_hold" = true) OR ("on_hold_reason" IS NULL AND "on_hold_at" IS NULL AND "on_hold_by" IS NULL)
    ),
    CONSTRAINT "pieces_piece_mark_check" CHECK (length(trim("piece_mark")) > 0),
    CONSTRAINT "pieces_lot_code_check" CHECK (length(trim("lot_code")) > 0),
    CONSTRAINT "pieces_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects" ("id"),
    CONSTRAINT "pieces_work_package_fk" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages" ("id"),
    CONSTRAINT "pieces_parent_piece_fk" FOREIGN KEY ("parent_piece_id") REFERENCES "public"."pieces" ("id") ON DELETE SET NULL
);

ALTER TABLE "public"."pieces" OWNER TO "postgres";

CREATE UNIQUE INDEX IF NOT EXISTS "pieces_active_project_mark_lot_ux"
ON "public"."pieces" ("project_id", "normalized_piece_mark", "lot_code")
WHERE ("is_deleted" = false);

CREATE INDEX IF NOT EXISTS "pieces_active_project_work_package_idx"
ON "public"."pieces" ("project_id", "work_package_id")
WHERE ("is_deleted" = false) AND ("work_package_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "pieces_active_project_lifecycle_idx"
ON "public"."pieces" ("project_id", "lifecycle_status")
WHERE ("is_deleted" = false);

CREATE INDEX IF NOT EXISTS "pieces_parent_piece_idx"
ON "public"."pieces" ("parent_piece_id");

CREATE OR REPLACE TRIGGER "set_pieces_updated_at"
BEFORE UPDATE ON "public"."pieces"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE TABLE IF NOT EXISTS "public"."piece_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "piece_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "previous_state" jsonb NOT NULL DEFAULT '{}'::"jsonb",
    "next_state" jsonb NOT NULL DEFAULT '{}'::"jsonb",
    "reason" "text",
    "source_system" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "piece_events_event_type_check" CHECK (
      "event_type" = ANY (
        ARRAY[
          'imported'::"text",
          'updated_from_import'::"text",
          'lot_split'::"text",
          'lot_merged'::"text",
          'assigned_to_work_package'::"text",
          'drawing_linked'::"text",
          'drawing_unlinked'::"text",
          'hold_applied'::"text",
          'hold_released'::"text",
          'released_for_fabrication'::"text",
          'release_exception'::"text",
          'station_advanced'::"text",
          'station_override'::"text",
          'shipped'::"text",
          'delivered'::"text",
          'erected'::"text"
        ]
      )
    ),
    CONSTRAINT "piece_events_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects" ("id"),
    CONSTRAINT "piece_events_piece_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."pieces" ("id") ON DELETE CASCADE
);

ALTER TABLE "public"."piece_events" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "piece_events_piece_created_at_idx"
ON "public"."piece_events" ("piece_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "piece_events_project_created_at_idx"
ON "public"."piece_events" ("project_id", "created_at" DESC);

CREATE POLICY "piece_read" ON "public"."pieces"
FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));

CREATE POLICY "piece_event_read" ON "public"."piece_events"
FOR SELECT TO "authenticated" USING ("public"."user_has_project_access"("project_id"));

ALTER TABLE "public"."pieces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."piece_events" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "public"."pieces" TO "authenticated";
GRANT ALL ON TABLE "public"."pieces" TO "service_role";
GRANT SELECT ON TABLE "public"."piece_events" TO "authenticated";
GRANT ALL ON TABLE "public"."piece_events" TO "service_role";

ALTER TABLE "public"."model_elements"
ADD COLUMN IF NOT EXISTS "piece_id" "uuid";

CREATE INDEX IF NOT EXISTS "model_elements_piece_id_idx"
ON "public"."model_elements" ("piece_id");

ALTER TABLE "public"."model_elements"
ADD CONSTRAINT "model_elements_piece_id_fkey"
FOREIGN KEY ("piece_id") REFERENCES "public"."pieces" ("id");
