-- MANUAL REVIEW ONLY. No tool in this repository applies this file.
-- Required session bindings are supplied by the authorized operator from reviewed evidence.
-- project_ref is a target assertion, not proof of connection origin.
BEGIN;
DO $install_preconditions$
DECLARE prereqs jsonb; p jsonb; actual text;
BEGIN
  IF current_setting('drawing_cutover.project_ref',true) IS NULL OR current_setting('drawing_cutover.project_ref',true) !~ '^[a-z]{20}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_source_commit',true),'') !~ '^[a-f0-9]{40}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_classification_sha256',true),'') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CUTOVER_REVIEW_BINDINGS_REQUIRED'; END IF;
  prereqs:=current_setting('drawing_cutover.expected_prerequisites',true)::jsonb;
  IF jsonb_typeof(prereqs) IS DISTINCT FROM 'array' OR jsonb_array_length(prereqs)=0 THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITES_REQUIRED'; END IF;
  IF jsonb_array_length(prereqs) <> 8 OR (SELECT array_agg(DISTINCT value->>'identity' ORDER BY value->>'identity') FROM jsonb_array_elements(prereqs)) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['public.user_is_org_member(uuid)','public.user_has_project_access(uuid)','public.user_has_project_role_at_least(uuid, text)','steelbuild_security.satisfies_mfa()','public.get_submittal_revision_coverage(uuid)','public.evaluate_fab_release_set(uuid, uuid)','steelbuild_workflow.has_round_context(uuid)','steelbuild_workflow.guard_captured_revision()']) x) THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITE_ROSTER'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(prereqs) LOOP
    IF coalesce(p->>'sha256','') !~ '^[a-f0-9]{64}$' OR nullif(p->>'identity','') IS NULL THEN RAISE EXCEPTION 'CUTOVER_INVALID_PREREQUISITE'; END IF;
    SELECT encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(p->>'identity')),'UTF8')),'hex') INTO actual;
    IF actual IS DISTINCT FROM p->>'sha256' THEN RAISE EXCEPTION 'CUTOVER_PREREQUISITE_MISMATCH: %',p->>'identity'; END IF;
  END LOOP;
END $install_preconditions$;

DO $install_component$
DECLARE payload text := $cutover_payload_0$-- UNINSTALLED SOURCE CANDIDATE. No migration/ledger or client cutover authority.
-- Requires the committed exact-revision manifest; quarantine SQL stays untouched.
-- Transaction control belongs to the reviewed whole-package manual wrapper.
CREATE SCHEMA steelbuild_drawing_revision;
REVOKE ALL ON SCHEMA steelbuild_drawing_revision FROM PUBLIC,anon,authenticated,service_role;
-- Transaction-local authority is private state, never a caller-controlled GUC.
CREATE TABLE steelbuild_drawing_revision.command_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id bigint NOT NULL,backend_pid integer NOT NULL,
  actor_id uuid NOT NULL,project_id uuid NOT NULL,set_id uuid NOT NULL,operation text NOT NULL
    CHECK(operation IN ('create_set','revise_set','publish','hold','lock','archive','approval_sync')),
  UNIQUE(transaction_id,backend_pid,set_id)
);
ALTER TABLE steelbuild_drawing_revision.command_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.command_context FROM PUBLIC,anon,authenticated,service_role;
-- Only one exact guarded row transition is live while its DML executes. Hashes
-- retain SQL NULL versus JSON null and keep private authority fixed-size.
CREATE TABLE steelbuild_drawing_revision.write_intents (
  context_id uuid PRIMARY KEY REFERENCES steelbuild_drawing_revision.command_context(id) ON DELETE CASCADE,
  relation_id oid NOT NULL,row_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE')),
  old_sha256 text,new_sha256 text NOT NULL,consumed boolean NOT NULL DEFAULT false
);
ALTER TABLE steelbuild_drawing_revision.write_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.write_intents FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION steelbuild_drawing_revision.write_row(p_context uuid,p_table regclass,p_operation text,p_patch jsonb,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET datestyle='ISO, YMD' SET lock_timeout='2s' AS $$
DECLARE c steelbuild_drawing_revision.command_context;v_projection text;v_columns text;v_expected text;v_old text;v_actual text;
  v_row jsonb;v_id uuid;v_project uuid;v_set uuid;v_count integer;
BEGIN
  SELECT * INTO c FROM steelbuild_drawing_revision.command_context WHERE id=p_context
    AND transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND actor_id=auth.uid();
  IF c.id IS NULL OR p_table NOT IN ('public.drawings'::regclass,'public.drawing_sets'::regclass,'public.drawing_revisions'::regclass,'public.drawing_holds'::regclass)
    OR p_operation NOT IN ('INSERT','UPDATE') OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR octet_length(p_patch::text)>1048576 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Invalid private write intent' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND NOT attisdropped)>256
    OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=p_table AND attnum>0 AND (attgenerated<>'' OR attidentity<>''))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=p_table AND attname=k AND attnum>0 AND NOT attisdropped)) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Unsupported row shape' USING ERRCODE='54000'; END IF;
  -- The existing server timestamp trigger uses now(). Source/lifecycle fields
  -- receive no exception. INSERT defaults are evaluated once, before arming.
  IF p_operation='UPDATE' AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=p_table AND NOT t.tgisinternal
    AND t.tgenabled='O' AND t.tgfoid='public.update_updated_at()'::regprocedure) THEN
    p_patch:=p_patch||jsonb_build_object('updated_at',now()); END IF;
  SELECT string_agg(format('%I',a.attname),',' ORDER BY a.attnum),
    string_agg(CASE WHEN p_patch ? a.attname THEN format('(jsonb_populate_record(NULL::%s,$1)).%I',p_table,a.attname)
      WHEN p_operation='UPDATE' THEN format('t.%I',a.attname)
      ELSE coalesce(pg_get_expr(d.adbin,d.adrelid),'NULL') END,',' ORDER BY a.attnum)
    INTO v_columns,v_projection FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=p_table AND a.attnum>0 AND NOT a.attisdropped;
  IF p_operation='UPDATE' THEN
    EXECUTE format('select t::text,ROW(%s)::%s::text from %s t where id=$2',v_projection,p_table,p_table) INTO v_old,v_expected USING p_patch,p_id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Expected row missing' USING ERRCODE='40001'; END IF;
  ELSE EXECUTE format('select ROW(%s)::%s::text',v_projection,p_table) INTO v_expected USING p_patch; END IF;
  EXECUTE format('select to_jsonb($1::%s)',p_table) INTO v_row USING v_expected;
  v_id:=(v_row->>'id')::uuid;v_project:=(v_row->>'project_id')::uuid;
  IF p_table='public.drawing_sets'::regclass THEN v_set:=v_id;
  ELSIF p_table='public.drawings'::regclass THEN v_set:=(v_row->>'drawing_set_id')::uuid;
  ELSE SELECT drawing_set_id INTO v_set FROM public.drawings WHERE id=(v_row->>'drawing_id')::uuid AND project_id=v_project; END IF;
  IF (v_project,v_set) IS DISTINCT FROM (c.project_id,c.set_id) OR (p_operation='UPDATE' AND v_id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Row outside admitted command' USING ERRCODE='42501'; END IF;
  INSERT INTO steelbuild_drawing_revision.write_intents(context_id,relation_id,row_id,operation,old_sha256,new_sha256) VALUES(c.id,p_table,v_id,p_operation,
    encode(sha256(convert_to(v_old,'UTF8')),'hex'),encode(sha256(convert_to(v_expected,'UTF8')),'hex'));
  IF p_operation='INSERT' THEN
    EXECUTE format('insert into %s(%s) select ($1::%s).*',p_table,v_columns,p_table) USING v_expected;
  ELSE
    SELECT string_agg(format('%I=($1::%s).%I',a.attname,p_table,a.attname),',' ORDER BY a.attnum) INTO v_projection
      FROM pg_attribute a WHERE a.attrelid=p_table AND a.attnum>0 AND NOT a.attisdropped AND p_patch ? a.attname;
    EXECUTE format('update %s set %s where id=$2',p_table,v_projection) USING v_expected,p_id;
  END IF;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  EXECUTE format('select t::text,to_jsonb(t) from %s t where id=$1',p_table) INTO v_actual,v_row USING v_id;
  IF v_count<>1 OR v_actual IS DISTINCT FROM v_expected OR NOT EXISTS(SELECT 1 FROM steelbuild_drawing_revision.write_intents WHERE context_id=c.id AND consumed) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Admitted row was not written exactly' USING ERRCODE='42501'; END IF;
  DELETE FROM steelbuild_drawing_revision.write_intents WHERE context_id=c.id;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.write_row(uuid,regclass,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_drawing_command_capabilities(p_project_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('contract_version',1,'new_set',false,'revision',false,
    'write_boundary',false,'source_protection',false,'receipt_lookup',false)
$$;
REVOKE ALL ON FUNCTION public.get_drawing_command_capabilities(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_command_capabilities(uuid) TO authenticated;
CREATE TABLE steelbuild_drawing_revision.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('create_set','revise_set')),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.drawing_sets(id) ON DELETE CASCADE,
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,request_id), UNIQUE(id,project_id,set_id)
);
ALTER TABLE steelbuild_drawing_revision.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX drawing_revision_requests_project ON steelbuild_drawing_revision.requests(project_id);
CREATE INDEX drawing_revision_requests_set ON steelbuild_drawing_revision.requests(set_id);

-- Observed parent values are retained as observations, never attributed to an
-- uncertain historic revision. No public read surface or export claim is added.
CREATE TABLE steelbuild_drawing_revision.source_observations (
  receipt_id uuid NOT NULL, drawing_id uuid NOT NULL, project_id uuid NOT NULL, drawing_set_id uuid NOT NULL,
  parent_file_url text, parent_pdf_page integer, parent_revision_number text, parent_updated_at timestamptz,
  observed_current_revision_id uuid, observed_current_revision_version integer,
  extracted_text text, callouts jsonb,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(receipt_id,drawing_id),
  FOREIGN KEY(receipt_id,project_id,drawing_set_id) REFERENCES steelbuild_drawing_revision.requests(id,project_id,set_id) ON DELETE CASCADE,
  FOREIGN KEY(drawing_id,drawing_set_id,project_id) REFERENCES public.drawings(id,drawing_set_id,project_id) ON DELETE CASCADE,
  CHECK(coalesce(octet_length(extracted_text),0)<=65536),
  CHECK(coalesce(octet_length(callouts::text),0)<=65536)
);
ALTER TABLE steelbuild_drawing_revision.source_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.source_observations FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX drawing_source_observations_drawing ON steelbuild_drawing_revision.source_observations(drawing_id);
COMMENT ON COLUMN steelbuild_drawing_revision.source_observations.observed_current_revision_id IS
  'Pointer observed with the parent; this does not prove that its extraction belongs to this revision.';

CREATE FUNCTION steelbuild_drawing_revision.observe_source(p_parent public.drawings,p_current public.drawing_revisions) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT jsonb_build_object('drawing_id',p_parent.id,'project_id',p_parent.project_id,'drawing_set_id',p_parent.drawing_set_id,
    'parent_file_url',p_parent.file_url,'parent_pdf_page',p_parent.pdf_page,'parent_revision_number',p_parent.revision_number,
    'parent_updated_at',p_parent.updated_at,'observed_current_revision_id',p_current.id,'observed_current_revision_version',p_current.version_number,
    'extracted_text',p_parent.extracted_text,'callouts',p_parent.callouts,'callouts_is_sql_null',p_parent.callouts IS NULL)
$$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.observe_source(public.drawings,public.drawing_revisions) FROM PUBLIC,anon,authenticated,service_role;

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

-- Receipt lookup takes the same non-waiting transaction lock as both writers.
-- A free lock plus an absent receipt is the only evidence for not_committed.
CREATE FUNCTION public.get_drawing_command_receipt(p_request_id uuid,p_operation text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE v_project uuid; v_org uuid; v_hash text; v_receipt steelbuild_drawing_revision.requests; v_locked boolean;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_ISOLATION: READ COMMITTED is required' USING ERRCODE='40001'; END IF;
  IF p_request_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create_set','revise_set')
    OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>1048576
    OR jsonb_typeof(p_request->'project_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Bounded command identity required' USING ERRCODE='22023'; END IF;
  v_project:=(p_request->>'project_id')::uuid;
  v_org:=steelbuild_drawing_revision.assert_access(v_project);
  v_hash:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'request',p_request)::text,'UTF8')),'hex');
  v_locked:=pg_try_advisory_xact_lock(hashtextextended('drawing-command:'||auth.uid()::text||':'||p_request_id::text,0));
  IF steelbuild_drawing_revision.assert_access(v_project) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Project workspace changed' USING ERRCODE='40001'; END IF;
  IF NOT v_locked THEN RETURN jsonb_build_object('state','pending'); END IF;
  SELECT * INTO v_receipt FROM steelbuild_drawing_revision.requests WHERE actor_id=auth.uid() AND request_id=p_request_id;
  IF v_receipt.request_id IS NOT NULL AND
    (v_receipt.operation,v_receipt.project_id,v_receipt.payload_sha256) IS DISTINCT FROM (p_operation,v_project,v_hash) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_REQUEST_CONFLICT: Request key already used for different content' USING ERRCODE='22023'; END IF;
  IF steelbuild_drawing_revision.assert_access(v_project) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_REVISION_STALE: Project workspace changed' USING ERRCODE='40001'; END IF;
  IF v_receipt.request_id IS NOT NULL THEN RETURN jsonb_build_object('state','committed','result',v_receipt.result); END IF;
  RETURN jsonb_build_object('state','not_committed');
