-- Immutable submitted-revision evidence. Manual reviewed apply + matching ledger
-- stamp only. No legacy evidence is inferred. Existing workflow guards stay live.
-- Transactional revision upload remains quarantined pending zone/link carry-forward.

DO $preflight$
DECLARE pair record;
BEGIN
  FOR pair IN SELECT * FROM (VALUES ('drawings','drawing_set_id','drawing_sets'),('drawing_revisions','drawing_id','drawings')) AS refs(child,col,parent) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname=pair.col
      JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attname='id'
      WHERE c.contype='f' AND c.conrelid=('public.'||pair.child)::regclass
        AND c.confrelid=('public.'||pair.parent)::regclass AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[b.attnum]
        AND c.convalidated AND NOT c.condeferrable) THEN
      RAISE EXCEPTION 'ROUND_SCHEMA_PREREQUISITE: %.% requires a validated immediate FK to %.id',pair.child,pair.col,pair.parent;
    END IF;
  END LOOP;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS steelbuild_workflow;
REVOKE ALL ON SCHEMA steelbuild_workflow FROM PUBLIC, anon, authenticated, service_role;

-- A private row, not a caller-controlled GUC, proves the RPC owns this write.
CREATE TABLE steelbuild_workflow.round_context (
  transaction_id bigint NOT NULL, backend_pid integer NOT NULL,
  submittal_id uuid NOT NULL, PRIMARY KEY(transaction_id, backend_pid, submittal_id)
);
CREATE TABLE steelbuild_workflow.round_requests (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, request_id uuid NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, request_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA steelbuild_workflow FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE steelbuild_workflow.round_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE steelbuild_workflow.round_requests ENABLE ROW LEVEL SECURITY;

-- Project-consistent composite references prevent cross-project forged evidence.
ALTER TABLE public.submittals ADD CONSTRAINT submittals_evidence_identity UNIQUE(id,project_id);
ALTER TABLE public.submittal_rounds ADD CONSTRAINT rounds_evidence_identity UNIQUE(id,submittal_id,project_id);
ALTER TABLE public.drawing_sets ADD CONSTRAINT drawing_sets_evidence_identity UNIQUE(id,project_id);
ALTER TABLE public.drawings ADD CONSTRAINT drawings_evidence_identity UNIQUE(id,drawing_set_id,project_id);
ALTER TABLE public.drawing_revisions ADD CONSTRAINT revisions_evidence_identity UNIQUE(id,drawing_id,project_id);

CREATE TABLE public.submittal_round_revision_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
  submittal_id uuid NOT NULL, round_id uuid NOT NULL, drawing_set_id uuid NOT NULL,
  drawing_id uuid NOT NULL, drawing_revision_id uuid NOT NULL,
  file_url text NOT NULL CHECK (btrim(file_url)<>''),
  storage_path text NOT NULL CHECK (btrim(storage_path)<>''),
  storage_object_id uuid NOT NULL, storage_version text,
  storage_updated_at timestamptz, storage_etag text, storage_metadata jsonb,
  pdf_page integer NOT NULL CHECK(pdf_page>0), revision_code text NOT NULL CHECK(btrim(revision_code)<>''),
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  capture_kind text NOT NULL CHECK(capture_kind IN ('submitted','legacy_attestation')),
  attestation text,
  CHECK(capture_kind<>'legacy_attestation' OR length(btrim(attestation))>=20),
  FOREIGN KEY(submittal_id,project_id) REFERENCES public.submittals(id,project_id),
  FOREIGN KEY(round_id,submittal_id,project_id) REFERENCES public.submittal_rounds(id,submittal_id,project_id),
  FOREIGN KEY(drawing_set_id,project_id) REFERENCES public.drawing_sets(id,project_id),
  FOREIGN KEY(drawing_id,drawing_set_id,project_id) REFERENCES public.drawings(id,drawing_set_id,project_id),
  FOREIGN KEY(drawing_revision_id,drawing_id,project_id) REFERENCES public.drawing_revisions(id,drawing_id,project_id),
  UNIQUE(round_id,drawing_revision_id), UNIQUE(round_id,drawing_id)
);
CREATE INDEX submittal_revision_evidence_project ON public.submittal_round_revision_evidence(project_id,submittal_id);
CREATE INDEX submittal_revision_evidence_revision ON public.submittal_round_revision_evidence(drawing_revision_id);
ALTER TABLE public.submittal_round_revision_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submittal_round_revision_evidence FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.submittal_round_revision_evidence TO authenticated,service_role;
CREATE POLICY evidence_project_read ON public.submittal_round_revision_evidence FOR SELECT TO authenticated
  USING ((SELECT steelbuild_security.satisfies_mfa()) AND public.user_has_project_access(project_id));

CREATE FUNCTION steelbuild_workflow.has_round_context(p_submittal_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM steelbuild_workflow.round_context
  WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND submittal_id=p_submittal_id) $$;
REVOKE ALL ON FUNCTION steelbuild_workflow.has_round_context(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION steelbuild_workflow.guard_round_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD.captured_by IS NOT NULL AND NEW.captured_by IS NULL
     AND to_jsonb(NEW)-'captured_by'=to_jsonb(OLD)-'captured_by'
     AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.captured_by) THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Submitted revision evidence cannot be changed' USING ERRCODE='42501'; END IF;
  IF NOT steelbuild_workflow.has_round_context(NEW.submittal_id) THEN
    RAISE EXCEPTION 'ROUND_WORKFLOW_REQUIRED: Capture revision evidence through the reviewed workflow' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION steelbuild_workflow.guard_round_evidence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER evidence_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.submittal_round_revision_evidence
  FOR EACH ROW EXECUTE FUNCTION steelbuild_workflow.guard_round_evidence();

