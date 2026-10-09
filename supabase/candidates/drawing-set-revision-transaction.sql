-- UNINSTALLED SOURCE CANDIDATE. No migration/ledger or client cutover authority.
-- Requires the committed exact-revision manifest; quarantine SQL stays untouched.
BEGIN;
CREATE SCHEMA steelbuild_drawing_revision;
REVOKE ALL ON SCHEMA steelbuild_drawing_revision FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE steelbuild_drawing_revision.requests (
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.drawing_sets(id) ON DELETE CASCADE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,request_id)
);
ALTER TABLE steelbuild_drawing_revision.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX drawing_revision_requests_project ON steelbuild_drawing_revision.requests(project_id);
CREATE INDEX drawing_revision_requests_set ON steelbuild_drawing_revision.requests(set_id);

CREATE FUNCTION steelbuild_drawing_revision.assert_access(p_project uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.org_id INTO v_org FROM public.projects p
    WHERE p.id=p_project AND NOT coalesce(p.is_deleted,false) AND p.deleted_at IS NULL;
  IF auth.uid() IS NULL OR v_org IS NULL
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org)
    OR NOT coalesce(public.user_is_org_member(v_org),false)
    OR NOT coalesce(public.user_has_project_access(p_project),false)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project,'pm'),false)
    OR NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_NOT_AUTHORIZED: Current workspace, project PM access and MFA are required' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.assert_access(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION steelbuild_drawing_revision.source_token(p_object storage.objects) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('id',p_object.id,'version',p_object.version,
    'updated_at',p_object.updated_at,'e_tag',p_object.metadata->>'eTag')::text,'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.source_token(storage.objects) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_drawing_revision_sources(p_project_id uuid,p_paths text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_org uuid; v_result jsonb;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_ISOLATION: READ COMMITTED is required' USING ERRCODE='40001'; END IF;
  v_org:=steelbuild_drawing_revision.assert_access(p_project_id);
  IF coalesce(cardinality(p_paths),0) NOT BETWEEN 1 AND 250
    OR cardinality(p_paths)<>(SELECT count(DISTINCT x) FROM unnest(p_paths) x)
    OR EXISTS(SELECT 1 FROM unnest(p_paths) x WHERE x IS NULL OR length(x)>512 OR
      x !~ ('^'||v_org::text||'/uploads/'||p_project_id::text||'/[A-Za-z0-9._-]+[.]pdf$') OR x LIKE '%..%') THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_SCOPE: Exact project upload PDF paths are required' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('path',o.name,'token',steelbuild_drawing_revision.source_token(o)) ORDER BY o.name)
    INTO v_result FROM storage.objects o WHERE o.bucket_id='app-files' AND o.name=ANY(p_paths);
  IF coalesce(jsonb_array_length(v_result),0)<>cardinality(p_paths) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_MISSING: A source object is unavailable' USING ERRCODE='22023'; END IF;
  IF steelbuild_drawing_revision.assert_access(p_project_id) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Project workspace changed during source read' USING ERRCODE='40001'; END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_drawing_revision_sources(uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_revision_sources(uuid,text[]) TO authenticated;