END $$;
REVOKE ALL ON FUNCTION public.get_drawing_command_receipt(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_command_receipt(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION steelbuild_drawing_revision.apply_command(p_request_id uuid,p_operation text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_org uuid; v_project uuid; v_set_id uuid; v_hash text; v_context uuid;
  v_set public.drawing_sets; v_sheet public.drawings; v_current public.drawing_revisions;
  v_receipt jsonb; v_object storage.objects; v_create boolean:=p_operation='create_set';
  v_required text[]; v_allowed text[];
  v_zone public.drawing_zones; v_link public.drawing_links; v_edge public.drawing_zone_dependencies;
  v_roster jsonb; v_entry jsonb; v_sources jsonb; v_expected jsonb; v_history jsonb;
  v_paths text[]; v_roster_ids uuid[]; v_sheet_ids uuid[];
  v_changed_revisions uuid[]:='{}'; v_removed_revisions uuid[]:='{}';
  v_zone_ids uuid[]:='{}'; v_revision_map jsonb:='{}'; v_zone_map jsonb:='{}';
  v_observations jsonb:='[]'; v_observation jsonb; v_observation_bytes integer:=2; v_receipt_id uuid;
  v_field text; v_extraction jsonb; v_extracted_text text; v_callouts jsonb;
  v_new uuid; v_old uuid; v_version integer; v_action text; v_code text; v_page integer;
  v_result jsonb; v_source_pages jsonb:='[]'; v_revised integer:=0; v_added integer:=0; v_removed integer:=0;
  v_zones integer:=0; v_links integer:=0; v_edges integer:=0; v_count integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_ISOLATION: READ COMMITTED is required' USING ERRCODE='40001'; END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('create_set','revise_set') THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Unknown operation' USING ERRCODE='22023'; END IF;
  v_required:=CASE WHEN v_create THEN ARRAY['project_id','set_name','set_number','revision_label','discipline','issued_date','issued_by','notes','file_path','source_objects','sheets']
    ELSE ARRAY['project_id','set_id','expected_set_updated_at','expected_set_revision','revision_label','issued_date','file_path','source_objects','sheets'] END;
  v_allowed:=v_required||ARRAY['issued_by','notes'];
  IF p_request_id IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR octet_length(p_request::text)>1048576
    OR NOT p_request ?& v_required
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k<>ALL(v_allowed)) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Exact bounded reviewed request is required' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(CASE WHEN v_create THEN ARRAY['project_id','set_name','revision_label','file_path']
      ELSE ARRAY['project_id','set_id','expected_set_updated_at','revision_label','issued_date','file_path'] END) k
      WHERE jsonb_typeof(p_request->k) IS DISTINCT FROM 'string')
    OR (NOT v_create AND jsonb_typeof(p_request->'expected_set_revision') NOT IN ('string','null'))
    OR (v_create AND EXISTS(SELECT 1 FROM unnest(ARRAY['set_number','discipline','issued_date','issued_by','notes']) k WHERE jsonb_typeof(p_request->k) NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Header fields must use their exact JSON types' USING ERRCODE='22023'; END IF;
  v_project:=(p_request->>'project_id')::uuid; v_set_id:=CASE WHEN v_create THEN gen_random_uuid() ELSE (p_request->>'set_id')::uuid END;
  v_org:=steelbuild_drawing_revision.assert_access(v_project);
  v_roster:=p_request->'sheets'; v_sources:=p_request->'source_objects';
  IF jsonb_typeof(v_roster) IS DISTINCT FROM 'array' OR jsonb_typeof(v_sources) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Reviewed roster and source snapshots must be arrays' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v_roster) NOT BETWEEN 1 AND 250 OR jsonb_array_length(v_sources) NOT BETWEEN 1 AND 250
    OR nullif(btrim(p_request->>'revision_label'),'') IS NULL OR length(p_request->>'revision_label')>80
    OR (NOT v_create AND (nullif(p_request->>'expected_set_updated_at','') IS NULL OR nullif(p_request->>'issued_date','') IS NULL))
    OR ((p_request->>'issued_date') IS NOT NULL AND (p_request->>'issued_date') !~ '^\d{4}-\d{2}-\d{2}$')
    OR (v_create AND (nullif(btrim(p_request->>'set_name'),'') IS NULL OR length(p_request->>'set_name')>500 OR length(p_request->>'set_number')>120))
    OR (p_request ? 'issued_by' AND jsonb_typeof(p_request->'issued_by') NOT IN ('string','null'))
    OR (p_request ? 'notes' AND jsonb_typeof(p_request->'notes') NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Complete bounded header and roster are required' USING ERRCODE='22023'; END IF;
  PERFORM (p_request->>'issued_date')::date;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'request',p_request)::text,'UTF8')),'hex');
  v_receipt:=public.get_drawing_command_receipt(p_request_id,p_operation,p_request);
  IF v_receipt->>'state'='pending' THEN
    RAISE EXCEPTION 'DRAWING_REVISION_BUSY: Command is in progress; retry the same request' USING ERRCODE='55P03'; END IF;
  IF v_receipt->>'state'='committed' THEN RETURN v_receipt->'result'; END IF;
  v_org:=steelbuild_drawing_revision.assert_access(v_project);
  PERFORM id FROM public.organizations WHERE id=v_org FOR SHARE NOWAIT;
  PERFORM id FROM public.projects WHERE id=v_project AND org_id=v_org FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAWING_REVISION_STALE: Project workspace changed during review' USING ERRCODE='40001'; END IF;
  PERFORM id FROM auth.users WHERE id=v_actor FOR KEY SHARE NOWAIT;
  IF v_create THEN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('drawing-set-name:'||v_project::text||':'||upper(btrim(p_request->>'set_name')),0)) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_BUSY: Set name is being used; retry the same request' USING ERRCODE='55P03'; END IF;
    IF EXISTS(SELECT 1 FROM public.drawing_sets WHERE project_id=v_project AND upper(btrim(set_name))=upper(btrim(p_request->>'set_name')))
      OR EXISTS(SELECT 1 FROM public.drawings WHERE project_id=v_project AND drawing_set_id IS NULL AND upper(btrim(drawing_set_name))=upper(btrim(p_request->>'set_name'))) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_DUPLICATE: Set name is already used, including archived history' USING ERRCODE='23505'; END IF;
    v_set.id:=v_set_id;v_set.project_id:=v_project;v_set.set_name:=btrim(p_request->>'set_name');v_set.discipline:=p_request->>'discipline';
    v_sheet_ids:='{}';v_history:='[]';
  ELSE
  SELECT * INTO v_set FROM public.drawing_sets WHERE id=v_set_id AND project_id=v_project FOR UPDATE NOWAIT;
  IF v_set.id IS NULL OR v_set.is_deleted OR v_set.deleted_at IS NOT NULL OR coalesce(v_set.is_locked,false) THEN
    RAISE EXCEPTION 'DRAWING_REVISION_SET_UNAVAILABLE: Active unlocked set required' USING ERRCODE='40001'; END IF;
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
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
  END IF;
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_roster) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
      OR NOT v_entry ?& ARRAY['action','sheet_number']
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k<>ALL(ARRAY['action','drawing_id','expected_updated_at','expected_revision_id','sheet_number','sheet_title','revision_code','file_path','pdf_page','reviewed','discipline','extraction']))
      OR v_entry->>'action' NOT IN ('same','revised','added','removed') OR (v_create AND v_entry->>'action'<>'added')
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
      IF v_action IN ('revised','removed') THEN
        IF coalesce(octet_length(v_sheet.extracted_text),0)>65536 OR coalesce(octet_length(v_sheet.callouts::text),0)>65536 THEN
          RAISE EXCEPTION 'DRAWING_REVISION_OBSERVATION_LIMIT: Prior extraction exceeds the per-field retention bound; nothing was changed' USING ERRCODE='54000'; END IF;
        v_observation:=steelbuild_drawing_revision.observe_source(v_sheet,v_current);
        v_observation_bytes:=v_observation_bytes+octet_length(v_observation::text)+CASE WHEN jsonb_array_length(v_observations)>0 THEN 2 ELSE 0 END;
        IF v_observation_bytes>4194304 THEN
          RAISE EXCEPTION 'DRAWING_REVISION_OBSERVATION_LIMIT: Prior source observations exceed the transaction retention bound; nothing was changed' USING ERRCODE='54000'; END IF;
        v_observations:=v_observations||jsonb_build_array(v_observation);
      END IF;
    END IF;
    IF v_action IN ('revised','added') AND (
      v_entry->'reviewed' IS DISTINCT FROM 'true'::jsonb OR nullif(btrim(v_entry->>'sheet_title'),'') IS NULL OR length(v_entry->>'sheet_title')>500
      OR jsonb_typeof(v_entry->'sheet_title') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'revision_code') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_entry->'file_path') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'pdf_page') IS DISTINCT FROM 'number'
      OR nullif(btrim(v_entry->>'revision_code'),'') IS NULL OR length(v_entry->>'revision_code')>80
      OR coalesce(v_entry->>'pdf_page','') !~ '^[1-9][0-9]{0,5}$' OR nullif(v_entry->>'file_path','') IS NULL
      OR (v_entry ? 'discipline' AND jsonb_typeof(v_entry->'discipline') NOT IN ('string','null'))
      ) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_INVALID: Changed sheet needs reviewed code, title and source page' USING ERRCODE='22023'; END IF;
    IF v_action IN ('revised','added') THEN
      IF jsonb_typeof(v_entry->'extraction') IS DISTINCT FROM 'object' OR NOT (v_entry->'extraction') ?& ARRAY['text','callouts']
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry->'extraction') k WHERE k NOT IN ('text','callouts')) THEN
        RAISE EXCEPTION 'DRAWING_REVISION_EXTRACTION: Explicit source-bound text and callout states are required' USING ERRCODE='22023'; END IF;
      FOREACH v_field IN ARRAY ARRAY['text','callouts'] LOOP
        v_extraction:=v_entry->'extraction'->v_field;
        IF jsonb_typeof(v_extraction) IS DISTINCT FROM 'object' OR coalesce(v_extraction->>'state','') NOT IN ('harvested','unavailable')
          OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_extraction) k WHERE k NOT IN ('state','value'))
          OR (v_extraction->>'state'='unavailable' AND v_extraction ? 'value')
          OR (v_extraction->>'state'='harvested' AND (
            jsonb_typeof(v_extraction->'value') IS DISTINCT FROM CASE WHEN v_field='text' THEN 'string' ELSE 'array' END
            OR CASE WHEN v_field='text' THEN octet_length(v_extraction->>'value') ELSE octet_length((v_extraction->'value')::text) END>65536)) THEN
          RAISE EXCEPTION 'DRAWING_REVISION_EXTRACTION: Harvested fields require bounded exact values; unavailable fields have no value' USING ERRCODE='22023'; END IF;
      END LOOP;
    END IF;
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
  PERFORM o.id FROM storage.objects o WHERE o.bucket_id='app-files' AND o.name=ANY(v_paths) ORDER BY o.name,o.id FOR UPDATE NOWAIT;
  FOR v_expected IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
    SELECT * INTO v_object FROM storage.objects WHERE bucket_id='app-files' AND name=v_expected->>'path';
    IF v_object.id IS NULL OR steelbuild_drawing_revision.source_token(v_object) IS DISTINCT FROM v_expected->>'token' THEN
      RAISE EXCEPTION 'DRAWING_REVISION_SOURCE_CHANGED: Source metadata changed since review; review it again' USING ERRCODE='40001'; END IF;
  END LOOP;

  PERFORM steelbuild_drawing_revision.adopt_sources(v_project,v_paths);

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

  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),v_actor,v_project,v_set_id,p_operation) RETURNING id INTO v_context;
  IF v_create THEN
    PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_sets','INSERT',jsonb_build_object(
      'id',v_set_id,'project_id',v_project,'set_name',v_set.set_name,'discipline',v_set.discipline,'revision',btrim(p_request->>'revision_label'),
      'issued_date',(p_request->>'issued_date')::date,'issued_by',p_request->>'issued_by','notes',p_request->>'notes','file_url',p_request->>'file_path',
      'revision_history','[]','metadata',CASE WHEN nullif(btrim(p_request->>'set_number'),'') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('drawing_set_number',btrim(p_request->>'set_number')) END,
      'set_approval_status','pending_review'));
    PERFORM steelbuild_drawing_revision.assert_access(v_project);
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_roster) LOOP
    v_action:=v_entry->>'action'; IF v_action='same' THEN CONTINUE; END IF;
    v_extracted_text:=CASE WHEN v_entry->'extraction'->'text'->>'state'='harvested' THEN v_entry->'extraction'->'text'->>'value' ELSE NULL END;
    v_callouts:=CASE WHEN v_entry->'extraction'->'callouts'->>'state'='harvested' THEN v_entry->'extraction'->'callouts'->'value' ELSE NULL END;
    IF v_action='added' THEN
      IF EXISTS(SELECT 1 FROM public.drawings WHERE drawing_set_id=v_set_id AND NOT is_deleted AND deleted_at IS NULL
        AND upper(btrim(sheet_number))=upper(btrim(v_entry->>'sheet_number'))) THEN
        RAISE EXCEPTION 'DRAWING_REVISION_DUPLICATE: Sheet mark already exists' USING ERRCODE='23505'; END IF;
      SELECT * INTO v_sheet FROM jsonb_populate_record(NULL::public.drawings,steelbuild_drawing_revision.write_row(v_context,'public.drawings','INSERT',jsonb_build_object(
        'project_id',v_project,'drawing_set_id',v_set_id,'drawing_set_name',v_set.set_name,'sheet_number',btrim(v_entry->>'sheet_number'),'title',btrim(v_entry->>'sheet_title'),
        'discipline',coalesce(v_entry->>'discipline',v_set.discipline),'revision_number',btrim(v_entry->>'revision_code'),'file_url',v_entry->>'file_path',
        'pdf_page',(v_entry->>'pdf_page')::integer,'stage','Not Started','set_approval_status','pending_review','extracted_text',v_extracted_text,'callouts',v_callouts,'hyperlinks',NULL)));
      v_old:=NULL; v_version:=1; v_added:=v_added+1;
    ELSE
      SELECT * INTO v_sheet FROM public.drawings WHERE id=(v_entry->>'drawing_id')::uuid;
      SELECT * INTO v_current FROM public.drawing_revisions WHERE drawing_id=v_sheet.id AND is_current;
      v_old:=v_current.id;
      SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.drawing_revisions WHERE drawing_id=v_sheet.id;
      -- Preserve every source attribute, including incomplete legacy fields.
      PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_revisions','UPDATE',
        jsonb_build_object('is_current',false,'archived_at',clock_timestamp(),'updated_by',v_actor),v_old);
      IF v_action='removed' THEN
        PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawings','UPDATE',jsonb_build_object('is_superseded',true,'updated_at',clock_timestamp()),v_sheet.id);
        v_removed:=v_removed+1; CONTINUE;
      END IF;
      v_revised:=v_revised+1;
    END IF;
    v_code:=btrim(v_entry->>'revision_code'); v_page:=(v_entry->>'pdf_page')::integer;
    IF EXISTS(SELECT 1 FROM public.drawing_revisions WHERE drawing_id=v_sheet.id AND upper(btrim(revision_code))=upper(v_code)) THEN
      RAISE EXCEPTION 'DRAWING_REVISION_DUPLICATE: Existing revision code cannot replace a historical source' USING ERRCODE='23505'; END IF;
    v_new:=(steelbuild_drawing_revision.write_row(v_context,'public.drawing_revisions','INSERT',jsonb_build_object(
      'project_id',v_project,'drawing_id',v_sheet.id,'revision_code',v_code,'sheet_number',v_sheet.sheet_number,'sheet_title',btrim(v_entry->>'sheet_title'),
      'version_number',v_version,'is_current',true,'supersedes_revision_id',v_old,'file_url',v_entry->>'file_path','pdf_page',v_page,
      'issued_at',(p_request->>'issued_date')::date,'revision_notes',p_request->>'notes','release_status','received','created_by',v_actor))->>'id')::uuid;
    IF v_old IS NOT NULL THEN v_revision_map:=v_revision_map||jsonb_build_object(v_old::text,v_new); END IF;
    PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawings','UPDATE',jsonb_build_object(
      'title',btrim(v_entry->>'sheet_title'),'revision_number',v_code,'file_url',v_entry->>'file_path','pdf_page',v_page,
      'extracted_text',v_extracted_text,'callouts',v_callouts,'hyperlinks',NULL,'stage','Not Started','set_approval_status','pending_review',
      'set_approved_date',NULL,'ifc_status',NULL,'markup_scale',NULL,'scale_status',NULL,'updated_at',clock_timestamp()),v_sheet.id);
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
  IF NOT v_create THEN
  v_history:=v_history||jsonb_build_array(jsonb_build_object('revisionLabel',v_set.revision,'fileUrl',v_set.file_url,'issueDate',v_set.issued_date,
    'issuedBy',v_set.issued_by,'sheetCount',v_set.sheet_count,'notes',v_set.notes,'approvalStatus',v_set.set_approval_status,
    'approvedDate',v_set.set_approved_date,'approvedBy',v_set.set_approved_by,'recordedAt',clock_timestamp(),'status','superseded'));
  END IF;
  PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_sets','UPDATE',jsonb_build_object(
    'revision',btrim(p_request->>'revision_label'),'issued_date',(p_request->>'issued_date')::date,'issued_by',coalesce(p_request->>'issued_by',v_set.issued_by),
    'notes',coalesce(p_request->>'notes',v_set.notes),'file_url',p_request->>'file_path','revision_history',v_history::text,'sheet_count',v_count,
    'set_approval_status','pending_review','set_approved_date',NULL,'set_approved_by',NULL,'set_approval_notes',NULL,'updated_at',clock_timestamp()),v_set_id);
  -- Governing submittal pointers and all historical approval/round records remain.
  -- The exact-revision coverage gate invalidates their relevance to the new source.
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  v_result:=jsonb_build_object('applied',true,'contract_version',1,'operation',p_operation,'payload_sha256',v_hash,'request_id',p_request_id,'project_id',v_project,'set_id',v_set_id,
    'revised',v_revised,'added',v_added,'removed',v_removed,'sheet_count',v_count,
    'zones_cloned',v_zones,'links_cloned',v_links,'dependencies_cloned',v_edges,'source_pages',v_source_pages);
  INSERT INTO steelbuild_drawing_revision.requests(actor_id,request_id,operation,project_id,set_id,payload_sha256,result)
    VALUES(v_actor,p_request_id,p_operation,v_project,v_set_id,v_hash,v_result) RETURNING id INTO v_receipt_id;
  INSERT INTO steelbuild_drawing_revision.source_observations(receipt_id,drawing_id,project_id,drawing_set_id,
    parent_file_url,parent_pdf_page,parent_revision_number,parent_updated_at,observed_current_revision_id,observed_current_revision_version,extracted_text,callouts)
    SELECT v_receipt_id,o.drawing_id,o.project_id,o.drawing_set_id,o.parent_file_url,o.parent_pdf_page,o.parent_revision_number,
      o.parent_updated_at,o.observed_current_revision_id,o.observed_current_revision_version,o.extracted_text,
      CASE WHEN o.callouts_is_sql_null THEN NULL ELSE coalesce(o.callouts,'null'::jsonb) END
    FROM jsonb_to_recordset(v_observations) AS o(drawing_id uuid,project_id uuid,drawing_set_id uuid,parent_file_url text,parent_pdf_page integer,
      parent_revision_number text,parent_updated_at timestamptz,observed_current_revision_id uuid,observed_current_revision_version integer,extracted_text text,callouts jsonb,callouts_is_sql_null boolean);
  -- Receipt/observation triggers carry no source authority. Still verify the
  -- complete admitted source result after those phases before returning success.
  IF NOT EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=v_set_id AND project_id=v_project AND NOT is_deleted AND deleted_at IS NULL
      AND file_url=p_request->>'file_path' AND revision=btrim(p_request->>'revision_label') AND set_approval_status='pending_review')
    OR EXISTS(SELECT 1 FROM jsonb_to_recordset(v_source_pages) p(drawing_id uuid,revision_id uuid,file_path text,pdf_page integer)
    LEFT JOIN public.drawings d ON d.id=p.drawing_id LEFT JOIN public.drawing_revisions r ON r.id=p.revision_id
    WHERE (d.project_id,d.drawing_set_id,d.file_url,d.pdf_page,r.project_id,r.drawing_id,r.file_url,r.pdf_page,r.is_current,r.release_status)
      IS DISTINCT FROM (v_project,v_set_id,p.file_path,p.pdf_page,v_project,p.drawing_id,p.file_path,p.pdf_page,true,'received'::text)
      OR d.is_deleted OR d.deleted_at IS NOT NULL OR coalesce(d.is_superseded,false) OR r.archived_at IS NOT NULL
      OR (d.revision_number,d.sheet_number) IS DISTINCT FROM (r.revision_code,r.sheet_number)) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_TRANSITION: Final source result changed' USING ERRCODE='42501'; END IF;
  PERFORM steelbuild_drawing_revision.assert_access(v_project);
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN v_result;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'DRAWING_REVISION_BUSY: Concurrent work is changing these records; retry the same request' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.apply_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.apply_drawing_set_revision(p_request_id uuid,p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
  SELECT steelbuild_drawing_revision.apply_command(p_request_id,'revise_set',p_request)
$$;
REVOKE ALL ON FUNCTION public.apply_drawing_set_revision(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Installed disabled: only a separate exact catalog/classification review may grant EXECUTE.
CREATE FUNCTION public.create_drawing_set_from_review(p_request_id uuid,p_request jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
  SELECT steelbuild_drawing_revision.apply_command(p_request_id,'create_set',p_request)
$$;
REVOKE ALL ON FUNCTION public.create_drawing_set_from_review(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Installed disabled: receipt/source reads remain available during review.
$cutover_payload_0$;
BEGIN
  IF encode(sha256(convert_to(payload,'UTF8')),'hex') <> '05e6fd8f5fe3cd32c7cbd1797f543d9eaeb786068db04f3077ac2d6f36032adf' THEN RAISE EXCEPTION 'CUTOVER_PAYLOAD_HASH'; END IF;
  EXECUTE payload;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261016061756','drawing_reviewed_atomic_commands',ARRAY[payload]);
END $install_component$;

DO $install_component$
DECLARE payload text := $cutover_payload_1$-- UNINSTALLED SOURCE CANDIDATE. Install after drawing-set-revision-transaction.sql.
-- Ordinary-role metadata protection only: Storage API/byte acceptance and the
-- privileged-writer review remain release gates. No historic source backfill.
-- Transaction control belongs to the reviewed whole-package manual wrapper.
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
$cutover_payload_1$;
BEGIN
  IF encode(sha256(convert_to(payload,'UTF8')),'hex') <> '515a9252a76642f9eea51968498cc6fc6f5faf617eda637f28bd3e0d57b32435' THEN RAISE EXCEPTION 'CUTOVER_PAYLOAD_HASH'; END IF;
  EXECUTE payload;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261016061808','drawing_adopted_source_protection',ARRAY[payload]);
END $install_component$;

DO $install_component$
DECLARE payload text := $cutover_payload_2$-- UNINSTALLED SOURCE CANDIDATE. Third ordered component, after atomic commands
-- and adopted-source protection. An empty review manifest deliberately leaves
-- capabilities false. No customer backfill, ledger stamp or hosted authority.
-- Transaction control belongs to the reviewed whole-package manual wrapper.

-- Holds created before this contract remain unbound. Releasing one cannot
-- restore any revision's distribution status by guessing its former target.
CREATE TABLE steelbuild_drawing_revision.hold_bindings (
  hold_id uuid PRIMARY KEY REFERENCES public.drawing_holds(id) ON DELETE CASCADE,
  drawing_revision_id uuid NOT NULL REFERENCES public.drawing_revisions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  file_url text NOT NULL,pdf_page integer NOT NULL,revision_code text NOT NULL,
  prior_release_status text NOT NULL
);
ALTER TABLE steelbuild_drawing_revision.hold_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.hold_bindings FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX drawing_hold_binding_revision ON steelbuild_drawing_revision.hold_bindings(drawing_revision_id);
CREATE INDEX drawing_hold_binding_project ON steelbuild_drawing_revision.hold_bindings(project_id);
CREATE INDEX drawing_hold_binding_drawing ON steelbuild_drawing_revision.hold_bindings(drawing_id);

-- Existing whole-project archival also owns legacy sheets without a set.
-- This private context grants only project-scoped tombstones/count maintenance,
-- never source, identity, approval or arbitrary lifecycle writes.
CREATE TABLE steelbuild_drawing_revision.project_archive_context (
  transaction_id bigint NOT NULL,backend_pid integer NOT NULL,actor_id uuid NOT NULL,project_id uuid NOT NULL,
  set_ids uuid[] NOT NULL CHECK(cardinality(set_ids)<=1000),sheet_ids uuid[] NOT NULL CHECK(cardinality(sheet_ids)<=1000),
  PRIMARY KEY(transaction_id,backend_pid,project_id)
);
ALTER TABLE steelbuild_drawing_revision.project_archive_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.project_archive_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION steelbuild_drawing_revision.assert_role(p_project uuid,p_role text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_ISOLATION: READ COMMITTED required' USING ERRCODE='40001'; END IF;
  SELECT org_id INTO v_org FROM public.projects WHERE id=p_project AND NOT coalesce(is_deleted,false) AND deleted_at IS NULL;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org)
    OR NOT coalesce(public.user_is_org_member(v_org),false)
    OR NOT coalesce(public.user_has_project_access(p_project),false)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project,p_role),false)
    OR NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_NOT_AUTHORIZED: Current membership, role and MFA required' USING ERRCODE='42501'; END IF;
  RETURN v_org;
END $$;

-- One shared order for daily commands: organization/project/actor, submittals,
-- sets, sheets, histories, holds, signoffs, RFIs and source objects. Lock all
-- linked sets for publication because exact evidence covers the whole round.
CREATE FUNCTION steelbuild_drawing_revision.lock_set(p_set uuid,p_role text,p_publication boolean DEFAULT false,p_allow_locked boolean DEFAULT false)
RETURNS public.drawing_sets LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_set public.drawing_sets;v_org uuid;v_project uuid;v_sets uuid[];v_sheets uuid[];v_subs uuid[];v_paths text[];
BEGIN
  SELECT project_id INTO v_project FROM public.drawing_sets WHERE id=p_set;
  v_org:=steelbuild_drawing_revision.assert_role(v_project,p_role);
  PERFORM id FROM public.organizations WHERE id=v_org FOR SHARE NOWAIT;
  PERFORM id FROM public.projects WHERE id=v_project AND org_id=v_org FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRAWING_COMMAND_STALE: Project changed' USING ERRCODE='40001'; END IF;
  PERFORM id FROM auth.users WHERE id=auth.uid() FOR KEY SHARE NOWAIT;
  v_sets:=ARRAY[p_set];
  IF p_publication THEN
    IF (SELECT count(*) FROM public.submittals WHERE project_id=v_project AND p_set=ANY(drawing_set_ids))>1000 THEN
      RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Too many linked submittals' USING ERRCODE='54000'; END IF;
    SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_subs FROM public.submittals WHERE project_id=v_project AND p_set=ANY(drawing_set_ids);
    PERFORM id FROM public.submittals WHERE id=ANY(v_subs) ORDER BY id FOR UPDATE NOWAIT;
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_sets FROM (
      SELECT p_set x UNION ALL SELECT unnest(drawing_set_ids) FROM public.submittals WHERE id=ANY(v_subs)) all_sets;
  END IF;
  IF cardinality(v_sets)>1000 THEN RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Too many set parents' USING ERRCODE='54000'; END IF;
  PERFORM id FROM public.drawing_sets WHERE id=ANY(v_sets) ORDER BY id FOR UPDATE NOWAIT;
  SELECT * INTO v_set FROM public.drawing_sets WHERE id=p_set;
  IF v_set.project_id IS DISTINCT FROM v_project OR coalesce(v_set.is_deleted,false) OR v_set.deleted_at IS NOT NULL
    OR (coalesce(v_set.is_locked,false) AND NOT p_allow_locked) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_SET_UNAVAILABLE: Active unlocked set required' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=ANY(v_sets) AND project_id IS DISTINCT FROM v_project)
    OR (SELECT count(*) FROM public.drawings WHERE drawing_set_id=ANY(v_sets))>1000 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Invalid or oversized parent roster' USING ERRCODE='54000'; END IF;
  PERFORM id FROM public.drawings WHERE drawing_set_id=ANY(v_sets) ORDER BY id FOR UPDATE NOWAIT;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_sheets FROM public.drawings WHERE drawing_set_id=ANY(v_sets);
  IF (SELECT count(*) FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheets))>10000
    OR (SELECT count(*) FROM public.drawing_holds WHERE drawing_id=ANY(v_sheets))>1000 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: History or hold bound exceeded' USING ERRCODE='54000'; END IF;
  PERFORM id FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheets) ORDER BY id FOR UPDATE NOWAIT;
  PERFORM id FROM public.drawing_holds WHERE drawing_id=ANY(v_sheets) ORDER BY id FOR UPDATE NOWAIT;
  IF p_publication THEN
    IF (SELECT count(*) FROM public.drawing_signoffs WHERE drawing_id=ANY(v_sheets))>2000
      OR (SELECT count(*) FROM public.rfis WHERE project_id=v_project)>2000 THEN
      RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Release evidence bound exceeded' USING ERRCODE='54000'; END IF;
    PERFORM id FROM public.drawing_signoffs WHERE drawing_id=ANY(v_sheets) ORDER BY id FOR UPDATE NOWAIT;
    PERFORM id FROM public.rfis WHERE project_id=v_project ORDER BY id FOR UPDATE NOWAIT;
    SELECT coalesce(array_agg(DISTINCT regexp_replace(file_url,'^app-files/','')),'{}') INTO v_paths
      FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheets) AND is_current;
    IF cardinality(v_paths)>250 THEN RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Source bound exceeded' USING ERRCODE='54000'; END IF;
    PERFORM id FROM storage.objects WHERE bucket_id='app-files' AND name=ANY(v_paths) ORDER BY name,id FOR UPDATE NOWAIT;
  END IF;
  IF steelbuild_drawing_revision.assert_role(v_project,p_role) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_STALE: Workspace changed' USING ERRCODE='40001'; END IF;
  RETURN v_set;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'DRAWING_COMMAND_BUSY: Concurrent work; reload and retry' USING ERRCODE='55P03';
