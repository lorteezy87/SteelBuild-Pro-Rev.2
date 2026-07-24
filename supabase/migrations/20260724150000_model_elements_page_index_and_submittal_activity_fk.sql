-- Prod hardening for Sentry JAVASCRIPT-REACT-X / contacts embed / submittal_activity scope
--
-- 1. model_elements: (project_id, id) index so paged ORDER BY id filters by project
--    use an index instead of a primary-key scan + filter (~1.7s/page → index range).
-- 2. submittal_activity: add missing project_id FK so projectScopedSelect can use an
--    unambiguous PostgREST embed (table already has project_id, no orphans).

CREATE INDEX IF NOT EXISTS "model_elements_project_id_active_id_idx"
  ON "public"."model_elements" ("project_id", "id")
  WHERE "is_deleted" = false;

ALTER TABLE "public"."submittal_activity"
  DROP CONSTRAINT IF EXISTS "submittal_activity_project_id_fkey";

ALTER TABLE "public"."submittal_activity"
  ADD CONSTRAINT "submittal_activity_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE CASCADE;