CREATE FUNCTION public.apply_drawing_set_revision(p_request_id uuid,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_org uuid; v_project uuid; v_set_id uuid; v_hash text;
  v_set public.drawing_sets; v_sheet public.drawings; v_current public.drawing_revisions;
  v_receipt steelbuild_drawing_revision.requests; v_object storage.objects;
  v_zone public.drawing_zones; v_link public.drawing_links; v_edge public.drawing_zone_dependencies;
  v_roster jsonb; v_entry jsonb; v_sources jsonb; v_expected jsonb; v_history jsonb;
  v_paths text[]; v_roster_ids uuid[]; v_sheet_ids uuid[];
  v_changed_revisions uuid[]:='{}'; v_removed_revisions uuid[]:='{}';
  v_zone_ids uuid[]:='{}'; v_revision_map jsonb:='{}'; v_zone_map jsonb:='{}';
  v_new uuid; v_old uuid; v_version integer; v_action text; v_code text; v_page integer;
  v_result jsonb; v_source_pages jsonb:='[]'; v_revised integer:=0; v_added integer:=0; v_removed integer:=0;
  v_zones integer:=0; v_links integer:=0; v_edges integer:=0; v_count integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_ISOLATION: READ COMMITTED is required' USING ERRCODE='40001'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR octet_length(p_request::text)>1048576
    OR NOT p_request ?& ARRAY['project_id','set_id','expected_set_updated_at','expected_set_revision','revision_label','issued_date','file_path','source_objects','sheets']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k<>ALL(ARRAY['project_id','set_id','expected_set_updated_at','expected_set_revision','revision_label','issued_date','issued_by','notes','file_path','source_objects','sheets'])) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Exact bounded reviewed request is required' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['project_id','set_id','expected_set_updated_at','revision_label','issued_date','file_path']) k
      WHERE jsonb_typeof(p_request->k) IS DISTINCT FROM 'string')
    OR jsonb_typeof(p_request->'expected_set_revision') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Header fields must use their exact JSON types' USING ERRCODE='22023'; END IF;
  v_project:=(p_request->>'project_id')::uuid; v_set_id:=(p_request->>'set_id')::uuid;
  v_org:=steelbuild_drawing_revision.assert_access(v_project);
  v_roster:=p_request->'sheets'; v_sources:=p_request->'source_objects';
  IF jsonb_typeof(v_roster) IS DISTINCT FROM 'array' OR jsonb_typeof(v_sources) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Reviewed roster and source snapshots must be arrays' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v_roster) NOT BETWEEN 1 AND 250 OR jsonb_array_length(v_sources) NOT BETWEEN 1 AND 250
    OR nullif(btrim(p_request->>'revision_label'),'') IS NULL OR length(p_request->>'revision_label')>80
    OR nullif(p_request->>'expected_set_updated_at','') IS NULL OR nullif(p_request->>'issued_date','') IS NULL
    OR (p_request->>'issued_date') !~ '^\d{4}-\d{2}-\d{2}$'
    OR (p_request ? 'issued_by' AND jsonb_typeof(p_request->'issued_by') NOT IN ('string','null'))
    OR (p_request ? 'notes' AND jsonb_typeof(p_request->'notes') NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Complete bounded header and roster are required' USING ERRCODE='22023'; END IF;
  PERFORM (p_request->>'issued_date')::date;
  v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  -- Only this wait occurs before row locks. All subsequent explicit locks use
  -- NOWAIT, avoiding parent/child inversions with account/project erasure.
  PERFORM pg_advisory_xact_lock(hashtextextended('drawing-set-revision:'||v_actor::text||':'||p_request_id::text,0));
  v_org:=steelbuild_drawing_revision.assert_access(v_project);
  PERFORM id FROM public.organizations WHERE id=v_org FOR SHARE NOWAIT;
  PERFORM id FROM public.projects WHERE id=v_project AND org_id=v_org FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAWING_REVISION_STALE: Project workspace changed during review' USING ERRCODE='40001'; END IF;
  PERFORM id FROM auth.users WHERE id=v_actor FOR KEY SHARE NOWAIT;
  SELECT * INTO v_set FROM public.drawing_sets WHERE id=v_set_id AND project_id=v_project FOR UPDATE NOWAIT;
  IF v_set.id IS NULL OR v_set.is_deleted OR v_set.deleted_at IS NOT NULL OR coalesce(v_set.is_locked,false) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SET_UNAVAILABLE: Active unlocked set required' USING ERRCODE='40001'; END IF;
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  SELECT * INTO v_receipt FROM steelbuild_drawing_revision.requests WHERE actor_id=v_actor AND request_id=p_request_id;
  IF v_receipt.request_id IS NOT NULL THEN
    IF (v_receipt.project_id,v_receipt.set_id,v_receipt.payload_sha256) IS DISTINCT FROM (v_project,v_set_id,v_hash) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_REQUEST_CONFLICT: Request key already used for different content' USING ERRCODE='22023'; END IF;
    PERFORM steelbuild_drawing_revision.assert_access(v_project);
    RETURN v_receipt.result;
  END IF;
  IF v_set.updated_at IS DISTINCT FROM (p_request->>'expected_set_updated_at')::timestamptz
    OR v_set.revision IS DISTINCT FROM p_request->>'expected_set_revision'
    OR upper(btrim(coalesce(v_set.revision,'')))=upper(btrim(p_request->>'revision_label')) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Set changed since review' USING ERRCODE='40001'; END IF;
  v_history:=coalesce(nullif(btrim(v_set.revision_history),''),'[]')::jsonb;
  IF jsonb_typeof(v_history)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_history) h
    WHERE upper(btrim(h->>'revisionLabel'))=upper(btrim(p_request->>'revision_label'))) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Malformed history or reused set revision label' USING ERRCODE='22023'; END IF;

  -- Lock archived parent rows too: restoration without a changed FK must not
  -- introduce an unreviewed active sheet during this transaction.
  IF (SELECT count(*) FROM public.drawings WHERE drawing_set_id=v_set_id)>1000 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_LIMIT: Set history exceeds the tested transaction bound' USING ERRCODE='54000'; END IF;
  PERFORM d.id FROM public.drawings d WHERE d.drawing_set_id=v_set_id ORDER BY d.id FOR UPDATE NOWAIT;
  IF EXISTS(SELECT 1 FROM public.drawings WHERE drawing_set_id=v_set_id AND project_id<>v_project)
    OR EXISTS(SELECT 1 FROM public.drawings WHERE project_id=v_project AND drawing_set_id IS NULL
      AND drawing_set_name=v_set.set_name AND NOT is_deleted AND deleted_at IS NULL AND NOT coalesce(is_superseded,false)) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Foreign or legacy name-only set routing requires reconciliation' USING ERRCODE='40001'; END IF;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_sheet_ids FROM public.drawings WHERE drawing_set_id=v_set_id;
  IF (SELECT count(*) FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheet_ids))>10000 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_LIMIT: Revision history exceeds the tested transaction bound' USING ERRCODE='54000'; END IF;
  PERFORM r.id FROM public.drawing_revisions r WHERE r.drawing_id=ANY(v_sheet_ids) ORDER BY r.id FOR UPDATE NOWAIT;
  IF EXISTS(SELECT 1 FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheet_ids) AND project_id<>v_project) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Revision project mismatch' USING ERRCODE='40001'; END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_roster) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
      OR NOT v_entry ?& ARRAY['action','sheet_number']
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k<>ALL(ARRAY['action','drawing_id','expected_updated_at','expected_revision_id','sheet_number','sheet_title','revision_code','file_path','pdf_page','reviewed','discipline','extracted_text','callouts']))
      OR v_entry->>'action' NOT IN ('same','revised','added','removed')
      OR jsonb_typeof(v_entry->'action') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'sheet_number') IS DISTINCT FROM 'string'
      OR nullif(btrim(v_entry->>'sheet_number'),'') IS NULL OR length(v_entry->>'sheet_number')>120 THEN
      RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Explicit valid sheet action and identity required' USING ERRCODE='22023'; END IF;
    v_action:=v_entry->>'action';
    IF v_action='added' THEN
      IF v_entry ?| ARRAY['drawing_id','expected_updated_at','expected_revision_id'] THEN
        RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Added sheet cannot identify existing history' USING ERRCODE='22023'; END IF;
    ELSE
      IF NOT v_entry ?& ARRAY['drawing_id','expected_updated_at','expected_revision_id'] OR
        jsonb_typeof(v_entry->'drawing_id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'expected_updated_at') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_entry->'expected_revision_id') NOT IN ('string','null') OR
        nullif(v_entry->>'drawing_id','') IS NULL OR nullif(v_entry->>'expected_updated_at','') IS NULL THEN
        RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Expected sheet and current revision versions required' USING ERRCODE='22023'; END IF;
      SELECT * INTO v_sheet FROM public.drawings WHERE id=(v_entry->>'drawing_id')::uuid AND project_id=v_project AND drawing_set_id=v_set_id
        AND NOT is_deleted AND deleted_at IS NULL AND NOT coalesce(is_superseded,false);
      SELECT * INTO v_current FROM public.drawing_revisions WHERE drawing_id=v_sheet.id AND is_current;
      IF v_sheet.id IS NULL OR v_sheet.updated_at IS DISTINCT FROM (v_entry->>'expected_updated_at')::timestamptz
        OR v_sheet.sheet_number IS DISTINCT FROM v_entry->>'sheet_number'
        OR v_current.id IS DISTINCT FROM nullif(v_entry->>'expected_revision_id','')::uuid
        OR v_current.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'DRAWING_REVISION_STALE: Sheet or current revision changed since review' USING ERRCODE='40001'; END IF;
      IF v_action IN ('revised','removed') AND v_current.id IS NULL THEN
        RAISE EXCEPTION 'DRAWING_REVISION_TRACKING_REQUIRED: Complete explicit tracking before changing existing sheets' USING ERRCODE='22023'; END IF;
      IF v_action='revised' THEN v_changed_revisions:=array_append(v_changed_revisions,v_current.id); END IF;
      IF v_action='removed' THEN v_removed_revisions:=array_append(v_removed_revisions,v_current.id); END IF;
    END IF;
    IF v_action IN ('revised','added') AND (
      v_entry->'reviewed' IS DISTINCT FROM 'true'::jsonb OR nullif(btrim(v_entry->>'sheet_title'),'') IS NULL OR length(v_entry->>'sheet_title')>500
      OR jsonb_typeof(v_entry->'sheet_title') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'revision_code') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_entry->'file_path') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'pdf_page') IS DISTINCT FROM 'number'
      OR nullif(btrim(v_entry->>'revision_code'),'') IS NULL OR length(v_entry->>'revision_code')>80
      OR coalesce(v_entry->>'pdf_page','') !~ '^[1-9][0-9]{0,5}$' OR nullif(v_entry->>'file_path','') IS NULL
      OR (v_entry ? 'extracted_text' AND jsonb_typeof(v_entry->'extracted_text')<>'string')
      OR (v_entry ? 'discipline' AND jsonb_typeof(v_entry->'discipline') NOT IN ('string','null'))
      OR (v_entry ? 'callouts' AND jsonb_typeof(v_entry->'callouts')<>'array')) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Changed sheet needs reviewed code, title and source page' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT coalesce(array_agg((e->>'drawing_id')::uuid ORDER BY (e->>'drawing_id')::uuid),'{}') INTO v_roster_ids
    FROM jsonb_array_elements(v_roster) e WHERE e->>'action'<>'added';
  IF v_roster_ids IS DISTINCT FROM (SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM public.drawings WHERE drawing_set_id=v_set_id AND NOT is_deleted AND deleted_at IS NULL AND NOT coalesce(is_superseded,false))
    OR (SELECT count(DISTINCT upper(btrim(e->>'sheet_number'))) FROM jsonb_array_elements(v_roster) e)<>jsonb_array_length(v_roster) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Reviewed roster must contain every active sheet exactly once' USING ERRCODE='40001'; END IF;

  SELECT array_agg(DISTINCT p ORDER BY p) INTO v_paths FROM (
    SELECT p_request->>'file_path' p UNION SELECT e->>'file_path' FROM jsonb_array_elements(v_roster)e WHERE e->>'action' IN ('revised','added')) q;
  IF cardinality(v_paths)>250 OR EXISTS(SELECT 1 FROM unnest(v_paths) p WHERE p IS NULL OR length(p)>512 OR
    p !~ ('^'||v_org::text||'/uploads/'||v_project::text||'/[A-Za-z0-9._-]+[.]pdf$') OR p LIKE '%..%')
    OR (SELECT array_agg(e->>'path' ORDER BY e->>'path') FROM jsonb_array_elements(v_sources)e) IS DISTINCT FROM v_paths
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_sources)e WHERE jsonb_typeof(e)<>'object' OR NOT e ?& ARRAY['path','token']
      OR (SELECT count(*) FROM jsonb_object_keys(e))<>2 OR coalesce(e->>'token','') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_SCOPE: Exact project source snapshots must cover the request' USING ERRCODE='22023'; END IF;
  PERFORM o.id FROM storage.objects o WHERE o.bucket_id='app-files' AND o.name=ANY(v_paths) ORDER BY o.name,o.id FOR SHARE NOWAIT;
  FOR v_expected IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
    SELECT * INTO v_object FROM storage.objects WHERE bucket_id='app-files' AND name=v_expected->>'path';
    IF v_object.id IS NULL OR steelbuild_drawing_revision.source_token(v_object) IS DISTINCT FROM v_expected->>'token' THEN
      RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_CHANGED: Source metadata changed since review; review it again' USING ERRCODE='40001'; END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.drawing_zones WHERE drawing_revision_id=ANY(v_changed_revisions||v_removed_revisions))>1000 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_LIMIT: Zone count exceeds the tested bound' USING ERRCODE='54000'; END IF;
  PERFORM z.id FROM public.drawing_zones z WHERE z.drawing_revision_id=ANY(v_changed_revisions||v_removed_revisions) ORDER BY z.id FOR UPDATE NOWAIT;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_zone_ids FROM public.drawing_zones
    WHERE drawing_revision_id=ANY(v_changed_revisions||v_removed_revisions);
  IF EXISTS(SELECT 1 FROM public.drawing_zones z JOIN public.drawing_revisions r ON r.id=z.drawing_revision_id
    WHERE z.id=ANY(v_zone_ids) AND (z.project_id<>v_project OR z.drawing_id<>r.drawing_id)) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_TOPOLOGY: Foreign zone routing requires reconciliation' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.drawing_links WHERE drawing_zone_id=ANY(v_zone_ids))>2000
    OR (SELECT count(*) FROM public.drawing_zone_dependencies WHERE source_zone_id=ANY(v_zone_ids) OR target_zone_id=ANY(v_zone_ids))>2000 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_LIMIT: Coordination count exceeds the tested bound' USING ERRCODE='54000'; END IF;
  PERFORM l.id FROM public.drawing_links l WHERE l.drawing_zone_id=ANY(v_zone_ids) ORDER BY l.id FOR UPDATE NOWAIT;
  PERFORM e.id FROM public.drawing_zone_dependencies e WHERE e.source_zone_id=ANY(v_zone_ids) OR e.target_zone_id=ANY(v_zone_ids) ORDER BY e.id FOR UPDATE NOWAIT;
  -- Only fully known active same-sheet edges can be carried. Removed sheets,
  -- inactive endpoints and cross-sheet edges require a separate reviewed plan.
  IF EXISTS(SELECT 1 FROM public.drawing_zone_dependencies e
    LEFT JOIN public.drawing_zones a ON a.id=e.source_zone_id LEFT JOIN public.drawing_zones b ON b.id=e.target_zone_id
    WHERE e.removed_at IS NULL AND (e.source_zone_id=ANY(v_zone_ids) OR e.target_zone_id=ANY(v_zone_ids)) AND
      (e.project_id<>v_project OR a.project_id<>v_project OR b.project_id<>v_project OR a.drawing_id<>b.drawing_id
       OR NOT a.drawing_revision_id=ANY(v_changed_revisions) OR NOT b.drawing_revision_id=ANY(v_changed_revisions)
       OR NOT a.is_active OR NOT b.is_active OR a.deleted_at IS NOT NULL OR b.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_TOPOLOGY: Dependency endpoints cannot be carried exactly' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.drawing_links l JOIN public.drawing_zones z ON z.id=l.drawing_zone_id WHERE l.drawing_zone_id=ANY(v_zone_ids) AND l.removed_at IS NULL
    AND (l.project_id<>v_project OR l.drawing_id<>z.drawing_id OR l.drawing_revision_id<>z.drawing_revision_id
      OR NOT z.is_active OR z.deleted_at IS NOT NULL OR z.drawing_revision_id=ANY(v_removed_revisions))) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_TOPOLOGY: Active link cannot be carried exactly' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.drawing_holds WHERE drawing_id=ANY(v_sheet_ids))>1000 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_LIMIT: Hold history exceeds the tested bound' USING ERRCODE='54000'; END IF;
  PERFORM id FROM public.drawing_holds WHERE drawing_id=ANY(v_sheet_ids) ORDER BY id FOR UPDATE NOWAIT;
  IF EXISTS(SELECT 1 FROM public.drawing_holds h JOIN public.drawing_revisions r ON r.drawing_id=h.drawing_id WHERE r.id=ANY(v_removed_revisions) AND h.is_active) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_HOLD: Resolve the active hold before removing a sheet' USING ERRCODE='22023'; END IF;
  PERFORM steelbuild_drawing_revision.assert_access(v_project);

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_roster) LOOP
    v_action:=v_entry->>'action'; IF v_action='same' THEN CONTINUE; END IF;
    IF v_action='added' THEN
      IF EXISTS(SELECT 1 FROM public.drawings WHERE drawing_set_id=v_set_id AND NOT is_deleted AND deleted_at IS NULL
        AND upper(btrim(sheet_number))=upper(btrim(v_entry->>'sheet_number'))) THEN
        RAISE EXCEPTION 'DRAWING_REVISION_DUPLICATE: Sheet mark already exists' USING ERRCODE='23505'; END IF;
      INSERT INTO public.drawings(project_id,drawing_set_id,drawing_set_name,sheet_number,title,discipline,revision_number,file_url,pdf_page,stage,set_approval_status)
      VALUES(v_project,v_set_id,v_set.set_name,btrim(v_entry->>'sheet_number'),btrim(v_entry->>'sheet_title'),coalesce(v_entry->>'discipline',v_set.discipline),
        btrim(v_entry->>'revision_code'),v_entry->>'file_path',(v_entry->>'pdf_page')::integer,'Not Started','pending_review') RETURNING * INTO v_sheet;
      v_old:=NULL; v_version:=1; v_added:=v_added+1;
    ELSE
      SELECT * INTO v_sheet FROM public.drawings WHERE id=(v_entry->>'drawing_id')::uuid;
      SELECT * INTO v_current FROM public.drawing_revisions WHERE drawing_id=v_sheet.id AND is_current;
      v_old:=v_current.id;
      SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.drawing_revisions WHERE drawing_id=v_sheet.id;
      -- Preserve every source attribute, including incomplete legacy fields.
      UPDATE public.drawing_revisions SET is_current=false,archived_at=clock_timestamp(),updated_by=v_actor WHERE id=v_old;
      IF v_action='removed' THEN
        UPDATE public.drawings SET is_superseded=true,updated_at=clock_timestamp() WHERE id=v_sheet.id;
        v_removed:=v_removed+1; CONTINUE;
      END IF;
      v_revised:=v_revised+1;
    END IF;
    v_code:=btrim(v_entry->>'revision_code'); v_page:=(v_entry->>'pdf_page')::integer;
    IF EXISTS(SELECT 1 FROM public.drawing_revisions WHERE drawing_id=v_sheet.id AND upper(btrim(revision_code))=upper(v_code)) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_DUPLICATE: Existing revision code cannot replace a historical source' USING ERRCODE='23505'; END IF;
    INSERT INTO public.drawing_revisions(project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,is_current,supersedes_revision_id,file_url,pdf_page,issued_at,revision_notes,release_status,created_by)
      VALUES(v_project,v_sheet.id,v_code,v_sheet.sheet_number,btrim(v_entry->>'sheet_title'),v_version,true,v_old,v_entry->>'file_path',v_page,
        (p_request->>'issued_date')::date,p_request->>'notes','received',v_actor) RETURNING id INTO v_new;
    IF v_old IS NOT NULL THEN v_revision_map:=v_revision_map||jsonb_build_object(v_old::text,v_new); END IF;
    UPDATE public.drawings SET title=btrim(v_entry->>'sheet_title'),revision_number=v_code,file_url=v_entry->>'file_path',pdf_page=v_page,
      extracted_text=CASE WHEN v_entry ? 'extracted_text' THEN v_entry->>'extracted_text' ELSE extracted_text END,
      callouts=CASE WHEN v_entry ? 'callouts' THEN v_entry->'callouts' ELSE callouts END,
      stage='Not Started',set_approval_status='pending_review',set_approved_date=NULL,ifc_status=NULL,updated_at=clock_timestamp() WHERE id=v_sheet.id;
    v_source_pages:=v_source_pages||jsonb_build_array(jsonb_build_object('drawing_id',v_sheet.id,'revision_id',v_new,'file_path',v_entry->>'file_path','pdf_page',v_page));
  END LOOP;

  FOR v_zone IN SELECT * FROM public.drawing_zones WHERE drawing_revision_id=ANY(v_changed_revisions) AND is_active AND deleted_at IS NULL ORDER BY id LOOP
    v_new:=gen_random_uuid(); v_zone_map:=v_zone_map||jsonb_build_object(v_zone.id::text,v_new);
    INSERT INTO public.drawing_zones(id,project_id,drawing_id,drawing_revision_id,parent_zone_id,zone_key,label,description,zone_type,shape_type,x_min,y_min,x_max,y_max,polygon_points,level_ref,grid_ref,detail_ref,discipline_code,sequence_ref,sort_order,status,status_reason,is_manual_status_override,source_kind,is_active,created_by)
    VALUES(v_new,v_project,v_zone.drawing_id,(v_revision_map->>v_zone.drawing_revision_id::text)::uuid,v_zone.id,v_zone.zone_key,v_zone.label,v_zone.description,v_zone.zone_type,v_zone.shape_type,
      v_zone.x_min,v_zone.y_min,v_zone.x_max,v_zone.y_max,v_zone.polygon_points,v_zone.level_ref,v_zone.grid_ref,v_zone.detail_ref,v_zone.discipline_code,v_zone.sequence_ref,v_zone.sort_order,'neutral',NULL,false,'manual',true,v_actor);
    v_zones:=v_zones+1;
  END LOOP;
  FOR v_link IN SELECT * FROM public.drawing_links WHERE drawing_zone_id=ANY(v_zone_ids) AND removed_at IS NULL ORDER BY id LOOP
    IF NOT v_zone_map ? v_link.drawing_zone_id::text THEN CONTINUE; END IF;
    INSERT INTO public.drawing_links(project_id,drawing_id,drawing_revision_id,drawing_zone_id,linked_record_type,linked_record_id,link_role,link_source,confidence_score,is_confirmed,metadata,created_by)
    VALUES(v_project,v_link.drawing_id,(v_revision_map->>v_link.drawing_revision_id::text)::uuid,(v_zone_map->>v_link.drawing_zone_id::text)::uuid,
      v_link.linked_record_type,v_link.linked_record_id,v_link.link_role,'inherited',v_link.confidence_score,v_link.is_confirmed,
      v_link.metadata||jsonb_build_object('inherited_from_link_id',v_link.id,'inherited_from_revision_id',v_link.drawing_revision_id),v_actor);
    v_links:=v_links+1;
  END LOOP;
  FOR v_edge IN SELECT * FROM public.drawing_zone_dependencies WHERE (source_zone_id=ANY(v_zone_ids) OR target_zone_id=ANY(v_zone_ids)) AND removed_at IS NULL ORDER BY id LOOP
    INSERT INTO public.drawing_zone_dependencies(project_id,source_zone_id,target_zone_id,relationship,note,propagation_weight,metadata,created_by)
    VALUES(v_project,(v_zone_map->>v_edge.source_zone_id::text)::uuid,(v_zone_map->>v_edge.target_zone_id::text)::uuid,v_edge.relationship,v_edge.note,v_edge.propagation_weight,
      v_edge.metadata||jsonb_build_object('inherited_from_dependency_id',v_edge.id),v_actor);
    v_edges:=v_edges+1;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.drawings WHERE drawing_set_id=v_set_id AND NOT is_deleted AND deleted_at IS NULL AND NOT coalesce(is_superseded,false);
  IF v_count=0 OR v_revised+v_added+v_removed=0 THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: A revision needs a change and at least one active sheet' USING ERRCODE='22023'; END IF;
  v_history:=v_history||jsonb_build_array(jsonb_build_object('revisionLabel',v_set.revision,'fileUrl',v_set.file_url,'issueDate',v_set.issued_date,
    'issuedBy',v_set.issued_by,'sheetCount',v_set.sheet_count,'notes',v_set.notes,'approvalStatus',v_set.set_approval_status,
    'approvedDate',v_set.set_approved_date,'approvedBy',v_set.set_approved_by,'recordedAt',clock_timestamp(),'status','superseded'));
  UPDATE public.drawing_sets SET revision=btrim(p_request->>'revision_label'),issued_date=(p_request->>'issued_date')::date,
    issued_by=coalesce(p_request->>'issued_by',issued_by),notes=coalesce(p_request->>'notes',notes),file_url=p_request->>'file_path',
    revision_history=v_history::text,sheet_count=v_count,set_approval_status='pending_review',set_approved_date=NULL,set_approved_by=NULL,
    set_approval_notes=NULL,updated_at=clock_timestamp() WHERE id=v_set_id;
  -- Governing submittal pointers and all historical approval/round records remain.
  -- The exact-revision coverage gate invalidates their relevance to the new source.
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  v_result:=jsonb_build_object('applied',true,'request_id',p_request_id,'project_id',v_project,'set_id',v_set_id,
    'revised',v_revised,'added',v_added,'removed',v_removed,'sheet_count',v_count,
    'zones_cloned',v_zones,'links_cloned',v_links,'dependencies_cloned',v_edges,'source_pages',v_source_pages);
  INSERT INTO steelbuild_drawing_revision.requests(actor_id,request_id,project_id,set_id,payload_sha256,result)
    VALUES(v_actor,p_request_id,v_project,v_set_id,v_hash,v_result);
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  RETURN v_result;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'DRAWING_REVISION_BUSY: Concurrent work is changing these records; retry the same request' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION public.apply_drawing_set_revision(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_drawing_set_revision(uuid,jsonb) TO authenticated;
COMMIT;