END $$;

CREATE FUNCTION steelbuild_drawing_revision.assert_current(p_revision uuid,p_set uuid) RETURNS public.drawing_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.drawing_revisions;d public.drawings;
BEGIN
  SELECT * INTO r FROM public.drawing_revisions WHERE id=p_revision;
  SELECT * INTO d FROM public.drawings WHERE id=r.drawing_id;
  IF r.id IS NULL OR NOT coalesce(r.is_current,false) OR r.archived_at IS NOT NULL OR r.release_status IN ('void','superseded')
    OR d.id IS NULL OR d.drawing_set_id IS DISTINCT FROM p_set OR coalesce(d.is_deleted,false) OR d.deleted_at IS NOT NULL OR coalesce(d.is_superseded,false)
    OR r.project_id IS DISTINCT FROM d.project_id
    OR NOT EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=p_set AND project_id=d.project_id)
    OR (r.file_url,r.pdf_page,r.revision_code,r.sheet_number) IS DISTINCT FROM (d.file_url,d.pdf_page,d.revision_number,d.sheet_number)
    OR nullif(btrim(r.file_url),'') IS NULL OR r.pdf_page IS NULL OR r.pdf_page<1 OR nullif(btrim(r.revision_code),'') IS NULL THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_SOURCE_MISMATCH: Active current source must match its parent' USING ERRCODE='40001'; END IF;
  RETURN r;
