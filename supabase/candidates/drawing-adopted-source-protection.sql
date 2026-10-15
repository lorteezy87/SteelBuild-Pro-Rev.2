-- UNINSTALLED SOURCE CANDIDATE. Install after drawing-set-revision-transaction.sql.
-- Ordinary-role metadata protection only: Storage API/byte acceptance and the
-- privileged-writer review remain release gates. No historic source backfill.
BEGIN;
CREATE TABLE steelbuild_drawing_revision.adopted_sources (
  bucket_id text NOT NULL CHECK(bucket_id='app-files'),
  path text NOT NULL CHECK(length(path)<=512),
  object_id uuid NOT NULL,
  source_token text NOT NULL CHECK(source_token ~ '^[0-9a-f]{64}$'),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  adopted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(bucket_id,path)
);
ALTER TABLE steelbuild_drawing_revision.adopted_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.adopted_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX drawing_adopted_sources_project ON steelbuild_drawing_revision.adopted_sources(project_id);
CREATE INDEX drawing_adopted_sources_org ON steelbuild_drawing_revision.adopted_sources(org_id);
-- No receipt, set, revision or Storage FK: pruning/archive and a privileged
-- object deletion cannot release the path. Existing authorized scope erasure
-- can still cascade it; this is not a new erasure authorization path.
CREATE FUNCTION steelbuild_drawing_revision.adopt_sources(p_project uuid,p_paths text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_org uuid; v_object storage.objects;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_ISOLATION: READ COMMITTED is required' USING ERRCODE='40001'; END IF;
  v_org:=steelbuild_drawing_revision.assert_access(p_project);
  IF coalesce(cardinality(p_paths),0) NOT BETWEEN 1 AND 250
    OR cardinality(p_paths)<>(SELECT count(DISTINCT x) FROM unnest(p_paths)x)
    OR EXISTS(SELECT 1 FROM unnest(p_paths)x WHERE x IS NULL OR length(x)>512 OR
      x !~ ('^'||v_org::text||'/uploads/'||p_project::text||'/[A-Za-z0-9._-]+[.]pdf$') OR x LIKE '%..%') THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_SCOPE: Exact project upload paths required' USING ERRCODE='22023'; END IF;
  PERFORM o.id FROM storage.objects o WHERE o.bucket_id='app-files' AND o.name=ANY(p_paths) ORDER BY o.name,o.id FOR UPDATE NOWAIT;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='app-files' AND name=ANY(p_paths))<>cardinality(p_paths) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_CHANGED: Source is unavailable' USING ERRCODE='40001'; END IF;
  FOR v_object IN SELECT * FROM storage.objects WHERE bucket_id='app-files' AND name=ANY(p_paths) ORDER BY name,id LOOP
    IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.adopted_sources a WHERE a.bucket_id=v_object.bucket_id AND a.path=v_object.name
      AND (a.org_id,a.project_id,a.object_id,a.source_token) IS DISTINCT FROM
        (v_org,p_project,v_object.id,steelbuild_drawing_revision.source_token(v_object))) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_CHANGED: Adopted identity changed; use a new source path' USING ERRCODE='40001'; END IF;
    INSERT INTO steelbuild_drawing_revision.adopted_sources(bucket_id,path,object_id,source_token,org_id,project_id)
      VALUES(v_object.bucket_id,v_object.name,v_object.id,steelbuild_drawing_revision.source_token(v_object),v_org,p_project)
      ON CONFLICT(bucket_id,path) DO NOTHING;
  END LOOP;
  PERFORM steelbuild_drawing_revision.assert_access(p_project);
END $$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.adopt_sources(uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.drawing_source_mutation_allowed(p_bucket text,p_old_path text,p_new_path text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_path text; v_paths text[]:='{}'; v_org uuid; v_project uuid;
BEGIN
  IF p_bucket IS NULL OR btrim(p_bucket)=''
    OR p_old_path IS NULL OR p_new_path IS NULL
    OR btrim(p_old_path)='' OR btrim(p_new_path)='' THEN RETURN false; END IF;
  IF p_bucket<>'app-files' THEN RETURN true; END IF;
  IF auth.uid() IS NULL OR NOT coalesce(steelbuild_security.satisfies_mfa(),false)
    OR current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
  FOR v_path IN SELECT DISTINCT p FROM unnest(ARRAY[p_old_path,p_new_path])p ORDER BY p LOOP
    -- Only the complete command-accepted form is a drawing source. A prefix
    -- plus .pdf is not enough: older/sibling literal keys can have long or
    -- unusual names, and remain governed by their existing Storage policies.
    IF length(v_path)<=512 AND v_path NOT LIKE '%..%' AND
      v_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+[.]pdf$' THEN
      v_org:=split_part(v_path,'/',1)::uuid;v_project:=split_part(v_path,'/',3)::uuid;
      -- A direct RPC call must not confer a foreign-project locking oracle.
      IF NOT coalesce(public.user_is_org_member(v_org),false)
        OR NOT coalesce(public.user_has_project_access(v_project),false)
        OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=v_project AND org_id=v_org) THEN RETURN false; END IF;
      v_paths:=array_append(v_paths,v_path);
    END IF;
  END LOOP;
  -- Valid legacy/sibling names and other buckets keep their existing policies.
  -- VOLATILE reads adoption with a fresh snapshot after ordered NOWAIT locks;
  -- an old RLS statement snapshot cannot overwrite a newly adopted source.
  PERFORM o.id FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=ANY(v_paths) ORDER BY o.name,o.id FOR UPDATE NOWAIT;
  RETURN NOT EXISTS(SELECT 1 FROM steelbuild_drawing_revision.adopted_sources WHERE bucket_id=p_bucket AND path=ANY(ARRAY[p_old_path,p_new_path]));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'DRAWING_SOURCE_BUSY: Concurrent source review; retry the operation' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION public.drawing_source_mutation_allowed(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.drawing_source_mutation_allowed(text,text,text) TO authenticated;

CREATE POLICY drawing_adopted_source_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.drawing_source_mutation_allowed(bucket_id,name,name))
  WITH CHECK (public.drawing_source_mutation_allowed(bucket_id,name,name));
CREATE POLICY drawing_adopted_source_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.drawing_source_mutation_allowed(bucket_id,name,name));
-- Privileged deletion must not make a retained path reusable by ordinary upload.
-- No SELECT policy changes: normal downloads retain their existing authorization.
CREATE POLICY drawing_adopted_source_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.drawing_source_mutation_allowed(bucket_id,name,name));
COMMIT;
