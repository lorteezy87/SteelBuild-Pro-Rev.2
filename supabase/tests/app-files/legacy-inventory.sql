-- Operator-reviewed metadata inventory, NOT an automatic authorization import.
-- Run only against an explicitly authorized DB/snapshot. No bytes downloaded,
-- no public/storage rows updated. Temporary objects vanish on ROLLBACK.
-- Each string hit is a *candidate*: JSON/free-text/URL substring hits can be
-- ambiguous, stale, or attacker-supplied. Verify ownership independently.
-- A normal transaction is required to create temporary scratch metadata;
-- READ ONLY rejects that DDL. All persistent relations below are SELECT-only.
BEGIN;
CREATE TEMP TABLE app_file_reference_candidates (
  object_id uuid, source_table text, source_record_id text, candidate_project_id uuid
) ON COMMIT DROP;
DO $$
DECLARE t record; project_expr text; id_expr text;
BEGIN
  FOR t IN
    SELECT c.oid, n.nspname, c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    project_expr := CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=t.oid AND a.attname='project_id' AND a.atttypid='uuid'::regtype AND NOT a.attisdropped)
      THEN 'r.project_id' ELSE 'NULL::uuid' END;
    id_expr := CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=t.oid AND a.attname='id' AND NOT a.attisdropped)
      THEN 'r.id::text' ELSE 'NULL::text' END;
    EXECUTE format('INSERT INTO app_file_reference_candidates
      SELECT o.id, %L, %s, %s FROM %I.%I r JOIN storage.objects o
      ON o.bucket_id=''app-files'' AND position(o.name in to_jsonb(r)::text)>0',
      t.nspname||'.'||t.relname,id_expr,project_expr,t.nspname,t.relname);
  END LOOP;
END;
$$;
SELECT o.id object_id, o.name object_name, o.owner uploader_id,
  private.app_file_path_scope(o.name) canonical_scope,
  s.scope_type reviewed_scope, s.review_reference,
  count(c.object_id) candidate_reference_count,
  array_agg(DISTINCT c.candidate_project_id) FILTER (WHERE c.candidate_project_id IS NOT NULL) candidate_projects,
  jsonb_agg(DISTINCT jsonb_build_object('table',c.source_table,'record',c.source_record_id,'project',c.candidate_project_id))
    FILTER (WHERE c.object_id IS NOT NULL) candidate_references
FROM storage.objects o
LEFT JOIN app_file_reference_candidates c ON c.object_id=o.id
LEFT JOIN private.app_file_scopes s ON s.object_id=o.id AND s.object_name=o.name
WHERE o.bucket_id='app-files'
GROUP BY o.id,o.name,o.owner,s.scope_type,s.review_reference
ORDER BY o.name;
ROLLBACK;