END $$;

CREATE FUNCTION steelbuild_drawing_revision.distribution_allowed(p_project uuid,p_set uuid,p_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_gate jsonb;
BEGIN
  IF p_status IN ('released_for_shop','released_for_field') THEN
    v_gate:=public.evaluate_fab_release_set(p_project,p_set);
    -- Distribution is the action being performed. Every other existing gate,
    -- including exact submitted revision evidence, remains mandatory.
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_gate->'blockers') b WHERE b->>'kind' IS DISTINCT FROM 'current_revision_not_distributed')
      OR jsonb_typeof(v_gate->'blockers') IS DISTINCT FROM 'array'
      OR coalesce(v_gate->>'governing_stage','') NOT IN ('IFC','Released') OR v_gate->>'submittal_id' IS NULL
      OR EXISTS(SELECT 1 FROM public.submittals s JOIN public.drawings d ON d.drawing_set_id=ANY(s.drawing_set_ids)
        JOIN public.drawing_revisions r ON r.drawing_id=d.id AND r.is_current
        WHERE s.id=(v_gate->>'submittal_id')::uuid AND NOT d.is_deleted AND d.deleted_at IS NULL
          AND (coalesce(d.is_superseded,false) OR r.archived_at IS NOT NULL OR r.release_status IN ('void','superseded')
            OR (r.project_id,r.file_url,r.pdf_page,r.revision_code,r.sheet_number)
              IS DISTINCT FROM (d.project_id,d.file_url,d.pdf_page,d.revision_number,d.sheet_number))) THEN
      RETURN false; END IF;
  END IF;
  RETURN true;
