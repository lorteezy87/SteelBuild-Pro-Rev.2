-- ============================================================================
-- 033_projects_indexes.sql
--
-- Closes audit finding 5.5: projects table had zero non-primary-key indexes.
-- Every lookup by project_number or name was a sequential scan. Tolerable at
-- 15 projects (microseconds), a measurable hit at 500+.
--
-- Adjustment from the audit proposal: the proposal used
--   WHERE is_deleted IS NOT TRUE
-- but projects has no is_deleted column (projects is not in the soft-delete
-- set defined in src/api/supabaseClient.js). Using
--   WHERE project_number IS NOT NULL
-- instead as a defensive guard — zero effect on current data (all 15 rows
-- have project_number set), preserves the ability for future rows to carry
-- NULL without colliding.
--
-- Pre-migration verification:
--   - 0 duplicate project_number values (all 15 rows unique)
--   - pg_trgm extension not yet installed — this migration enables it
--   - 0 rows with NULL project_number
-- ============================================================================

-- Enable pg_trgm for trigram-based fuzzy name search.
-- Idempotent; no-op if already present.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Unique index on project_number — prevents duplicate project numbers at the
-- database level (client-side validation already checks this, but defense in
-- depth). Partial index excludes NULLs defensively.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_project_number
  ON public.projects (project_number)
  WHERE project_number IS NOT NULL;

-- Trigram GIN index on name — enables ILIKE '%query%' and similarity search
-- to use an index rather than a sequential scan. Matters when the project
-- selector / global search grows past a few hundred projects.
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON public.projects USING gin (name gin_trgm_ops);