CREATE FUNCTION steelbuild_workflow.guard_submittal_workflow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_sub uuid; v_shop boolean;
BEGIN
  IF TG_TABLE_NAME='submittal_rounds' THEN
    v_sub:=CASE WHEN TG_OP='DELETE' THEN OLD.submittal_id ELSE NEW.submittal_id END;
    SELECT submittal_type='Shop Drawing' INTO v_shop FROM public.submittals WHERE id=v_sub;
    IF NOT coalesce(v_shop,false) THEN RETURN coalesce(NEW,OLD); END IF;
    -- The installed admin archive command archives the parent before rounds.
    -- Preserve evidence and lifecycle fields while allowing only that tombstone.
    IF TG_OP='UPDATE' AND NOT OLD.is_deleted AND NEW.is_deleted AND NEW.deleted_at IS NOT NULL
       AND to_jsonb(NEW)-ARRAY['is_deleted','deleted_at','updated_at']=to_jsonb(OLD)-ARRAY['is_deleted','deleted_at','updated_at']
       AND coalesce(steelbuild_security.satisfies_mfa(),false)
       AND public.user_has_project_access(OLD.project_id)
       AND public.user_has_project_role_at_least(OLD.project_id,'admin')
       AND EXISTS(SELECT 1 FROM public.submittals s WHERE s.id=v_sub AND s.project_id=OLD.project_id
         AND s.is_deleted AND s.deleted_at=NEW.deleted_at) THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Shop drawing round history cannot be deleted' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id,NEW.project_id,NEW.submittal_id,NEW.round_number,NEW.drawing_set_ids,NEW.is_deleted,NEW.deleted_at)
       IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.submittal_id,OLD.round_number,OLD.drawing_set_ids,OLD.is_deleted,OLD.deleted_at) THEN
      RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Round identity and submitted package roster cannot change' USING ERRCODE='42501'; END IF;
    IF NOT steelbuild_workflow.has_round_context(v_sub) THEN
      RAISE EXCEPTION 'ROUND_WORKFLOW_REQUIRED: Change shop drawing rounds through the reviewed workflow' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE submittal_id=OLD.id) THEN
      RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Submitted history cannot be deleted' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.submittal_type IS DISTINCT FROM 'Shop Drawing' AND (TG_OP='INSERT' OR OLD.submittal_type IS DISTINCT FROM 'Shop Drawing') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'Draft' OR NEW.current_round_id IS NOT NULL THEN
      RAISE EXCEPTION 'ROUND_WORKFLOW_REQUIRED: Create a draft, then submit its reviewed revisions' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id,NEW.project_id) IS DISTINCT FROM (OLD.id,OLD.project_id) THEN
    RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Submittal identity cannot change' USING ERRCODE='42501'; END IF;
  IF (NEW.submittal_type,NEW.drawing_set_ids) IS DISTINCT FROM (OLD.submittal_type,OLD.drawing_set_ids)
     AND (OLD.status<>'Draft' OR NEW.status<>'Draft' OR OLD.current_round_id IS NOT NULL
          OR EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE submittal_id=OLD.id)) THEN
    RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Create a new draft for a different package roster' USING ERRCODE='42501'; END IF;
  IF (NEW.status,NEW.ball_in_court,NEW.submitted_date,NEW.returned_date,NEW.approved_date,
      NEW.current_round_id,NEW.total_rounds,NEW.round_number,NEW.revision,
      NEW.fab_release_override_reason,NEW.gate_override_reason,
      NEW.metadata->'ofs_checklist',NEW.metadata->'ofs_override_reason',NEW.metadata->'comment_override_reason',NEW.metadata->'workflow_substatus')
    IS DISTINCT FROM (OLD.status,OLD.ball_in_court,OLD.submitted_date,OLD.returned_date,OLD.approved_date,
      OLD.current_round_id,OLD.total_rounds,OLD.round_number,OLD.revision,
      OLD.fab_release_override_reason,OLD.gate_override_reason,
      OLD.metadata->'ofs_checklist',OLD.metadata->'ofs_override_reason',OLD.metadata->'comment_override_reason',OLD.metadata->'workflow_substatus')
    AND NOT steelbuild_workflow.has_round_context(NEW.id) THEN
    RAISE EXCEPTION 'ROUND_WORKFLOW_REQUIRED: Change shop drawing lifecycle through the reviewed workflow' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION steelbuild_workflow.guard_submittal_workflow() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aaa_submittal_round_workflow BEFORE INSERT OR UPDATE OR DELETE ON public.submittals
  FOR EACH ROW EXECUTE FUNCTION steelbuild_workflow.guard_submittal_workflow();
CREATE TRIGGER aaa_submittal_round_workflow BEFORE INSERT OR UPDATE OR DELETE ON public.submittal_rounds
  FOR EACH ROW EXECUTE FUNCTION steelbuild_workflow.guard_submittal_workflow();

CREATE FUNCTION steelbuild_workflow.guard_captured_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  IF NEW.is_current AND NEW.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ARCHIVED_REVISION: An archived revision cannot be current'; END IF;
  IF (NEW.project_id,NEW.drawing_id,NEW.file_url,NEW.pdf_page,NEW.revision_code)
     IS DISTINCT FROM (OLD.project_id,OLD.drawing_id,OLD.file_url,OLD.pdf_page,OLD.revision_code)
     AND EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE drawing_revision_id=OLD.id) THEN
    RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: Create a new revision instead of changing submitted source evidence' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION steelbuild_workflow.guard_captured_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER captured_revision_source BEFORE UPDATE ON public.drawing_revisions
  FOR EACH ROW EXECUTE FUNCTION steelbuild_workflow.guard_captured_revision();

