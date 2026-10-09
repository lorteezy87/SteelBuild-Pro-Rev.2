-- UNINSTALLED SOURCE CANDIDATE. Not a release migration or ledger payload.
-- Additive only: no Storage policy, object, legacy reference or evidence edits.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE SCHEMA steelbuild_storage;
REVOKE ALL ON SCHEMA steelbuild_storage FROM PUBLIC,anon,authenticated,service_role;
-- Global/schema default grants are explicitly revoked below after creation.
-- Do not change shared defaults, which may belong to the sibling application.
ALTER TABLE public.projects ADD CONSTRAINT projects_file_binding_identity UNIQUE(id,org_id);
CREATE TABLE steelbuild_storage.object_bindings (
  bucket_id text NOT NULL DEFAULT 'app-files' CHECK(bucket_id='app-files'),
  object_path text NOT NULL,
  binding_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK(scope_kind='project'),
  project_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  workflow text NOT NULL CHECK(workflow IN ('drawings','documents','photo','ocr','model3d','import','attachment')),
  extension text NOT NULL CHECK(extension ~ '^[a-z0-9]{1,12}$'),
  write_role_floor text NOT NULL CHECK(write_role_floor IN ('field','pm')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(bucket_id,object_path),
  UNIQUE(actor_id,request_id),
  FOREIGN KEY(project_id,org_id) REFERENCES public.projects(id,org_id) ON DELETE CASCADE,
  CHECK(workflow NOT IN ('drawings','model3d') OR write_role_floor='pm'),
  CHECK(object_path=org_id::text||'/uploads/'||project_id::text||'/'||binding_id::text||'.'||extension)
);
ALTER TABLE steelbuild_storage.object_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_storage.object_bindings FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX object_bindings_project ON steelbuild_storage.object_bindings(project_id);

-- Future reviewed adoption may raise a floor, never lower it or rewrite a
-- reservation. Ordinary application callers have no direct table privileges.
-- FK anonymization on Auth erasure preserves receipts and does not touch bytes.
CREATE FUNCTION steelbuild_storage.guard_object_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF pg_trigger_depth()>1 AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.actor_id)
    AND to_jsonb(NEW)-'actor_id'=to_jsonb(OLD)-'actor_id' THEN RETURN NEW; END IF;
  IF to_jsonb(NEW)-'write_role_floor' IS DISTINCT FROM to_jsonb(OLD)-'write_role_floor'
    OR (OLD.write_role_floor='pm' AND NEW.write_role_floor<>'pm') THEN
    RAISE EXCEPTION 'FILE_BINDING_IMMUTABLE: Reservation identity and write floor cannot be weakened' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION steelbuild_storage.guard_object_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER object_binding_immutable BEFORE UPDATE ON steelbuild_storage.object_bindings
FOR EACH ROW EXECUTE FUNCTION steelbuild_storage.guard_object_binding();