END $$;
CREATE FUNCTION steelbuild_drawing_revision.assert_distribution(p_project uuid,p_set uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT steelbuild_drawing_revision.distribution_allowed(p_project,p_set,p_status) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_APPROVAL_REQUIRED: Existing fabrication and exact-revision evidence gates must pass' USING ERRCODE='42501'; END IF;
END $$;

-- The legacy parent marker is derived only inside the established round
-- workflow. Reuse its actual governor selector and exact whole-round coverage;
-- an event's own status (including an old/non-governing approval) is not proof.
-- No evidence, engineering status, source, distribution or dates are invented.
CREATE FUNCTION steelbuild_drawing_revision.sync_governing_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_sets uuid[];v_set uuid;v_gate jsonb;v_governor public.submittals;v_approved boolean;v_context uuid;
BEGIN
  IF NOT steelbuild_workflow.has_round_context(NEW.id) THEN RETURN NEW; END IF;
  IF NEW.submittal_type IS DISTINCT FROM 'Shop Drawing' THEN RETURN NEW; END IF;
  PERFORM steelbuild_drawing_revision.assert_role(NEW.project_id,'pm');
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_sets
    FROM unnest(coalesce(OLD.drawing_set_ids,'{}')||coalesce(NEW.drawing_set_ids,'{}')) x;
  IF cardinality(v_sets)>1000 THEN RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Too many affected sets' USING ERRCODE='54000'; END IF;
  FOREACH v_set IN ARRAY v_sets LOOP
    -- Corrective rounds may have broken/foreign links; never mutate those
    -- parents, and never require good sources just to record a rejection.
    IF NOT EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=v_set AND project_id=NEW.project_id AND NOT is_deleted AND deleted_at IS NULL) THEN CONTINUE; END IF;
    v_gate:=public.evaluate_fab_release_set(NEW.project_id,v_set);
    SELECT * INTO v_governor FROM public.submittals WHERE id=(v_gate->>'submittal_id')::uuid;
    v_approved:=coalesce(v_governor.status IN ('Approved','Approved as Noted','Released for Fabrication')
      AND (public.get_submittal_revision_coverage(v_governor.id)->>'ok')::boolean,false);
    IF v_approved THEN
      -- apply_round already holds this event's sets. NOWAIT acquisition of
      -- every possible governor/linked set avoids inverted-order waits while
      -- freezing the complete governing roster and source objects.
      PERFORM steelbuild_drawing_revision.lock_set(v_set,'pm',true,true);
      v_gate:=public.evaluate_fab_release_set(NEW.project_id,v_set);
      SELECT * INTO v_governor FROM public.submittals WHERE id=(v_gate->>'submittal_id')::uuid;
      v_approved:=coalesce(v_governor.status IN ('Approved','Approved as Noted','Released for Fabrication')
        AND (public.get_submittal_revision_coverage(v_governor.id)->>'ok')::boolean,false)
        AND NOT EXISTS(SELECT 1 FROM public.drawings d JOIN public.drawing_revisions r ON r.drawing_id=d.id AND r.is_current
          WHERE d.drawing_set_id=ANY(v_governor.drawing_set_ids) AND NOT d.is_deleted AND d.deleted_at IS NULL
            AND (coalesce(d.is_superseded,false) OR r.release_status IN ('void','superseded')
              OR (r.project_id,r.file_url,r.pdf_page,r.revision_code,r.sheet_number)
                IS DISTINCT FROM (d.project_id,d.file_url,d.pdf_page,d.revision_number,d.sheet_number)));
    END IF;
    INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
      VALUES(txid_current(),pg_backend_pid(),auth.uid(),NEW.project_id,v_set,'approval_sync') RETURNING id INTO v_context;
    IF EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=v_set AND set_approval_status IS DISTINCT FROM CASE WHEN v_approved THEN 'approved' ELSE 'pending_review' END) THEN
      PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_sets','UPDATE',
        jsonb_build_object('set_approval_status',CASE WHEN v_approved THEN 'approved' ELSE 'pending_review' END),v_set); END IF;
    DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  END LOOP;
  PERFORM steelbuild_drawing_revision.assert_role(NEW.project_id,'pm');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.publish_drawing_revision(p_revision_id uuid,p_release_status text DEFAULT 'released_for_field')
RETURNS public.drawing_revisions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE r public.drawing_revisions;s public.drawing_sets;v_set uuid;v_context uuid;v_prior text;
BEGIN
  IF p_release_status IS NULL OR p_release_status NOT IN ('reviewed','released_for_estimate','released_for_shop','released_for_field') THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_INVALID: Invalid publish status' USING ERRCODE='22023'; END IF;
  SELECT d.drawing_set_id INTO v_set FROM public.drawings d JOIN public.drawing_revisions rev ON rev.drawing_id=d.id WHERE rev.id=p_revision_id;
  s:=steelbuild_drawing_revision.lock_set(v_set,'pm',true);
  r:=steelbuild_drawing_revision.assert_current(p_revision_id,s.id);v_prior:=r.release_status;
  IF EXISTS(SELECT 1 FROM public.drawing_holds WHERE drawing_id=r.drawing_id AND is_active) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_HOLD: Release the active hold first' USING ERRCODE='42501'; END IF;
  PERFORM steelbuild_drawing_revision.assert_distribution(s.project_id,s.id,p_release_status);
  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),auth.uid(),s.project_id,s.id,'publish') RETURNING id INTO v_context;
  SELECT * INTO r FROM jsonb_populate_record(NULL::public.drawing_revisions,steelbuild_drawing_revision.write_row(v_context,'public.drawing_revisions','UPDATE',
    jsonb_build_object('release_status',p_release_status,'updated_by',auth.uid(),'updated_at',clock_timestamp()),r.id));
  INSERT INTO public.drawing_activity(project_id,drawing_id,event_type,from_value,to_value,actor_id,metadata)
    VALUES(s.project_id,r.drawing_id,'revision_changed',v_prior,p_release_status,auth.uid(),jsonb_build_object('operation','publish','revision_id',r.id));
  PERFORM steelbuild_drawing_revision.assert_role(s.project_id,'pm');
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.place_drawing_hold(p_drawing_id uuid,p_reason text) RETURNS public.drawing_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE d public.drawings;s public.drawing_sets;r public.drawing_revisions;h public.drawing_holds;v_context uuid;v_name text;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL OR octet_length(p_reason)>65536 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_REASON: Bounded hold reason required' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM public.drawings WHERE id=p_drawing_id;
  s:=steelbuild_drawing_revision.lock_set(d.drawing_set_id,'field');
  SELECT id INTO r.id FROM public.drawing_revisions WHERE drawing_id=p_drawing_id AND is_current;
  r:=steelbuild_drawing_revision.assert_current(r.id,s.id);
  IF EXISTS(SELECT 1 FROM public.drawing_holds WHERE drawing_id=d.id AND is_active) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_HOLD: Sheet already on hold' USING ERRCODE='23505'; END IF;
  SELECT coalesce(nullif(btrim(full_name),''),email) INTO v_name FROM public.user_profiles WHERE id=auth.uid();
  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),auth.uid(),s.project_id,s.id,'hold') RETURNING id INTO v_context;
  SELECT * INTO h FROM jsonb_populate_record(NULL::public.drawing_holds,steelbuild_drawing_revision.write_row(v_context,'public.drawing_holds','INSERT',
    jsonb_build_object('project_id',s.project_id,'drawing_id',d.id,'reason',btrim(p_reason),'prior_stage',d.stage,'prior_release_status',r.release_status,'placed_by_id',auth.uid(),'placed_by_name',v_name)));
  INSERT INTO steelbuild_drawing_revision.hold_bindings VALUES(h.id,r.id,s.project_id,d.id,r.file_url,r.pdf_page,r.revision_code,r.release_status);
  PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_revisions','UPDATE',jsonb_build_object('release_status','on_hold','updated_by',auth.uid(),'updated_at',clock_timestamp()),r.id);
  INSERT INTO public.drawing_activity(project_id,drawing_id,event_type,from_value,to_value,actor_id,metadata)
    VALUES(s.project_id,d.id,'hold_placed',r.release_status,'on_hold',auth.uid(),jsonb_build_object('hold_id',h.id,'reason',h.reason,'revision_id',r.id));
  PERFORM steelbuild_drawing_revision.assert_role(s.project_id,'field');
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN h;
END $$;

CREATE OR REPLACE FUNCTION public.release_drawing_hold(p_hold_id uuid,p_notes text DEFAULT NULL) RETURNS public.drawing_holds
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE h public.drawing_holds;b steelbuild_drawing_revision.hold_bindings;s public.drawing_sets;r public.drawing_revisions;v_set uuid;v_context uuid;v_name text;
BEGIN
  IF octet_length(p_notes)>65536 THEN RAISE EXCEPTION 'DRAWING_COMMAND_REASON: Release notes too long' USING ERRCODE='22023'; END IF;
  SELECT * INTO h FROM public.drawing_holds WHERE id=p_hold_id;
  SELECT drawing_set_id INTO v_set FROM public.drawings WHERE id=h.drawing_id;
  s:=steelbuild_drawing_revision.lock_set(v_set,'field',true);
  SELECT * INTO h FROM public.drawing_holds WHERE id=p_hold_id;
  IF h.id IS NULL OR h.project_id IS DISTINCT FROM s.project_id OR NOT h.is_active THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_STALE: Active hold required' USING ERRCODE='40001'; END IF;
  SELECT * INTO b FROM steelbuild_drawing_revision.hold_bindings WHERE hold_id=h.id;
  SELECT * INTO r FROM public.drawing_revisions WHERE drawing_id=h.drawing_id AND is_current;
  SELECT coalesce(nullif(btrim(full_name),''),email) INTO v_name FROM public.user_profiles WHERE id=auth.uid();
  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),auth.uid(),s.project_id,s.id,'hold') RETURNING id INTO v_context;
  SELECT * INTO h FROM jsonb_populate_record(NULL::public.drawing_holds,steelbuild_drawing_revision.write_row(v_context,'public.drawing_holds','UPDATE',
    jsonb_build_object('is_active',false,'released_at',clock_timestamp(),'released_by_id',auth.uid(),'released_by_name',v_name,
      'release_notes',nullif(btrim(p_notes),''),'updated_at',clock_timestamp()),h.id));
  IF b.hold_id IS NOT NULL AND r.id=b.drawing_revision_id AND r.release_status='on_hold' THEN
    r:=steelbuild_drawing_revision.assert_current(r.id,s.id);
    IF (b.project_id,b.drawing_id,b.file_url,b.pdf_page,b.revision_code) IS DISTINCT FROM (r.project_id,r.drawing_id,r.file_url,r.pdf_page,r.revision_code) THEN
      RAISE EXCEPTION 'DRAWING_COMMAND_SOURCE_MISMATCH: Held source changed' USING ERRCODE='40001'; END IF;
    -- Closing a corrective hold must remain possible after a governing
    -- downgrade/RFI/signoff blocker. Such a close restores no distribution
    -- authority: the same exact revision returns to received, not released.
    r.release_status:=CASE WHEN steelbuild_drawing_revision.distribution_allowed(s.project_id,s.id,b.prior_release_status)
      THEN b.prior_release_status ELSE 'received' END;
    PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_revisions','UPDATE',jsonb_build_object('release_status',r.release_status,'updated_by',auth.uid(),'updated_at',clock_timestamp()),r.id);
  END IF;
  INSERT INTO public.drawing_activity(project_id,drawing_id,event_type,from_value,to_value,actor_id,metadata)
    VALUES(s.project_id,h.drawing_id,'hold_released','on_hold',
      r.release_status,auth.uid(),
      jsonb_build_object('hold_id',h.id,'notes',h.release_notes,'bound_revision_id',b.drawing_revision_id));
  PERFORM steelbuild_drawing_revision.assert_role(s.project_id,'field');
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN h;
END $$;