CREATE FUNCTION public.get_submittal_revision_coverage(p_submittal_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE s public.submittals; r public.submittal_rounds;
  v_current uuid[]; v_captured uuid[]; v_missing uuid[]; v_stale uuid[];
  v_missing_current uuid[]; v_foreign uuid[]; v_empty uuid[];
  v_evidence jsonb; v_reason text; v_snapshot_changed boolean;
BEGIN
  SELECT * INTO s FROM public.submittals WHERE id=p_submittal_id;
  IF NOT FOUND OR (coalesce(auth.role(),'')<>'service_role' AND
    (NOT coalesce(steelbuild_security.satisfies_mfa(),false) OR NOT public.user_has_project_access(s.project_id))) THEN
    RAISE EXCEPTION 'Not authorized for this submittal' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.submittal_rounds WHERE id=s.current_round_id AND submittal_id=s.id AND project_id=s.project_id AND NOT is_deleted AND deleted_at IS NULL;
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_foreign FROM unnest(coalesce(s.drawing_set_ids,'{}')) x
    WHERE NOT EXISTS(SELECT 1 FROM public.drawing_sets ds WHERE ds.id=x AND ds.project_id=s.project_id AND NOT ds.is_deleted AND ds.deleted_at IS NULL)
       OR EXISTS(SELECT 1 FROM public.drawings d WHERE d.drawing_set_id=x AND d.project_id<>s.project_id AND NOT d.is_deleted AND d.deleted_at IS NULL);
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_empty FROM unnest(coalesce(s.drawing_set_ids,'{}')) x
    WHERE NOT EXISTS(SELECT 1 FROM public.drawings d WHERE d.drawing_set_id=x AND d.project_id=s.project_id AND NOT d.is_deleted AND d.deleted_at IS NULL);
  SELECT coalesce(array_agg(d.id ORDER BY d.id),'{}') INTO v_missing_current FROM public.drawings d
    WHERE d.project_id=s.project_id AND d.drawing_set_id=ANY(coalesce(s.drawing_set_ids,'{}')) AND NOT d.is_deleted AND d.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.drawing_revisions rev WHERE rev.drawing_id=d.id AND rev.project_id=s.project_id AND rev.is_current AND rev.archived_at IS NULL);
  SELECT coalesce(array_agg(rev.id ORDER BY rev.id),'{}') INTO v_current FROM public.drawings d
    JOIN public.drawing_revisions rev ON rev.drawing_id=d.id AND rev.project_id=d.project_id AND rev.is_current AND rev.archived_at IS NULL
    WHERE d.project_id=s.project_id AND d.drawing_set_id=ANY(coalesce(s.drawing_set_ids,'{}')) AND NOT d.is_deleted AND d.deleted_at IS NULL;
  SELECT coalesce(array_agg(e.drawing_revision_id ORDER BY e.drawing_revision_id),'{}'),
         coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.drawing_set_id,e.drawing_id),'[]')
    INTO v_captured,v_evidence FROM public.submittal_round_revision_evidence e WHERE e.round_id=r.id AND e.submittal_id=s.id AND e.project_id=s.project_id;
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_missing FROM unnest(v_current) x WHERE NOT x=ANY(v_captured);
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_stale FROM unnest(v_captured) x WHERE NOT x=ANY(v_current);
  SELECT EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence e JOIN public.drawing_revisions rev ON rev.id=e.drawing_revision_id
    LEFT JOIN storage.objects obj ON obj.bucket_id='app-files' AND obj.name=e.storage_path
    WHERE e.round_id=r.id AND ((e.file_url,e.pdf_page,e.revision_code) IS DISTINCT FROM (rev.file_url,rev.pdf_page,rev.revision_code)
      OR obj.id IS NULL OR (e.storage_object_id,e.storage_version,e.storage_updated_at,e.storage_etag,e.storage_metadata)
        IS DISTINCT FROM (obj.id,obj.version,obj.updated_at,coalesce(obj.metadata->>'eTag',obj.metadata->>'etag'),obj.metadata))) INTO v_snapshot_changed;
  v_reason:=CASE
    WHEN s.submittal_type IS DISTINCT FROM 'Shop Drawing' THEN 'not_shop_drawing'
    WHEN s.is_deleted OR s.deleted_at IS NOT NULL OR s.status IN ('Draft','Void') THEN 'inactive_submittal'
    WHEN cardinality(v_foreign)>0 THEN 'foreign_or_inactive_sets'
    WHEN cardinality(coalesce(s.drawing_set_ids,'{}'))=0 OR cardinality(v_empty)>0 THEN 'empty_package'
    WHEN cardinality(v_missing_current)>0 THEN 'missing_current_revision'
    WHEN r.id IS NULL OR cardinality(v_captured)=0 THEN 'missing_manifest'
    WHEN r.drawing_set_ids @> s.drawing_set_ids IS NOT TRUE OR s.drawing_set_ids @> r.drawing_set_ids IS NOT TRUE THEN 'round_roster_changed'
    WHEN r.status IS DISTINCT FROM s.status THEN 'round_status_mismatch'
    WHEN cardinality(v_missing)>0 OR cardinality(v_stale)>0 OR v_snapshot_changed THEN 'stale_manifest'
    ELSE 'complete' END;
  RETURN jsonb_build_object('project_id',s.project_id,'submittal_id',s.id,'round_id',r.id,'submittal_status',s.status,'submittal_updated_at',s.updated_at,
    'ok',v_reason='complete','reason',v_reason,'current_revision_ids',v_current,'captured_revision_ids',v_captured,
    'missing_revision_ids',v_missing,'stale_revision_ids',v_stale,'missing_current_drawing_ids',v_missing_current,
    'foreign_drawing_set_ids',v_foreign,'empty_drawing_set_ids',v_empty,'evidence',v_evidence);
END $$;
REVOKE ALL ON FUNCTION public.get_submittal_revision_coverage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_submittal_revision_coverage(uuid) TO authenticated,service_role;

