-- Soft-delete + uniqueness for cost_codes (launch-readiness).
-- Prevents hard-delete of financial history and duplicate numbers per project.

ALTER TABLE "public"."cost_codes"
  ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."cost_codes"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "cost_codes_project_number_live_uidx"
  ON "public"."cost_codes" ("project_id", "cost_code_number")
  WHERE coalesce("is_deleted", false) = false
    AND "cost_code_number" IS NOT NULL
    AND btrim("cost_code_number") <> '';