CREATE FUNCTION public.set_drawing_set_lock(p_set_id uuid,p_locked boolean,p_reason text,p_expected_updated_at timestamptz)
RETURNS public.drawing_sets LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE s public.drawing_sets;v_context uuid;v_role text;
BEGIN
  IF p_locked IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'DRAWING_COMMAND_STALE: Expected set timestamp required' USING ERRCODE='40001'; END IF;
  v_role:=CASE WHEN p_locked THEN 'pm' ELSE 'admin' END;
  s:=steelbuild_drawing_revision.lock_set(p_set_id,v_role,false,true);
  IF s.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'DRAWING_COMMAND_STALE: Set changed' USING ERRCODE='40001'; END IF;
  IF (NOT p_locked AND nullif(btrim(p_reason),'') IS NULL) OR octet_length(p_reason)>65536 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_REASON: Unlock requires a bounded reason' USING ERRCODE='22023'; END IF;
  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),auth.uid(),s.project_id,s.id,'lock') RETURNING id INTO v_context;
  SELECT * INTO s FROM jsonb_populate_record(NULL::public.drawing_sets,steelbuild_drawing_revision.write_row(v_context,'public.drawing_sets','UPDATE',
    jsonb_build_object('is_locked',p_locked,'locked_at',CASE WHEN p_locked THEN clock_timestamp() END,'locked_by',CASE WHEN p_locked THEN auth.uid() END,
      'locked_reason',CASE WHEN p_locked THEN nullif(btrim(p_reason),'') END,'updated_at',clock_timestamp()),s.id));
  INSERT INTO public.pma_audit_logs(project_id,entity_type,entity_id,action,new_values,changed_by)
    VALUES(s.project_id,'drawing_sets',s.id,'UPDATE',jsonb_build_object('operation',CASE WHEN p_locked THEN 'set_lock' ELSE 'set_unlock' END,'reason',p_reason),auth.uid()::text);
  PERFORM steelbuild_drawing_revision.assert_role(s.project_id,v_role);
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.delete_drawing_set(p_set_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE s public.drawing_sets;v_context uuid;v_count integer:=0;v_drawing uuid;
BEGIN
  s:=steelbuild_drawing_revision.lock_set(p_set_id,'admin');
  INSERT INTO steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation)
    VALUES(txid_current(),pg_backend_pid(),auth.uid(),s.project_id,s.id,'archive') RETURNING id INTO v_context;
  FOR v_drawing IN SELECT id FROM public.drawings WHERE drawing_set_id=s.id AND NOT coalesce(is_deleted,false) ORDER BY id LOOP
    PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawings','UPDATE',jsonb_build_object('is_deleted',true,'deleted_at',clock_timestamp(),'updated_at',clock_timestamp()),v_drawing);
    v_count:=v_count+1;
  END LOOP;
  PERFORM steelbuild_drawing_revision.write_row(v_context,'public.drawing_sets','UPDATE',jsonb_build_object('is_deleted',true,'deleted_at',clock_timestamp(),'updated_at',clock_timestamp()),s.id);
  PERFORM steelbuild_drawing_revision.assert_role(s.project_id,'admin');
  DELETE FROM steelbuild_drawing_revision.command_context WHERE id=v_context;
  RETURN v_count;
END $$;

-- Pin the shared implementation before replacing its public body. Keeping the
-- public OID avoids pre-bound callers retaining an unwrapped implementation.
DO $$ BEGIN
  IF encode(sha256(convert_to(pg_get_functiondef('public.soft_delete_project(uuid)'::regprocedure),'UTF8')),'hex')
    IS DISTINCT FROM '5de294eee2834ac7c1a1ede50301e4e560cd0316d0470981aa47d19c17672930' THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_PREREQUISITE: Unreviewed project archive body'; END IF;
END $$;

-- Captured 2026-10-15 on both fixed refs; body retained exactly. The original
-- fixed child list and skip-WP behavior remain, but the GUC is not authority.
CREATE FUNCTION steelbuild_drawing_revision.archive_project_impl(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_deleted_at timestamptz := now(); v_table text; v_updated int;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings','drawing_sets','expenses','inspections',
    'punchlist_items','safety_incidents','scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions','comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks','email_messages','linked_folders','document_import_queue'
  ];
begin
  perform set_config('app.skip_wp_progress_refresh', '1', true);
  if not public.user_has_project_role_at_least(p_project_id, 'admin') then
    raise exception 'Not authorized to delete project %', p_project_id using errcode = '42501';
  end if;
  foreach v_table in array v_child_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false', v_table)
        using v_deleted_at, p_project_id;
    end if;
  end loop;
  update public.projects set is_deleted = true, deleted_at = v_deleted_at
   where id = p_project_id and coalesce(is_deleted, false) = false;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Project % not found or already archived', p_project_id using errcode = 'P0002';
  end if;
end;
$function$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.archive_project_impl(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.soft_delete_project(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_org uuid;v_actor uuid:=auth.uid();v_sheets uuid[];v_sets uuid[];
BEGIN
  v_org:=steelbuild_drawing_revision.assert_role(p_project_id,'admin');
  -- Existing shared archival intentionally waits (at most 2s) behind intake's
  -- organization/project locks. The subsequent drawing locks remain NOWAIT.
  PERFORM id FROM public.organizations WHERE id=v_org FOR SHARE;
  IF NOT FOUND OR steelbuild_drawing_revision.assert_role(p_project_id,'admin') IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_NOT_AUTHORIZED: Organization changed during archive admission' USING ERRCODE='42501'; END IF;
  PERFORM id FROM public.projects WHERE id=p_project_id AND org_id=v_org FOR UPDATE;
  IF NOT FOUND OR steelbuild_drawing_revision.assert_role(p_project_id,'admin') IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_NOT_AUTHORIZED: Project changed during archive admission' USING ERRCODE='42501'; END IF;
  PERFORM id FROM auth.users WHERE id=v_actor FOR KEY SHARE NOWAIT;
  IF (SELECT count(*) FROM public.drawing_sets WHERE project_id=p_project_id)>1000
    OR (SELECT count(*) FROM public.drawings WHERE project_id=p_project_id)>1000 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Project archive drawing roster exceeds bounds' USING ERRCODE='54000'; END IF;
  -- NULL-set legacy sheets are included by project. Missing/nonlocal set
  -- parents cannot silently authorize mutations in another project.
  IF EXISTS(SELECT 1 FROM public.drawings d WHERE d.project_id=p_project_id AND d.drawing_set_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.drawing_sets s WHERE s.id=d.drawing_set_id AND s.project_id=p_project_id)) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_SOURCE_MISMATCH: Archive sheet parent is missing or foreign' USING ERRCODE='40001'; END IF;
  PERFORM id FROM public.drawing_sets WHERE project_id=p_project_id ORDER BY id FOR UPDATE NOWAIT;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_sets FROM public.drawing_sets WHERE project_id=p_project_id;
  PERFORM id FROM public.drawings WHERE project_id=p_project_id ORDER BY id FOR UPDATE NOWAIT;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO v_sheets FROM public.drawings WHERE project_id=p_project_id;
  IF (SELECT count(*) FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheets))>10000
    OR (SELECT count(*) FROM public.drawing_holds WHERE drawing_id=ANY(v_sheets))>1000 THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_LIMIT: Project archive history/hold bound exceeded' USING ERRCODE='54000'; END IF;
  PERFORM id FROM public.drawing_revisions WHERE drawing_id=ANY(v_sheets) ORDER BY id FOR UPDATE NOWAIT;
  PERFORM id FROM public.drawing_holds WHERE drawing_id=ANY(v_sheets) ORDER BY id FOR UPDATE NOWAIT;
  PERFORM steelbuild_drawing_revision.assert_role(p_project_id,'admin');
  INSERT INTO steelbuild_drawing_revision.project_archive_context VALUES(txid_current(),pg_backend_pid(),v_actor,p_project_id,v_sets,v_sheets);
  PERFORM steelbuild_drawing_revision.archive_project_impl(p_project_id);
  -- The intentional tombstone makes user_has_project_access false on live.
  -- Current role/membership and MFA still must hold after all cascade waits.
  IF auth.uid() IS DISTINCT FROM v_actor OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_actor)
    OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND org_id=v_org)
    OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org)
    OR NOT coalesce(public.user_is_org_member(v_org),false)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project_id,'admin'),false)
    OR NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'DRAWING_COMMAND_NOT_AUTHORIZED: Archive authority changed' USING ERRCODE='42501'; END IF;
  DELETE FROM steelbuild_drawing_revision.project_archive_context
    WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND actor_id=v_actor AND project_id=p_project_id;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'DRAWING_COMMAND_BUSY: Concurrent work; retry project archive' USING ERRCODE='55P03';
END $$;
-- CREATE OR REPLACE preserves the original public OID/owner/ACL. No grants on
-- this shared public entrypoint are broadened or rewritten.

CREATE FUNCTION steelbuild_drawing_revision.guard_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' SET datestyle='ISO, YMD' SET lock_timeout='2s' AS $$
DECLARE v_old jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_new jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  v_row jsonb;v_set uuid;v_project uuid;v_operation text;v_context uuid;v_allowed text[];v_rect jsonb;v_key text;v_counts jsonb;
  v_expected record;v_server_time boolean:=false;v_compare text;v_unchanged boolean;
