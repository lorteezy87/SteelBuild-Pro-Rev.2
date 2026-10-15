-- UNINSTALLED SOURCE CANDIDATE. Third ordered component, after atomic commands
-- and adopted-source protection. An empty review manifest deliberately leaves
-- capabilities false. No customer backfill, ledger stamp or hosted authority.
BEGIN;

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

CREATE FUNCTION steelbuild_drawing_revision.catalog_fingerprint() RETURNS text
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
  RETURN encode(sha256(convert_to(v_catalog::text,'UTF8')),'hex');
END $$;
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
COMMIT;