CREATE FUNCTION steelbuild_storage.assert_reservation_access(p_actor uuid,p_org uuid,p_project uuid,p_floor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM (SELECT auth.uid())
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor)
    OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND org_id=p_org AND NOT coalesce(is_deleted,false))
    OR NOT coalesce(public.user_is_org_member(p_org),false)
    OR NOT coalesce(public.user_has_project_access(p_project),false)
    OR p_floor NOT IN ('field','pm')
    OR NOT coalesce(public.user_has_project_role_at_least(p_project,p_floor),false) THEN
    RAISE EXCEPTION 'FILE_RESERVATION_NOT_AUTHORIZED: Current workspace and project write access are required' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'FILE_RESERVATION_MFA_REQUIRED: Complete multi-factor authentication' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION steelbuild_storage.assert_reservation_access(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_app_file_upload(p_request_id uuid,p_scope jsonb,p_workflow text,p_extension text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=(SELECT auth.uid());
  v_org uuid; v_project uuid; v_floor text; v_binding uuid;
  v_existing steelbuild_storage.object_bindings%ROWTYPE;
  v_allowed text[];
BEGIN
  -- A post-lock read cannot refresh a pinned REPEATABLE READ snapshot. Normal
  -- PostgREST uses READ COMMITTED; require the same contract for all callers.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'FILE_RESERVATION_ISOLATION: Retry in READ COMMITTED' USING ERRCODE='40001';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_scope) IS DISTINCT FROM 'object'
    OR p_scope->>'kind' IS DISTINCT FROM 'project'
    OR NOT p_scope ?& ARRAY['kind','orgId','projectId']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_scope) k WHERE k<>ALL(ARRAY['kind','orgId','projectId']))
    OR jsonb_typeof(p_scope->'orgId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_scope->'projectId') IS DISTINCT FROM 'string'
    OR (p_scope->>'orgId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_scope->>'projectId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'FILE_RESERVATION_INVALID: An exact project/workspace scope is required' USING ERRCODE='22023';
  END IF;
  v_org:=(p_scope->>'orgId')::uuid; v_project:=(p_scope->>'projectId')::uuid;
  -- Require a named profile; the client default fallback is deliberately not a
  -- reservation workflow. These allowlists match current explicit producers.
  v_allowed:=CASE p_workflow
    WHEN 'drawings' THEN ARRAY['pdf']
    WHEN 'model3d' THEN ARRAY['ifc','ifczip','ifcxml']
    WHEN 'photo' THEN ARRAY['jpg','jpeg','png','webp','heic','heif','gif','bmp','tif','tiff']
    WHEN 'ocr' THEN ARRAY['jpg','jpeg','png','webp','heic','heif','gif','bmp','tif','tiff','pdf']
    WHEN 'import' THEN ARRAY['csv','tsv','txt','xls','xlsx','xlsm','xml']
    WHEN 'attachment' THEN ARRAY['pdf','doc','docx','txt','csv','xls','xlsx','jpg','jpeg','png','webp','heic','heif','gif','bmp','tif','tiff']
    WHEN 'documents' THEN ARRAY['pdf','doc','docx','rtf','txt','md','csv','tsv','xls','xlsx','xlsm','ppt','pptx','odt','ods','odp',
      'jpg','jpeg','png','gif','webp','heic','heif','bmp','tif','tiff','svg','dwg','dxf','dwf','ifc','ifczip','ifcxml','rvt','rfa','nwd','nwc',
      'skp','step','stp','iges','igs','3dm','sat','zip','7z','rar','gz','tgz','xml','json']
    ELSE NULL END;
  IF v_allowed IS NULL OR p_extension IS NULL OR NOT p_extension=ANY(v_allowed) THEN
    RAISE EXCEPTION 'FILE_RESERVATION_INVALID: Unsupported workflow or extension' USING ERRCODE='22023';
  END IF;
  v_floor:=CASE WHEN p_workflow IN ('drawings','model3d') THEN 'pm' ELSE 'field' END;
  PERFORM steelbuild_storage.assert_reservation_access(v_actor,v_org,v_project,v_floor);

  -- Serialize the actor/request before parent rows: conflicting retries from
  -- different workspaces cannot take those workspace locks in reverse order.
  PERFORM pg_advisory_xact_lock(hashtextextended('steelbuild.app-file-request:'||v_actor::text||':'||p_request_id::text,0));
  PERFORM 1 FROM public.organizations WHERE id=v_org FOR SHARE;
  PERFORM 1 FROM public.projects WHERE id=v_project AND org_id=v_org FOR SHARE;
  PERFORM 1 FROM auth.users WHERE id=v_actor FOR KEY SHARE;
  PERFORM steelbuild_storage.assert_reservation_access(v_actor,v_org,v_project,v_floor);

  SELECT * INTO v_existing FROM steelbuild_storage.object_bindings
    WHERE actor_id=v_actor AND request_id=p_request_id FOR UPDATE;
  -- A future adoption can hold this row while raising the required role floor.
  -- All authorization checks must run after that wait, including on retries.
  PERFORM steelbuild_storage.assert_reservation_access(v_actor,v_org,v_project,v_floor);
  IF v_existing.binding_id IS NOT NULL THEN
    IF (v_existing.org_id,v_existing.project_id,v_existing.scope_kind,v_existing.workflow,v_existing.extension)
      IS DISTINCT FROM (v_org,v_project,'project'::text,p_workflow,p_extension) THEN
      RAISE EXCEPTION 'FILE_RESERVATION_CONFLICT: Request ID already belongs to another payload' USING ERRCODE='22023';
    END IF;
    PERFORM steelbuild_storage.assert_reservation_access(v_actor,v_org,v_project,v_existing.write_role_floor);
  ELSE
    v_binding:=gen_random_uuid();
    INSERT INTO steelbuild_storage.object_bindings(bucket_id,object_path,binding_id,org_id,scope_kind,project_id,actor_id,request_id,workflow,extension,write_role_floor)
    VALUES('app-files',v_org::text||'/uploads/'||v_project::text||'/'||v_binding::text||'.'||p_extension,
      v_binding,v_org,'project',v_project,v_actor,p_request_id,p_workflow,p_extension,v_floor)
    RETURNING * INTO v_existing;
    -- FK waits are covered too. Any changed authority rolls this new receipt back.
    PERFORM steelbuild_storage.assert_reservation_access(v_actor,v_org,v_project,v_floor);
  END IF;
  RETURN jsonb_build_object('request_id',p_request_id,'bucket',v_existing.bucket_id,'path',v_existing.object_path);
END $$;
REVOKE ALL ON FUNCTION public.reserve_app_file_upload(uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_app_file_upload(uuid,jsonb,text,text) TO authenticated;
COMMIT;