CREATE FUNCTION public.get_submittal_revision_coverages(p_submittal_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $$ DECLARE result jsonb; BEGIN
  IF p_submittal_ids IS NULL OR cardinality(p_submittal_ids)>200 OR array_position(p_submittal_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'ROUND_COVERAGE_LIMIT: Supply at most 200 submittal IDs'; END IF;
  -- Portfolio/register reads need coverage IDs, not every historical PDF source
  -- snapshot. The single-record endpoint retains full evidence for review.
  SELECT coalesce(jsonb_agg(public.get_submittal_revision_coverage(id)||jsonb_build_object('evidence','[]'::jsonb) ORDER BY id),'[]') INTO result
    FROM (SELECT DISTINCT unnest(p_submittal_ids) AS id) requested;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_submittal_revision_coverages(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_submittal_revision_coverages(uuid[]) TO authenticated,service_role;

CREATE FUNCTION steelbuild_workflow.apply_round(
  p_submittal_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,p_expected_status text,
  p_expected_current_round_id uuid,p_expected_revision_ids uuid[],p_patch jsonb,p_new_round boolean,p_attestation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s public.submittals; n public.submittals; r public.submittal_rounds; rev record; v_object storage.objects;
  v_actor uuid:=auth.uid(); v_project uuid; v_payload jsonb; v_prior steelbuild_workflow.round_requests;
  v_ids uuid[]; v_expected uuid[]; v_sets uuid[]; v_round_sets uuid[]; v_capture boolean:=false;
  v_legacy boolean:=p_attestation IS NOT NULL; v_result jsonb; v_coverage jsonb; v_path text; v_org uuid;
  v_new boolean; v_number integer; v_metadata jsonb; v_source_count integer; v_require_sources boolean;
BEGIN
  SELECT project_id INTO v_project FROM public.submittals WHERE id=p_submittal_id AND NOT coalesce(is_deleted,false) AND deleted_at IS NULL;
  IF v_actor IS NULL OR v_project IS NULL OR NOT coalesce(steelbuild_security.satisfies_mfa(),false)
     OR NOT public.user_has_project_access(v_project) OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
    RAISE EXCEPTION 'ROUND_NOT_AUTHORIZED: PM access and the enrolled MFA policy must be satisfied' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR p_expected_status IS NULL OR p_expected_revision_ids IS NULL THEN
    RAISE EXCEPTION 'ROUND_REVIEW_REQUIRED: Request ID, parent version and exact revision roster are required'; END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR jsonb_typeof(coalesce(p_patch->'metadata','{}')) IS DISTINCT FROM 'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k<>ALL(ARRAY['status','ball_in_court','submitted_date','returned_date','response_notes','submitted_by','reviewer','file_url','markup_file_url','revision','approved_date','notes','required_date','fab_release_override_reason','gate_override_reason','metadata']))
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(p_patch->'metadata','{}')) k WHERE k<>ALL(ARRAY['ofs_checklist','ofs_override_reason','comment_override_reason','workflow_substatus'])) THEN
    RAISE EXCEPTION 'ROUND_PATCH_INVALID: Unsupported workflow fields'; END IF;
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_expected FROM unnest(p_expected_revision_ids) x;
  IF cardinality(v_expected)<>(SELECT count(DISTINCT x) FROM unnest(v_expected) x) OR array_position(v_expected,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'ROUND_ROSTER_INVALID: Duplicate or null revision IDs'; END IF;
  v_payload:=jsonb_build_object('submittal_id',p_submittal_id,'expected_updated_at',p_expected_updated_at,'expected_status',p_expected_status,
    'expected_round',p_expected_current_round_id,'revision_ids',v_expected,'patch',p_patch,'new_round',p_new_round,'attestation',p_attestation);
  -- Serialize replay keys before row locks; collisions never mutate parent state.
  PERFORM pg_advisory_xact_lock(hashtextextended('round-workflow:'||v_project::text||':'||p_request_id::text,0));
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) OR NOT public.user_has_project_access(v_project)
     OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
    RAISE EXCEPTION 'ROUND_NOT_AUTHORIZED: Access changed while waiting; sign in and review again' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_prior FROM steelbuild_workflow.round_requests WHERE project_id=v_project AND request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.actor_id IS DISTINCT FROM v_actor OR v_prior.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'ROUND_REQUEST_COLLISION: This request ID already records a different reviewed command'; END IF;
    RETURN v_prior.result;
  END IF;
  SELECT * INTO s FROM public.submittals WHERE id=p_submittal_id FOR UPDATE;
  IF s.project_id IS DISTINCT FROM v_project OR s.updated_at IS DISTINCT FROM p_expected_updated_at OR s.status IS DISTINCT FROM p_expected_status OR s.current_round_id IS DISTINCT FROM p_expected_current_round_id THEN
    RAISE EXCEPTION 'ROUND_STALE: Reload the submittal before applying a workflow command' USING ERRCODE='40001'; END IF;
  IF coalesce(s.is_deleted,false) OR s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'ROUND_INACTIVE: The submittal is inactive'; END IF;
  -- Returning, rejecting or voiding a package cannot grant release authority.
  -- Preserve those corrective actions even when the source register is broken.
  v_require_sources:=v_legacy OR coalesce(p_patch->>'status',s.status) NOT IN ('Draft','Void','Revise and Resubmit','Rejected');
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_sets FROM unnest(coalesce(s.drawing_set_ids,'{}')) x;
  IF s.submittal_type='Shop Drawing' THEN
    IF v_require_sources AND (cardinality(v_sets)=0 OR cardinality(v_sets)<>cardinality(s.drawing_set_ids) OR array_position(v_sets,NULL) IS NOT NULL) THEN
      RAISE EXCEPTION 'ROUND_ROSTER_INVALID: Link complete, distinct drawing sets before submission'; END IF;
    -- FOR UPDATE, not NO KEY UPDATE: immediate parent FKs block incoming sheets
    -- and revisions while the reviewed roster is locked. Refresh after waits.
    PERFORM ds.id FROM public.drawing_sets ds WHERE ds.id=ANY(v_sets) AND ds.project_id=v_project ORDER BY ds.id FOR UPDATE;
    IF v_require_sources AND EXISTS(SELECT 1 FROM unnest(v_sets) x WHERE NOT EXISTS(SELECT 1 FROM public.drawing_sets ds WHERE ds.id=x AND ds.project_id=v_project AND NOT ds.is_deleted AND ds.deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'ROUND_ROSTER_INVALID: Foreign, missing, or inactive drawing set'; END IF;
    PERFORM d.id FROM public.drawings d WHERE d.drawing_set_id=ANY(v_sets) AND d.project_id=v_project ORDER BY d.id FOR UPDATE;
    PERFORM rr.id FROM public.drawing_revisions rr JOIN public.drawings d ON d.id=rr.drawing_id
      WHERE d.drawing_set_id=ANY(v_sets) AND d.project_id=v_project AND rr.project_id=v_project ORDER BY rr.id FOR UPDATE OF rr;
    -- Lock both the current and captured source objects before checking coverage.
    -- A return approval must refresh Storage metadata after waits just as a new
    -- capture does. Storage writers hold object locks independently of drawings.
    PERFORM obj.id FROM storage.objects obj WHERE obj.bucket_id='app-files' AND obj.name IN (
      SELECT regexp_replace(rr.file_url,'^app-files/','') FROM public.drawing_revisions rr
        JOIN public.drawings d ON d.id=rr.drawing_id WHERE d.drawing_set_id=ANY(v_sets) AND d.project_id=v_project AND rr.project_id=v_project AND rr.is_current
      UNION SELECT e.storage_path FROM public.submittal_round_revision_evidence e WHERE e.round_id=s.current_round_id)
      ORDER BY obj.name,obj.id FOR SHARE;
    IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) OR NOT public.user_has_project_access(v_project)
       OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
      RAISE EXCEPTION 'ROUND_NOT_AUTHORIZED: Access changed while waiting; sign in and review again' USING ERRCODE='42501'; END IF;
    v_coverage:=public.get_submittal_revision_coverage(s.id);
    IF v_require_sources AND jsonb_array_length(v_coverage->'foreign_drawing_set_ids')>0 THEN RAISE EXCEPTION 'ROUND_ROSTER_INVALID: A linked set has inconsistent project ownership'; END IF;
    IF v_require_sources AND (jsonb_array_length(v_coverage->'missing_current_drawing_ids')>0 OR jsonb_array_length(v_coverage->'empty_drawing_set_ids')>0) THEN
      RAISE EXCEPTION 'ROUND_SOURCE_INCOMPLETE: Every linked set needs live sheets with an active exact revision; reconcile the register before submission'; END IF;
    SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),'{}') INTO v_ids FROM jsonb_array_elements_text(v_coverage->'current_revision_ids') x;
    IF v_require_sources AND v_ids IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'ROUND_STALE_ROSTER: The complete current revision roster changed; review it again' USING ERRCODE='40001'; END IF;
  ELSIF cardinality(v_expected)<>0 THEN RAISE EXCEPTION 'ROUND_ROSTER_INVALID: Non-shop submittals do not capture drawing approval evidence';
  END IF;
  SELECT * INTO r FROM public.submittal_rounds WHERE id=s.current_round_id AND submittal_id=s.id AND project_id=s.project_id FOR UPDATE;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) OR NOT public.user_has_project_access(v_project)
     OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
    RAISE EXCEPTION 'ROUND_NOT_AUTHORIZED: Access changed while waiting; sign in and review again' USING ERRCODE='42501'; END IF;
  IF s.current_round_id IS NOT NULL AND (r.id IS NULL OR r.is_deleted OR r.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ROUND_LEGACY_RECONCILIATION_REQUIRED: Current round is missing or inactive'; END IF;
  n:=jsonb_populate_record(s,p_patch-'metadata'-'response_notes'-'markup_file_url');
  n.metadata:=coalesce(s.metadata,'{}')||coalesce(p_patch->'metadata','{}');
  IF n.status IS NULL THEN RAISE EXCEPTION 'ROUND_PATCH_INVALID: A status is required'; END IF;
  IF v_legacy THEN
    IF s.submittal_type IS DISTINCT FROM 'Shop Drawing' OR s.status IN ('Draft','Void') OR length(btrim(p_attestation))<20 OR s.submitted_date IS NULL THEN
      RAISE EXCEPTION 'ROUND_ATTESTATION_REQUIRED: Inspect the transmitted source and record an explicit PM attestation (at least 20 characters) and actual submission date'; END IF;
    IF r.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE round_id=r.id) THEN
      RAISE EXCEPTION 'ROUND_EVIDENCE_IMMUTABLE: This round already has evidence; resubmit changed revisions'; END IF;
    v_new:=r.id IS NULL; v_capture:=true;
  ELSE
    v_new:=n.status IN ('Submitted','Under Review') AND (r.id IS NULL OR s.status IN ('Draft','Revise and Resubmit','Rejected'));
    IF p_new_round AND NOT v_new THEN RAISE EXCEPTION 'ROUND_TRANSITION_INVALID: A new round requires a draft or returned package'; END IF;
    IF r.id IS NULL AND NOT v_new AND v_require_sources THEN
      RAISE EXCEPTION 'ROUND_LEGACY_RECONCILIATION_REQUIRED: Reconcile or submit exact revision evidence before recording a return'; END IF;
    v_capture:=v_new AND s.submittal_type='Shop Drawing';
    IF s.submittal_type='Shop Drawing' AND NOT v_new AND n.status IN ('Submitted','Under Review','Approved','Approved as Noted','Released for Fabrication')
      AND coalesce((v_coverage->>'ok')::boolean,false)=false THEN
      RAISE EXCEPTION 'ROUND_LEGACY_RECONCILIATION_REQUIRED: Missing or stale revision evidence; reconcile the original transmission or resubmit'; END IF;
  END IF;
  IF v_new AND NOT v_legacy AND (n.submitted_date IS NULL OR nullif(btrim(n.ball_in_court),'') IS NULL) THEN
    RAISE EXCEPTION 'ROUND_TRANSMISSION_REQUIRED: Record the actual submission date and recipient'; END IF;
  INSERT INTO steelbuild_workflow.round_context VALUES(txid_current(),pg_backend_pid(),s.id);
  IF v_new THEN
    SELECT coalesce(max(round_number),0)+1 INTO v_number FROM public.submittal_rounds WHERE submittal_id=s.id;
    INSERT INTO public.submittal_rounds(project_id,submittal_id,round_number,status,ball_in_court,submitted_date,returned_date,submitted_by,reviewer,response_notes,file_url,markup_file_url,drawing_set_ids,metadata)
    VALUES(v_project,s.id,v_number,n.status,n.ball_in_court,n.submitted_date,CASE WHEN v_legacy THEN n.returned_date ELSE NULL END,n.submitted_by,n.reviewer,p_patch->>'response_notes',n.file_url,p_patch->>'markup_file_url',v_sets,jsonb_build_object('revision',n.revision)) RETURNING * INTO r;
  ELSIF r.id IS NOT NULL AND n.status NOT IN ('Draft','Void') AND NOT v_legacy THEN
    UPDATE public.submittal_rounds SET status=n.status,ball_in_court=n.ball_in_court,
      submitted_date=n.submitted_date,returned_date=n.returned_date,submitted_by=n.submitted_by,reviewer=n.reviewer,
      response_notes=CASE WHEN p_patch?'response_notes' THEN p_patch->>'response_notes' ELSE response_notes END,
      file_url=n.file_url,markup_file_url=CASE WHEN p_patch?'markup_file_url' THEN p_patch->>'markup_file_url' ELSE markup_file_url END,
      updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
  IF v_capture THEN
    SELECT org_id INTO v_org FROM public.projects WHERE id=v_project;
    -- The source locks above are still held. Same-path replacement after commit
    -- invalidates coverage; this is not immutable PDF byte retention.
    FOR rev IN SELECT rr.*,d.drawing_set_id FROM public.drawing_revisions rr JOIN public.drawings d ON d.id=rr.drawing_id WHERE rr.id=ANY(v_ids) ORDER BY rr.id LOOP
      v_path:=regexp_replace(rev.file_url,'^app-files/','');
      SELECT * INTO v_object FROM storage.objects WHERE bucket_id='app-files' AND name=v_path;
      IF v_path IS NULL OR v_path NOT LIKE v_org::text||'/uploads/%.pdf' OR v_path~'(^|/)\.\.(/|$)' OR rev.pdf_page IS NULL OR rev.pdf_page<1 OR nullif(btrim(rev.revision_code),'') IS NULL
         OR v_object.id IS NULL THEN
        RAISE EXCEPTION 'ROUND_SOURCE_INCOMPLETE: Revision % needs its existing private project PDF and confirmed 1-based page',rev.id; END IF;
      INSERT INTO public.submittal_round_revision_evidence(project_id,submittal_id,round_id,drawing_set_id,drawing_id,drawing_revision_id,file_url,storage_path,storage_object_id,storage_version,storage_updated_at,storage_etag,storage_metadata,pdf_page,revision_code,captured_by,capture_kind,attestation)
      VALUES(v_project,s.id,r.id,rev.drawing_set_id,rev.drawing_id,rev.id,rev.file_url,v_path,v_object.id,v_object.version,v_object.updated_at,coalesce(v_object.metadata->>'eTag',v_object.metadata->>'etag'),v_object.metadata,rev.pdf_page,rev.revision_code,v_actor,CASE WHEN v_legacy THEN 'legacy_attestation' ELSE 'submitted' END,p_attestation);
    END LOOP;
  END IF;
  UPDATE public.submittals SET status=n.status,ball_in_court=n.ball_in_court,submitted_date=n.submitted_date,
    returned_date=CASE WHEN v_new AND NOT v_legacy THEN NULL ELSE n.returned_date END,
    approved_date=n.approved_date,required_date=n.required_date,submitted_by=n.submitted_by,reviewer=n.reviewer,notes=n.notes,file_url=n.file_url,
    revision=n.revision,metadata=n.metadata,fab_release_override_reason=n.fab_release_override_reason,gate_override_reason=n.gate_override_reason,
    current_round_id=r.id,total_rounds=coalesce(r.round_number,s.total_rounds),round_number=coalesce(r.round_number,s.round_number),updated_at=clock_timestamp()
    WHERE id=s.id RETURNING * INTO n;
  SELECT jsonb_build_object('submittal',to_jsonb(n),'round',CASE WHEN r.id IS NULL THEN NULL ELSE to_jsonb(r) END,
    'evidence',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.drawing_set_id,e.drawing_id),'[]')) INTO v_result
    FROM public.submittal_round_revision_evidence e WHERE e.round_id=r.id;
  INSERT INTO steelbuild_workflow.round_requests(project_id,request_id,actor_id,payload,result) VALUES(v_project,p_request_id,v_actor,v_payload,v_result);
  DELETE FROM steelbuild_workflow.round_context WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND submittal_id=s.id;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION steelbuild_workflow.apply_round(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.apply_submittal_round_workflow(
  p_submittal_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,p_expected_status text,
  p_expected_current_round_id uuid,p_expected_revision_ids uuid[],p_patch jsonb,p_new_round boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT steelbuild_workflow.apply_round(p_submittal_id,p_request_id,p_expected_updated_at,p_expected_status,
  p_expected_current_round_id,p_expected_revision_ids,p_patch,p_new_round,NULL) $$;
REVOKE ALL ON FUNCTION public.apply_submittal_round_workflow(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.apply_submittal_round_workflow(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean) TO authenticated;

CREATE FUNCTION public.reconcile_submittal_round_evidence(
  p_submittal_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,p_expected_status text,
  p_expected_current_round_id uuid,p_expected_revision_ids uuid[],p_attestation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  IF p_attestation IS NULL THEN RAISE EXCEPTION 'ROUND_ATTESTATION_REQUIRED: A written PM attestation is required'; END IF;
  RETURN steelbuild_workflow.apply_round(p_submittal_id,p_request_id,p_expected_updated_at,p_expected_status,
    p_expected_current_round_id,p_expected_revision_ids,'{}',false,p_attestation);
END $$;
REVOKE ALL ON FUNCTION public.reconcile_submittal_round_evidence(uuid,uuid,timestamptz,text,uuid,uuid[],text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_submittal_round_evidence(uuid,uuid,timestamptz,text,uuid,uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_drawing_revision(p_revision_id uuid,p_release_status text DEFAULT 'released_for_field')
RETURNS public.drawing_revisions LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_rev public.drawing_revisions; v_drawing uuid; v_project uuid; v_set uuid;
BEGIN
  SELECT r.project_id,r.drawing_id,d.drawing_set_id INTO v_project,v_drawing,v_set
    FROM public.drawing_revisions r JOIN public.drawings d ON d.id=r.drawing_id WHERE r.id=p_revision_id;
  IF auth.uid() IS NULL OR NOT coalesce(steelbuild_security.satisfies_mfa(),false)
     OR NOT public.user_has_project_access(v_project) OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
    RAISE EXCEPTION 'Not authorized to publish drawing revisions' USING ERRCODE='42501'; END IF;
  IF p_release_status IS NULL OR p_release_status NOT IN ('released_for_estimate','released_for_shop','released_for_field','reviewed') THEN
    RAISE EXCEPTION 'Invalid publish status'; END IF;
  PERFORM id FROM public.drawing_sets WHERE id=v_set ORDER BY id FOR UPDATE;
  PERFORM id FROM public.drawings WHERE id=v_drawing FOR UPDATE;
  PERFORM id FROM public.drawing_revisions WHERE drawing_id=v_drawing ORDER BY id FOR UPDATE;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) OR NOT public.user_has_project_access(v_project)
     OR NOT public.user_has_project_role_at_least(v_project,'pm') THEN
    RAISE EXCEPTION 'Not authorized to publish drawing revisions' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_rev FROM public.drawing_revisions WHERE id=p_revision_id;
  IF v_rev.archived_at IS NOT NULL OR v_rev.release_status IN ('superseded','void') THEN
    RAISE EXCEPTION 'ARCHIVED_REVISION: Superseded or archived history cannot be republished'; END IF;
  IF v_rev.project_id IS DISTINCT FROM v_project OR v_rev.drawing_id IS DISTINCT FROM v_drawing
     OR NOT EXISTS(SELECT 1 FROM public.drawings d WHERE d.id=v_drawing AND d.project_id=v_project
       AND d.drawing_set_id IS NOT DISTINCT FROM v_set AND NOT d.is_deleted AND d.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ROUND_STALE_ROSTER: The revision parent changed; reload' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.drawing_revisions r WHERE r.drawing_id=v_drawing AND r.version_number>v_rev.version_number AND r.archived_at IS NULL) THEN
    RAISE EXCEPTION 'ARCHIVED_REVISION: Only the newest active revision may be published'; END IF;
  UPDATE public.drawing_revisions SET is_current=false,release_status='superseded',updated_at=clock_timestamp()
    WHERE drawing_id=v_drawing AND id<>p_revision_id AND is_current;
  UPDATE public.drawing_revisions SET is_current=true,release_status=p_release_status,updated_at=clock_timestamp()
    WHERE id=p_revision_id RETURNING * INTO v_rev;
  RETURN v_rev;
END $$;
REVOKE ALL ON FUNCTION public.publish_drawing_revision(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.publish_drawing_revision(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set(p_project_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_set public.drawing_sets%rowtype; v_sub record; v_stage text; v_blockers jsonb := '[]'::jsonb;
  v_sheets uuid[]; v_names text[]; v_rfis text[]; v_hold_names text[]; v_super text[]; v_nofile text[];
  v_undistributed text[]; v_missing_current text[]; v_missing_signoffs text[];
  v_require_signoffs boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.user_has_project_access(p_project_id) then
    raise exception 'Not authorized for this project' using errcode = '42501';
  end if;
  select * into v_set from public.drawing_sets where id = p_drawing_set_id and project_id = p_project_id and is_deleted = false and deleted_at is null;
  if not found then raise exception 'Drawing set not found in this project' using errcode = 'P0002'; end if;
  select coalesce(array_agg(d.id), '{}'::uuid[]), coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_sheets, v_names
    from public.drawings d where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null;
  select s.id, s.submittal_number,
    case
      when s.status = 'Draft' then 'IFA'
      when s.status in ('Submitted', 'Under Review') then case
        when s.ball_in_court in ('Detailer', 'Contractor', 'Subcontractor') then 'IFA'
        else 'OFA'
      end
      when s.status in ('Approved', 'Approved as Noted') then case
        when s.ball_in_court in ('EOR', 'Architect', 'AOR') then 'BFA'
        when s.ball_in_court in ('Detailer', 'Contractor', 'Subcontractor') then 'OFS'
        when s.ball_in_court in ('GC', 'Owner') then 'IFC'
        else 'BFA'
      end
      when s.status in ('Revise and Resubmit', 'Rejected') then 'R&R'
      when s.status = 'Released for Fabrication' then 'Released'
      else null
    end as stage into v_sub
    from public.submittals s where s.project_id = p_project_id and s.is_deleted = false and s.deleted_at is null and s.submittal_type = 'Shop Drawing' and s.status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Released for Fabrication') and p_drawing_set_id = any(coalesce(s.drawing_set_ids, '{}'::uuid[]))
   order by s.submitted_date desc nulls last,
            s.updated_at desc nulls last,
            coalesce(s.round_number, 1) desc,
            s.created_at desc nulls last,
            s.id desc
   limit 1;
  v_stage := coalesce(v_sub.stage, 'Not Started');
  if cardinality(v_sheets) = 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_sheets', 'title', 'The package has no sheets', 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_sub.id is null then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_submittal', 'title', 'No linked shop drawing submittal governs this package', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  elsif v_stage not in ('IFC', 'Released') then
    v_blockers := v_blockers || jsonb_build_object('kind', 'not_ifc', 'title', format('Governing submittal %s is at %s — fab release needs IFC or Released', v_sub.submittal_number, v_stage), 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb, 'submittal_number', v_sub.submittal_number, 'stage', v_stage);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_hold_names
    from public.drawing_holds h join public.drawings d on d.id = h.drawing_id
   where h.project_id = p_project_id and h.is_active = true and d.project_id = p_project_id and d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.deleted_at is null;
  if cardinality(v_hold_names) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'active_holds', 'title', format('%s sheet(s) on hold', cardinality(v_hold_names)), 'sheet_numbers', to_jsonb(v_hold_names), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(distinct x.rfi_number order by x.rfi_number), '{}'::text[]) into v_rfis from (
    select r.rfi_number from public.rfis r
     where r.project_id = p_project_id and r.is_deleted = false and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
       and (r.drawing_set_id = p_drawing_set_id or r.drawing_id = any(v_sheets))
    union
    select b.rfi_number from public.fab_release_blocking_rfis(v_sheets) b
  ) x where x.rfi_number is not null;
  if cardinality(v_rfis) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'open_rfis', 'title', format('%s open RFI(s) reference this package', cardinality(v_rfis)), 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', to_jsonb(v_rfis));
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_super from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null and d.is_superseded is true;
  if cardinality(v_super) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'superseded', 'title', format('%s sheet(s) superseded by a newer revision', cardinality(v_super)), 'sheet_numbers', to_jsonb(v_super), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_nofile from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id and d.is_deleted = false and d.deleted_at is null and nullif(btrim(d.file_url), '') is null;
  if cardinality(v_nofile) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_file', 'title', format('%s sheet(s) have no PDF attached', cardinality(v_nofile)), 'sheet_numbers', to_jsonb(v_nofile), 'rfi_numbers', '[]'::jsonb);
  end if;
  -- A PDF and an old approved submittal do not prove which revision is current.
  -- Every live sheet needs exactly one active current revision before release.
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
    into v_missing_current
    from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
     and d.is_deleted = false and d.deleted_at is null
     and not exists (
       select 1 from public.drawing_revisions rev
        where rev.drawing_id = d.id and rev.project_id = p_project_id
          and rev.is_current = true and rev.archived_at is null
     );
  if cardinality(v_missing_current) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'missing_current_revision', 'title', format('%s sheet(s) have no active current revision', cardinality(v_missing_current)), 'sheet_numbers', to_jsonb(v_missing_current), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(p.metadata ->> 'require_fab_signoffs' = 'true', false)
    into v_require_signoffs from public.projects p where p.id = p_project_id;
  if coalesce(v_require_signoffs, false) then
    -- The two signoff FKs are independent. Require both IDs to resolve to the
    -- same project, sheet, and active current revision; a stale or mislinked
    -- signoff cannot authorize the current PDF.
    select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
      into v_missing_signoffs
      from public.drawings d
     where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
       and d.is_deleted = false and d.deleted_at is null
       and not exists (
         select 1 from public.drawing_revisions rev
         join public.drawing_signoffs signoff
           on signoff.drawing_revision_id = rev.id
          and signoff.drawing_id = d.id and signoff.project_id = p_project_id
          and signoff.is_voided = false
          and signoff.stamp_type in ('approved_for_fabrication', 'approved_as_noted')
          where rev.drawing_id = d.id and rev.project_id = p_project_id
            and rev.is_current = true and rev.archived_at is null
       );
    if cardinality(v_missing_signoffs) > 0 then
      v_blockers := v_blockers || jsonb_build_object('kind', 'missing_signoffs', 'title', format('%s sheet(s) lack a valid current-revision fabrication signoff', cardinality(v_missing_signoffs)), 'sheet_numbers', to_jsonb(v_missing_signoffs), 'rfi_numbers', '[]'::jsonb);
    end if;
  end if;
  -- A new revision enters as received/pending review. An older approved
  -- submittal still linked to this set cannot clear that new current sheet.
  -- Distribution alone never grants approval; this is a blocker only.
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[])
    into v_undistributed
    from public.drawings d
    join public.drawing_revisions rev
      on rev.drawing_id = d.id and rev.project_id = p_project_id
     and rev.is_current = true and rev.archived_at is null
   where d.drawing_set_id = p_drawing_set_id and d.project_id = p_project_id
     and d.is_deleted = false and d.deleted_at is null
     and rev.release_status not in ('released_for_shop', 'released_for_field');
  if cardinality(v_undistributed) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'current_revision_not_distributed', 'title', format('%s current sheet revision(s) have not been distributed to the shop', cardinality(v_undistributed)), 'sheet_numbers', to_jsonb(v_undistributed), 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_set.set_approval_status = 'pending_review' then
    v_blockers := v_blockers || jsonb_build_object('kind', 'set_revision_pending_review', 'title', 'The drawing-set revision is pending review', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  end if;
  -- Approval belongs to the exact submitted round, across ALL linked sets.
  -- A new current revision or added/removed sheet invalidates the whole roster.
  if v_sub.id is not null and not coalesce((public.get_submittal_revision_coverage(v_sub.id)->>'ok')::boolean,false) then
    v_blockers := v_blockers || jsonb_build_object('kind','revision_manifest_mismatch',
      'title','The governing round lacks complete exact-revision evidence. Reconcile the original transmission or resubmit.',
      'sheet_numbers',to_jsonb(v_names),'rfi_numbers','[]'::jsonb,
      'coverage',public.get_submittal_revision_coverage(v_sub.id));
  end if;
  return jsonb_build_object(
    'rule_version', 'drawing-shop-v2',
    'ok', jsonb_array_length(v_blockers) = 0, 'drawing_set_id', p_drawing_set_id, 'set_name', v_set.set_name, 'sheet_count', cardinality(v_sheets),
    'sheet_ids', to_jsonb(v_sheets), 'governing_stage', v_stage, 'submittal_id', v_sub.id, 'submittal_number', v_sub.submittal_number,
    'blocking_rfi_numbers', to_jsonb(v_rfis), 'blockers', v_blockers, 'evaluated_at', now());
end;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_set(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