BEGIN
  v_row:=CASE WHEN TG_OP='DELETE' THEN v_old ELSE v_new END;v_project:=(v_row->>'project_id')::uuid;
  IF TG_TABLE_NAME='drawing_sets' THEN v_set:=(v_row->>'id')::uuid;
  ELSIF TG_TABLE_NAME='drawings' THEN v_set:=(v_row->>'drawing_set_id')::uuid;
  ELSE SELECT drawing_set_id INTO v_set FROM public.drawings WHERE id=(v_row->>'drawing_id')::uuid; END IF;
  SELECT operation,id INTO v_operation,v_context FROM steelbuild_drawing_revision.command_context
    WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND actor_id=auth.uid() AND project_id=v_project AND set_id=v_set;
  IF TG_WHEN='BEFORE' THEN
    UPDATE steelbuild_drawing_revision.write_intents SET consumed=true WHERE context_id=v_context AND NOT consumed
      AND relation_id=TG_RELID AND row_id=(v_row->>'id')::uuid AND operation=TG_OP
      AND old_sha256 IS NOT DISTINCT FROM CASE WHEN TG_OP='UPDATE' THEN encode(sha256(convert_to(OLD::text,'UTF8')),'hex') END
      AND new_sha256=encode(sha256(convert_to(NEW::text,'UTF8')),'hex');
    IF FOUND THEN RETURN NEW; END IF;
  ELSIF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.write_intents WHERE context_id=v_context AND consumed
    AND relation_id=TG_RELID AND row_id=(v_row->>'id')::uuid AND operation=TG_OP
    AND old_sha256 IS NOT DISTINCT FROM CASE WHEN TG_OP='UPDATE' THEN encode(sha256(convert_to(OLD::text,'UTF8')),'hex') END
    AND new_sha256=encode(sha256(convert_to(NEW::text,'UTF8')),'hex')) THEN RETURN NEW; END IF;
  -- Only the existing timestamp trigger's actual server-generated value may
  -- differ in the AFTER check. Source/identity/lifecycle receive no exception.
  IF TG_WHEN='AFTER' AND TG_OP='UPDATE' AND NEW.updated_at=now()
    AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=TG_RELID AND tgenabled='O' AND tgfoid='public.update_updated_at()'::regprocedure) THEN
    v_server_time:=true; END IF;
  IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.project_archive_context
    WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND actor_id=auth.uid() AND project_id=v_project
      AND ((TG_TABLE_NAME='drawing_sets' AND (v_row->>'id')::uuid=ANY(set_ids))
        OR (TG_TABLE_NAME='drawings' AND (v_row->>'id')::uuid=ANY(sheet_ids)))) THEN
    v_operation:='project_archive'; END IF;
  -- Preserve the existing Auth FK's ON DELETE SET NULL contract, not a new
  -- unlock route. Its parent must actually be gone and no other field changes.
  IF TG_TABLE_NAME='drawing_sets' AND TG_OP='UPDATE' AND (pg_trigger_depth()>1 OR TG_WHEN='AFTER')
    AND v_old->>'locked_by' IS NOT NULL AND v_new->>'locked_by' IS NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=(v_old->>'locked_by')::uuid) THEN
    v_expected:=OLD;v_expected.locked_by:=NULL;
    IF v_server_time THEN v_expected.updated_at:=now(); END IF;
    IF NEW::text=v_expected::text THEN RETURN NEW; END IF;
  END IF;
  -- Explicit privileged SQL administrators remain administrators. This cannot
  -- authorize API SET ROLE calls, including service_role SECURITY DEFINER paths.
  IF current_setting('role',true)='none' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='drawing_sets' AND pg_trigger_depth()>1
    AND (v_operation='project_archive' OR EXISTS(
      SELECT 1 FROM steelbuild_drawing_revision.write_intents i JOIN public.drawings d ON d.id=i.row_id
      WHERE i.context_id=v_context AND i.relation_id='public.drawings'::regclass AND i.consumed
        AND d.drawing_set_id=v_set AND d.project_id=v_project
        AND i.new_sha256=encode(sha256(convert_to(d::text,'UTF8')),'hex'))) THEN
    SELECT jsonb_build_object('sheet_count',count(*),'processed_count',count(*) FILTER(WHERE ai_extraction_status='Processed'),
      'needs_review_count',count(*) FILTER(WHERE ai_extraction_status='NeedsReview'),
      'failed_count',count(*) FILTER(WHERE ai_extraction_status='Failed' OR upload_status='Failed')) INTO v_counts
      FROM public.drawings WHERE drawing_set_id=v_set AND NOT is_deleted;
    v_expected:=OLD;v_expected.sheet_count:=(v_counts->>'sheet_count')::integer;
    v_expected.processed_count:=(v_counts->>'processed_count')::integer;
    v_expected.needs_review_count:=(v_counts->>'needs_review_count')::integer;
    v_expected.failed_count:=(v_counts->>'failed_count')::integer;v_expected.updated_at:=now();
    IF NEW::text=v_expected::text THEN RETURN NEW; END IF;
    IF (v_counts->>'sheet_count')::integer=0 THEN
      v_expected:=OLD;v_expected.is_deleted:=true;v_expected.deleted_at:=now();v_expected.updated_at:=now();
      IF NEW::text=v_expected::text THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    v_allowed:=CASE TG_TABLE_NAME
      WHEN 'drawings' THEN ARRAY['notes','reviewer','due_date','spec_section','priority_flag','fabrication_start_date','fabrication_finish_date','ready_for_install_date','final_delivery_date','markup_scale','scale_status']
      WHEN 'drawing_sets' THEN ARRAY['description','notes','due_date','eor_reviewer','area_sequence','material_impacted','long_lead_impact','titleblock_title_rect','titleblock_number_rect','titleblock_revision_rect']
      ELSE ARRAY[]::text[] END;
    IF v_operation='project_archive' AND TG_TABLE_NAME IN ('drawings','drawing_sets') THEN
      v_expected:=OLD;v_expected.is_deleted:=true;v_expected.deleted_at:=now();
      IF v_server_time THEN v_expected.updated_at:=now(); END IF;
      IF NEW::text=v_expected::text THEN RETURN NEW; END IF;
    END IF;
    IF v_operation IS NOT NULL THEN
      RAISE EXCEPTION 'DRAWING_COMMAND_REQUIRED: No exact unused row transition' USING ERRCODE='42501'; END IF;
    IF v_server_time THEN v_allowed:=v_allowed||ARRAY['updated_at']; END IF;
    SELECT string_agg(format('($1::%s).%I IS NOT DISTINCT FROM ($2::%s).%I',TG_RELID::regclass,attname,TG_RELID::regclass,attname),' AND ' ORDER BY attnum)
      INTO v_compare FROM pg_attribute WHERE attrelid=TG_RELID AND attnum>0 AND NOT attisdropped AND NOT attname=ANY(v_allowed);
    EXECUTE 'select '||v_compare INTO v_unchanged USING OLD::text,NEW::text;
    IF v_unchanged THEN
      IF v_operation IS NULL THEN
        PERFORM steelbuild_drawing_revision.assert_role(v_project,'pm');
        IF EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=v_set AND (is_locked OR is_deleted OR deleted_at IS NOT NULL))
          OR coalesce((v_old->>'is_deleted')::boolean,false) OR v_old->>'deleted_at' IS NOT NULL THEN
          RAISE EXCEPTION 'DRAWING_COMMAND_SET_UNAVAILABLE: Active unlocked source required' USING ERRCODE='40001'; END IF;
      END IF;
      IF TG_TABLE_NAME='drawing_sets' THEN
        FOREACH v_key IN ARRAY ARRAY['titleblock_title_rect','titleblock_number_rect','titleblock_revision_rect'] LOOP
          v_rect:=v_new->v_key;
          IF v_rect IS DISTINCT FROM v_old->v_key AND v_rect IS NOT NULL AND v_rect<>'null'::jsonb THEN
            IF jsonb_typeof(v_rect)<>'object' OR NOT v_rect ?& ARRAY['x','y','width','height']
              OR (SELECT count(*) FROM jsonb_object_keys(v_rect))<>4
              OR EXISTS(SELECT 1 FROM jsonb_each(v_rect) e WHERE jsonb_typeof(e.value)<>'number') THEN
              RAISE EXCEPTION 'DRAWING_COMMAND_CALIBRATION: Exact numeric rectangle required' USING ERRCODE='22023'; END IF;
            IF (v_rect->>'x')::numeric<0 OR (v_rect->>'y')::numeric<0 OR (v_rect->>'width')::numeric<=0 OR (v_rect->>'height')::numeric<=0
              OR (v_rect->>'x')::numeric+(v_rect->>'width')::numeric>1 OR (v_rect->>'y')::numeric+(v_rect->>'height')::numeric>1 THEN
              RAISE EXCEPTION 'DRAWING_COMMAND_CALIBRATION: Rectangle outside page' USING ERRCODE='22023'; END IF;
          END IF;
        END LOOP;
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'DRAWING_COMMAND_REQUIRED: Protected drawing writes require an admitted command' USING ERRCODE='42501';
END $$;

-- Run before timestamp/lock triggers: direct caller timestamps remain protected
-- while existing server timestamp triggers retain their normal behavior.
CREATE FUNCTION steelbuild_drawing_revision.guard_truncate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('role',true)='none' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'DRAWING_COMMAND_REQUIRED: API roles cannot truncate drawing records' USING ERRCODE='42501';
END $$;
CREATE TRIGGER aaa_drawing_command_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.drawings FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER aaa_drawing_command_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_sets FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER aaa_drawing_command_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_revisions FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER aaa_drawing_command_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_holds FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
-- Validate final NEW after all BEFORE triggers, including count/archive lanes.
CREATE TRIGGER zzz_drawing_command_transition AFTER INSERT OR UPDATE OR DELETE ON public.drawings FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER zzz_drawing_command_transition AFTER INSERT OR UPDATE OR DELETE ON public.drawing_sets FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER zzz_drawing_command_transition AFTER INSERT OR UPDATE OR DELETE ON public.drawing_revisions FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER zzz_drawing_command_transition AFTER INSERT OR UPDATE OR DELETE ON public.drawing_holds FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.guard_write();
CREATE TRIGGER drawing_command_no_truncate BEFORE TRUNCATE ON public.drawings FOR EACH STATEMENT EXECUTE FUNCTION steelbuild_drawing_revision.guard_truncate();
CREATE TRIGGER drawing_command_no_truncate BEFORE TRUNCATE ON public.drawing_sets FOR EACH STATEMENT EXECUTE FUNCTION steelbuild_drawing_revision.guard_truncate();
CREATE TRIGGER drawing_command_no_truncate BEFORE TRUNCATE ON public.drawing_revisions FOR EACH STATEMENT EXECUTE FUNCTION steelbuild_drawing_revision.guard_truncate();
CREATE TRIGGER drawing_command_no_truncate BEFORE TRUNCATE ON public.drawing_holds FOR EACH STATEMENT EXECUTE FUNCTION steelbuild_drawing_revision.guard_truncate();
CREATE TRIGGER drawing_command_governing_approval AFTER UPDATE ON public.submittals
  FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.sync_governing_approval();
-- apply_round's receipt insertion follows the parent UPDATE. Revalidate at
-- transaction completion, after any implicit receipt/audit wait and after
-- round/command authority has been cleaned up. This trigger grants no writes.
CREATE FUNCTION steelbuild_drawing_revision.assert_round_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
  IF NEW.result->'submittal'->>'submittal_type'='Shop Drawing' THEN
    SELECT org_id INTO v_org FROM public.projects WHERE id=NEW.project_id;
    -- Completion needs current authority, not an active project: established
    -- erasure flushes deferred events after its authorized project archive.
    -- The existing role helper checks live org membership and explicit/default
    -- project role even for archived projects. No caller flag skips this check.
    IF NEW.actor_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL OR v_org IS NULL
      OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
      OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org)
      OR NOT coalesce(public.user_is_org_member(v_org),false)
      OR NOT coalesce(public.user_has_project_role_at_least(NEW.project_id,'pm'),false)
      OR NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
      RAISE EXCEPTION 'DRAWING_COMMAND_NOT_AUTHORIZED: Current round actor membership, role and MFA required' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER drawing_command_round_completion AFTER INSERT ON steelbuild_workflow.round_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION steelbuild_drawing_revision.assert_round_completion();

-- Remove only drawing-owned mutation grants. Include inherited and SET-able
-- roles; do not alter role memberships, unrelated schemas or default grants.
DO $$ DECLARE r record;t text;c text;v_roles text[];
BEGIN
  SELECT array_agg(DISTINCT role_name) INTO v_roles FROM (
    SELECT 'PUBLIC' role_name UNION ALL SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
      OR EXISTS(SELECT 1 FROM pg_roles root WHERE root.rolname IN ('anon','authenticated','service_role') AND pg_has_role(root.oid,pg_roles.oid,'MEMBER'))) reachable;
  FOREACH t IN ARRAY ARRAY['drawings','drawing_sets','drawing_revisions','drawing_holds'] LOOP
    SELECT string_agg(quote_ident(attname),',') INTO c FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
    FOR r IN SELECT unnest(v_roles) role_name LOOP
      IF EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||t)::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=r.role_name)) THEN
        RAISE EXCEPTION 'DRAWING_COMMAND_OWNERSHIP: API-reachable owner requires explicit review'; END IF;
      EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON public.%I FROM %s',t,CASE WHEN r.role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.role_name) END);
      EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.%I FROM %s',c,c,c,t,CASE WHEN r.role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.role_name) END);
    END LOOP;
  END LOOP;
