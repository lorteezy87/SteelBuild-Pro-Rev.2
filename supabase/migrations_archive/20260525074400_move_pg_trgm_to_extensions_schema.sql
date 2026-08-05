-- Security remediation F-10 (hygiene): move pg_trgm out of the public schema.
--
-- Advisor `extension_in_public` flags pg_trgm installed in `public`. Relocate it
-- to the dedicated `extensions` schema (which already exists on this project).
--
-- Safety: the only dependent object is the GIN index idx_projects_name_trgm on
-- projects(name) using gin_trgm_ops. ALTER EXTENSION ... SET SCHEMA relocates the
-- extension's member objects (including the gin_trgm_ops operator class) but the
-- index's dependency is tracked by OID, so the index stays valid and is NOT
-- rebuilt. ILIKE/LIKE queries continue to use it (the planner matches the opclass
-- by OID, independent of search_path). Reversible via SET SCHEMA public.
--
-- Guarded so a fresh-database replay (where Supabase may already install pg_trgm
-- into `extensions`) is a no-op instead of erroring.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm'
      AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;
