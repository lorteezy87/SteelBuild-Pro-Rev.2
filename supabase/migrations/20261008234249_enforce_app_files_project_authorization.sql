-- LOCAL CANDIDATE. Apply preparation 20261008234107, reconcile every existing
-- app-files object against a reviewed scope/quarantine manifest, then apply
-- this exact payload manually. Never db push/repair. New client upload paths
-- must be released in the coordinated cutover; old clients fail closed.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Prevent a legacy upload being inserted between the preflight and policies.
LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE missing bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='app-files' AND public=false) THEN
    RAISE EXCEPTION 'app-files cutover requires a private bucket';
  END IF;
  SELECT count(*) INTO missing FROM storage.objects o
   WHERE o.bucket_id='app-files'
     -- Retained flat-path rollback material is already inaccessible; it must
     -- stay untouched and can never acquire authorization through this map.
     AND o.name NOT LIKE 'uploads/%'
     AND NOT EXISTS (
       SELECT 1 FROM private.app_file_scopes s WHERE s.object_id=o.id AND s.object_name=o.name
         AND (s.scope_type='quarantine' OR (
           split_part(o.name,'/',1)=s.org_id::text AND (
             (s.scope_type='project' AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=s.project_id AND p.org_id=s.org_id)) OR
             (s.scope_type='organization') OR
             (s.scope_type='avatar' AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id=s.user_id AND m.org_id=s.org_id))
           )
           -- All PRE-cutover objects need review, including canonical-looking
           -- names created before this contract. A review cannot silently
           -- override a canonical path's project/user; quarantine conflicts.
           AND (private.app_file_path_scope(o.name) IS NULL OR (
             private.app_file_path_scope(o.name)->>'scope'=s.scope_type AND
             (private.app_file_path_scope(o.name)->>'org')::uuid=s.org_id AND
             (private.app_file_path_scope(o.name)->>'project')::uuid IS NOT DISTINCT FROM s.project_id AND
             (private.app_file_path_scope(o.name)->>'user')::uuid IS NOT DISTINCT FROM s.user_id
           ))
         ))
     );
  IF missing<>0 THEN RAISE EXCEPTION 'app-files reconciliation incomplete: % objects require reviewed scope or explicit quarantine',missing; END IF;
END;
$$;

-- Only these four app-owned policies change; sibling/email policies remain.
ALTER POLICY auth_read ON storage.objects TO authenticated
USING (bucket_id='app-files' AND private.app_file_can_access(id,name,false));
ALTER POLICY auth_upload ON storage.objects TO authenticated
WITH CHECK (bucket_id='app-files' AND owner=(SELECT auth.uid()) AND private.app_file_can_access(NULL,name,true));
ALTER POLICY auth_update ON storage.objects TO authenticated
USING (bucket_id='app-files' AND owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true))
WITH CHECK (bucket_id='app-files' AND owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true));
ALTER POLICY auth_delete ON storage.objects TO authenticated
USING (bucket_id='app-files' AND owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true));
-- Permissive policies combine with OR. A sibling/future permissive policy must
-- not reopen this bucket; restrictive guards leave every other bucket alone.
CREATE POLICY app_files_scope_select_guard ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated USING (bucket_id<>'app-files' OR private.app_file_can_access(id,name,false));
CREATE POLICY app_files_scope_insert_guard ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (bucket_id<>'app-files' OR (owner=(SELECT auth.uid()) AND private.app_file_can_access(NULL,name,true)));
CREATE POLICY app_files_scope_update_guard ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (bucket_id<>'app-files' OR (owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true)))
WITH CHECK (bucket_id<>'app-files' OR (owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true)));
CREATE POLICY app_files_scope_delete_guard ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated USING (bucket_id<>'app-files' OR (owner=(SELECT auth.uid()) AND private.app_file_can_access(id,name,true)));
NOTIFY pgrst, 'reload schema';
COMMIT;