END $$;
GRANT UPDATE(notes,reviewer,due_date,spec_section,priority_flag,fabrication_start_date,fabrication_finish_date,ready_for_install_date,final_delivery_date,markup_scale,scale_status) ON public.drawings TO authenticated;
GRANT UPDATE(description,notes,due_date,eor_reviewer,area_sequence,material_impacted,long_lead_impact,titleblock_title_rect,titleblock_number_rect,titleblock_revision_rect) ON public.drawing_sets TO authenticated;
REVOKE ALL ON FUNCTION public.publish_drawing_revision(uuid,text),public.place_drawing_hold(uuid,text),public.release_drawing_hold(uuid,text),public.set_drawing_set_lock(uuid,boolean,text,timestamptz),public.delete_drawing_set(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_drawing_revision(uuid,text),public.place_drawing_hold(uuid,text),public.release_drawing_hold(uuid,text),public.set_drawing_set_lock(uuid,boolean,text,timestamptz),public.delete_drawing_set(uuid) TO authenticated;
-- The callable count helper is internal maintenance, never a service-role
-- tombstone RPC. Existing triggers still execute it as their defining owner.
DO $$ BEGIN
  IF to_regprocedure('public.recount_drawing_set(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.recount_drawing_set(uuid) FROM PUBLIC,anon,authenticated,service_role;
  END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA steelbuild_drawing_revision FROM PUBLIC,anon,authenticated,service_role;

-- Expectations are intentionally NOT populated by this candidate. A later
-- reviewed package supplies the exact catalog and privileged-writer/caller
-- classification digest. Capturing the current catalog is not an approval.
CREATE TABLE steelbuild_drawing_revision.package_review (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),contract_version integer NOT NULL CHECK(contract_version=1),
  source_commit text NOT NULL CHECK(source_commit ~ '^[0-9a-f]{40}$'),
  catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[0-9a-f]{64}$'),
  classification_sha256 text NOT NULL CHECK(classification_sha256 ~ '^[0-9a-f]{64}$'),
  approved boolean NOT NULL DEFAULT false
);
ALTER TABLE steelbuild_drawing_revision.package_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON steelbuild_drawing_revision.package_review FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION steelbuild_drawing_revision.catalog_snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_schemas oid[];v_tables oid[];v_catalog jsonb;
BEGIN
  -- External/shared callable definers can transitively reach drawing writes.
  -- Include every non-system namespace, not just today's drawing schemas.
  SELECT array_agg(oid) INTO v_schemas FROM pg_namespace WHERE nspname<>'information_schema' AND nspname!~'^pg_';
  SELECT array_agg(oid) INTO v_tables FROM pg_class WHERE relnamespace=ANY(v_schemas) AND relkind IN ('r','p','v','m','f');
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace=ANY(v_schemas))>2500 OR cardinality(v_tables)>1000
    OR (SELECT count(*) FROM pg_rewrite WHERE ev_class=ANY(v_tables))>4000
    OR (SELECT count(*) FROM pg_roles)>1000 OR (SELECT count(*) FROM pg_auth_members)>2000 THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY oid) FROM pg_namespace n WHERE oid=ANY(v_schemas)),
    'functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid)
      FROM pg_proc p WHERE p.pronamespace=ANY(v_schemas) AND p.prokind<>'a'),
    'tables',(SELECT jsonb_agg(jsonb_build_object('id',oid,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity,'kind',relkind,'options',reloptions) ORDER BY oid) FROM pg_class WHERE oid=ANY(v_tables)),
    'views',(SELECT jsonb_agg(jsonb_build_object('relation',oid,'definition',pg_get_viewdef(oid,false)) ORDER BY oid) FROM pg_class WHERE oid=ANY(v_tables) AND relkind IN ('v','m')),
    'rewrite',(SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('definition',pg_get_ruledef(r.oid,false)) ORDER BY r.oid) FROM pg_rewrite r WHERE ev_class=ANY(v_tables)),
    'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attrelid=ANY(v_tables) AND attnum>0 AND NOT attisdropped),
    'column_defaults',(SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('definition',pg_get_expr(adbin,adrelid)) ORDER BY adrelid,adnum) FROM pg_attrdef d WHERE adrelid=ANY(v_tables)),
    'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE conrelid=ANY(v_tables)),
    'indexes',(SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('definition',pg_get_indexdef(indexrelid)) ORDER BY indexrelid) FROM pg_index i WHERE indrelid=ANY(v_tables)),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('relation',tgrelid,'definition',pg_get_triggerdef(oid),'enabled',tgenabled) ORDER BY oid) FROM pg_trigger WHERE tgrelid=ANY(v_tables) AND NOT tgisinternal),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p WHERE polrelid=ANY(v_tables)),
    'roles',(SELECT jsonb_agg(to_jsonb(r)-'rolpassword' ORDER BY oid) FROM pg_roles r),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m),
    'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d),
    'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY setdatabase,setrole) FROM pg_db_role_setting s)
  ) INTO v_catalog;
  RETURN v_catalog;
END $$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.catalog_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION steelbuild_drawing_revision.catalog_fingerprint() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT encode(sha256(convert_to(steelbuild_drawing_revision.catalog_snapshot()::text,'UTF8')),'hex')
$$;
REVOKE ALL ON FUNCTION steelbuild_drawing_revision.catalog_fingerprint() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_drawing_command_capabilities(p_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE v_ready boolean:=false;v_expected text;v_table text;v_role text;v_column record;v_allow text[];
BEGIN
  PERFORM steelbuild_drawing_revision.assert_access(p_project_id);
  SELECT catalog_sha256 INTO v_expected FROM steelbuild_drawing_revision.package_review WHERE singleton AND approved AND contract_version=1;
  IF v_expected IS NOT NULL AND v_expected=steelbuild_drawing_revision.catalog_fingerprint() THEN
    v_ready:=true;
    FOREACH v_table IN ARRAY ARRAY['drawings','drawing_sets','drawing_revisions','drawing_holds'] LOOP
      v_allow:=CASE v_table
        WHEN 'drawings' THEN ARRAY['notes','reviewer','due_date','spec_section','priority_flag','fabrication_start_date','fabrication_finish_date','ready_for_install_date','final_delivery_date','markup_scale','scale_status']
        WHEN 'drawing_sets' THEN ARRAY['description','notes','due_date','eor_reviewer','area_sequence','material_impacted','long_lead_impact','titleblock_title_rect','titleblock_number_rect','titleblock_revision_rect']
        ELSE ARRAY[]::text[] END;
      IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||v_table)::regclass AND tgname='aaa_drawing_command_boundary'
        AND tgfoid='steelbuild_drawing_revision.guard_write()'::regprocedure AND tgenabled='O') THEN v_ready:=false; END IF;
      FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_table_privilege(v_role,'public.'||v_table,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN v_ready:=false; END IF;
        FOR v_column IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||v_table)::regclass AND attnum>0 AND NOT attisdropped LOOP
          IF has_column_privilege(v_role,'public.'||v_table,v_column.attname,'UPDATE') IS DISTINCT FROM (v_role='authenticated' AND v_column.attname=ANY(v_allow))
            OR has_column_privilege(v_role,'public.'||v_table,v_column.attname,'INSERT,REFERENCES') THEN v_ready:=false; END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('contract_version',1,'new_set',v_ready,'revision',v_ready,'write_boundary',v_ready,'source_protection',v_ready,'receipt_lookup',v_ready);
END $$;
REVOKE ALL ON FUNCTION public.get_drawing_command_capabilities(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_command_capabilities(uuid) TO authenticated;
$cutover_payload_2$;
BEGIN
  IF encode(sha256(convert_to(payload,'UTF8')),'hex') <> '267522500056c715a0a413bb82dd6f79f4e53f7e8a633a23ee78eeca2699df4e' THEN RAISE EXCEPTION 'CUTOVER_PAYLOAD_HASH'; END IF;
  EXECUTE payload;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261016061825','drawing_command_write_boundary',ARRAY[payload]);
END $install_component$;

DO $install_component$
DECLARE payload text := $cutover_payload_3$-- UNINSTALLED CANDIDATE. Requires the reviewed drawing command package.
-- Public caller-JWT reader only; no direct access to observations or receipts.
-- Transaction control belongs to the reviewed whole-package manual wrapper.
CREATE INDEX drawing_source_observations_project_cursor
  ON steelbuild_drawing_revision.source_observations(project_id,receipt_id,drawing_id);

CREATE FUNCTION public.get_drawing_source_observations(
  p_project_id uuid,p_after_receipt uuid DEFAULT NULL,p_after_drawing uuid DEFAULT NULL,
  p_snapshot_token text DEFAULT NULL,p_limit integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_result jsonb;
BEGIN
  -- Same membership/MFA boundary as project-owned drawing reads, including
  -- viewers. No mutation-role floor, status-label gate, or system-admin bypass.
  IF auth.uid() IS NULL OR NOT coalesce(steelbuild_security.satisfies_mfa(),false)
    OR NOT coalesce(public.user_has_project_access(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND NOT coalesce(is_deleted,false)) THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500
    OR (p_after_receipt IS NULL)<>(p_after_drawing IS NULL)
    OR (p_after_receipt IS NOT NULL AND p_snapshot_token IS NULL)
    OR (p_snapshot_token IS NOT NULL AND p_snapshot_token !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_INVALID_CURSOR' USING ERRCODE='22023';
  END IF;
  -- STABLE gives every query the invoking statement snapshot. The roster
  -- fingerprint and page below also share one SQL statement explicitly.
  -- The full identity scan is mandated per page; payloads are read only for
  -- limit+1 rows. No cap, N+1 lookups, mutable actor fields, or replay keys.
  WITH roster AS MATERIALIZED (
    SELECT encode(sha256(convert_to(p_project_id::text||':'||coalesce(
      string_agg(receipt_id::text||':'||drawing_id::text,',' ORDER BY receipt_id,drawing_id),''),'UTF8')),'hex') token
    FROM steelbuild_drawing_revision.source_observations WHERE project_id=p_project_id
  ), page AS MATERIALIZED (
    SELECT receipt_id,drawing_id,project_id,drawing_set_id,parent_file_url,parent_pdf_page,parent_revision_number,
      parent_updated_at,observed_current_revision_id,observed_current_revision_version,extracted_text,callouts,recorded_at,
      callouts IS NULL AS callouts_is_sql_null
    FROM (
      (SELECT * FROM steelbuild_drawing_revision.source_observations
       WHERE project_id=p_project_id AND p_after_receipt IS NULL
       ORDER BY receipt_id,drawing_id LIMIT p_limit+1)
      UNION ALL
      (SELECT * FROM steelbuild_drawing_revision.source_observations
       WHERE project_id=p_project_id AND p_after_receipt IS NOT NULL
         AND (receipt_id,drawing_id)>(p_after_receipt,p_after_drawing)
       ORDER BY receipt_id,drawing_id LIMIT p_limit+1)
    ) bounded_page
    WHERE (p_snapshot_token IS NULL OR p_snapshot_token=(SELECT token FROM roster))
    ORDER BY receipt_id,drawing_id LIMIT p_limit+1
  ), visible AS MATERIALIZED (SELECT * FROM page ORDER BY receipt_id,drawing_id LIMIT p_limit)
  SELECT jsonb_build_object('version',1,'snapshot_token',roster.token,
    '_cursor_valid',p_after_receipt IS NULL OR EXISTS(
      SELECT 1 FROM steelbuild_drawing_revision.source_observations
      WHERE project_id=p_project_id AND receipt_id=p_after_receipt AND drawing_id=p_after_drawing),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY receipt_id,drawing_id) FROM visible v),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN
      (SELECT jsonb_build_object('receipt_id',receipt_id,'drawing_id',drawing_id) FROM visible ORDER BY receipt_id DESC,drawing_id DESC LIMIT 1)
      ELSE NULL END) INTO v_result FROM roster;
  IF p_snapshot_token IS NOT NULL AND p_snapshot_token<>v_result->>'snapshot_token' THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_CONFLICT: observation roster changed' USING ERRCODE='40001';
  END IF;
  IF NOT (v_result->>'_cursor_valid')::boolean THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_INVALID_CURSOR' USING ERRCODE='22023';
  END IF;
  RETURN v_result-'_cursor_valid';
END $$;
REVOKE ALL ON FUNCTION public.get_drawing_source_observations(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_source_observations(uuid,uuid,uuid,text,integer) TO authenticated;
$cutover_payload_3$;
BEGIN
  IF encode(sha256(convert_to(payload,'UTF8')),'hex') <> '0ab8cb29f3c26a0fe6eb1dd435b4628790a268a20ea09e2e6df9ffb4f95a0cf1' THEN RAISE EXCEPTION 'CUTOVER_PAYLOAD_HASH'; END IF;
  EXECUTE payload;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261016061838','drawing_source_observation_export',ARRAY[payload]);
END $install_component$;

DO $disabled_assertions$
DECLARE role_name text; signature text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH signature IN ARRAY ARRAY['public.create_drawing_set_from_review(uuid,jsonb)','public.apply_drawing_set_revision(uuid,jsonb)'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'CUTOVER_EFFECTIVE_EXECUTE_EXPOSURE: % %',role_name,signature; END IF;
    END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.package_review) THEN RAISE EXCEPTION 'CUTOVER_MUST_INSTALL_UNAPPROVED'; END IF;
END $disabled_assertions$;
COMMIT;
