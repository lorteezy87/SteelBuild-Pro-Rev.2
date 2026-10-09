CREATE TEMP TABLE round_test_results(name text PRIMARY KEY);
CREATE TEMP TABLE round_test_receipts(kind text PRIMARY KEY, result jsonb, parent_snapshot jsonb, request_id uuid);
GRANT ALL ON round_test_results,round_test_receipts TO authenticated,anon,service_role;
CREATE FUNCTION pg_temp.assert_round(name text,passed boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF passed IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',name; END IF;
 INSERT INTO round_test_results VALUES(name);
END $$;
CREATE FUNCTION pg_temp.expect_round_error(name text,sql text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN message:=SQLERRM; END;
 IF message IS NULL OR message !~ expected THEN RAISE EXCEPTION 'FAILED: %, expected %, got %',name,expected,message; END IF;
 INSERT INTO round_test_results VALUES(name);
END $$;
CREATE FUNCTION pg_temp.round_actor(user_id uuid,aal text DEFAULT 'aal2') RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal',aal)::text,true)::text IS NOT NULL;
$$;
CREATE FUNCTION pg_temp.round_command(patch jsonb,id uuid DEFAULT 'ba090000-0000-4000-8000-000000000050') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s public.submittals; roster uuid[]; BEGIN
 SELECT * INTO s FROM public.submittals WHERE submittals.id=round_command.id;
 SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),'{}') INTO roster FROM jsonb_array_elements_text(public.get_submittal_revision_coverage(id)->'current_revision_ids') x;
 IF s.submittal_type IS DISTINCT FROM 'Shop Drawing' THEN roster:='{}'; END IF;
 RETURN public.apply_submittal_round_workflow(id,gen_random_uuid(),s.updated_at,s.status,s.current_round_id,roster,patch,false);
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000010');
SELECT pg_temp.assert_round('installed workspace PM and MFA permit fixture',public.user_has_project_access('ba090000-0000-4000-8000-000000000002') AND public.user_has_project_role_at_least('ba090000-0000-4000-8000-000000000002','pm') AND steelbuild_security.satisfies_mfa());
SELECT pg_temp.assert_round('actual Storage RLS exposes own PDF metadata',(SELECT count(*)=1 FROM storage.objects WHERE name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf'));
SELECT pg_temp.expect_round_error('direct Shop submission denied',$q$UPDATE public.submittals SET status='Submitted' WHERE id='ba090000-0000-4000-8000-000000000050'$q$,'ROUND_WORKFLOW_REQUIRED');
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000011');
SELECT pg_temp.expect_round_error('viewer mutation denied',$q$SELECT pg_temp.round_command('{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}')$q$,'ROUND_NOT_AUTHORIZED');
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000012');
SELECT pg_temp.expect_round_error('stale project assignment without membership denied',$q$SELECT public.apply_submittal_round_workflow('ba090000-0000-4000-8000-000000000050',gen_random_uuid(),now(),'Draft',NULL,'{}','{}',false)$q$,'ROUND_NOT_AUTHORIZED');
SELECT pg_temp.assert_round('foreign Storage RLS hides fixture PDF',(SELECT count(*)=0 FROM storage.objects WHERE name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf'));
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000010','aal1');
SELECT pg_temp.expect_round_error('verified factor requires aal2',$q$SELECT public.apply_submittal_round_workflow('ba090000-0000-4000-8000-000000000050',gen_random_uuid(),now(),'Draft',NULL,'{}','{}',false)$q$,'ROUND_NOT_AUTHORIZED');
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000010');
SAVEPOINT unlinked_draft;
UPDATE public.submittals SET drawing_set_ids='{}' WHERE id='ba090000-0000-4000-8000-000000000050';
DO $$ BEGIN IF pg_temp.round_command('{"status":"Void"}')->'submittal'->>'status'<>'Void' THEN RAISE EXCEPTION 'Unlinked Draft could not be voided'; END IF; END $$;
ROLLBACK TO unlinked_draft;
SELECT pg_temp.assert_round('unlinked Draft can be voided without source evidence',true);
INSERT INTO round_test_receipts(kind,parent_snapshot,request_id) SELECT 'first',to_jsonb(s),gen_random_uuid() FROM public.submittals s WHERE id='ba090000-0000-4000-8000-000000000050';
UPDATE round_test_receipts SET result=public.apply_submittal_round_workflow('ba090000-0000-4000-8000-000000000050',request_id,(parent_snapshot->>'updated_at')::timestamptz,'Draft',NULL,ARRAY['ba090000-0000-4000-8000-000000000040','ba090000-0000-4000-8000-000000000041']::uuid[],'{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}',false) WHERE kind='first';
SELECT pg_temp.assert_round('atomic multi-set source capture',(SELECT jsonb_array_length(result->'evidence')=2 AND result->'submittal'->>'status'='Submitted' FROM round_test_receipts WHERE kind='first'));
SELECT pg_temp.assert_round('same command replays identical receipt',(SELECT result=public.apply_submittal_round_workflow('ba090000-0000-4000-8000-000000000050',request_id,(parent_snapshot->>'updated_at')::timestamptz,'Draft',NULL,ARRAY['ba090000-0000-4000-8000-000000000040','ba090000-0000-4000-8000-000000000041']::uuid[],'{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}',false) FROM round_test_receipts WHERE kind='first'));
SAVEPOINT rejected_to_draft;
SELECT pg_temp.round_command('{"status":"Rejected"}');
SELECT pg_temp.round_command('{"status":"Draft"}');
DO $$ BEGIN IF pg_temp.round_command('{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}')->'round'->>'round_number'<>'2' THEN RAISE EXCEPTION 'Rejected to Draft could not resubmit'; END IF; END $$;
ROLLBACK TO rejected_to_draft;
SELECT pg_temp.assert_round('Rejected to Draft can submit a new exact-source round',true);
SELECT pg_temp.expect_round_error('immutable captured page denied',$q$UPDATE public.drawing_revisions SET pdf_page=9 WHERE id='ba090000-0000-4000-8000-000000000040'$q$,'ROUND_EVIDENCE_IMMUTABLE');
SELECT pg_temp.expect_round_error('existing OFS checklist guard retained',$q$SELECT pg_temp.round_command('{"status":"Approved","ball_in_court":"GC"}')$q$,'SUBMITTAL_GATE_BLOCKED');
SELECT pg_temp.assert_round('failed approval leaves parent and round Submitted',(SELECT s.status='Submitted' AND r.status='Submitted' FROM public.submittals s JOIN public.submittal_rounds r ON r.id=s.current_round_id WHERE s.id='ba090000-0000-4000-8000-000000000050'));
SELECT pg_temp.round_command('{"status":"Approved","ball_in_court":"GC","metadata":{"ofs_checklist":{"markups_incorporated":true,"comments_addressed":true,"sheets_ready":true,"authorized_to_issue":true}}}');
SELECT pg_temp.assert_round('valid return preserves exact evidence',(public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000050')->>'ok')::boolean);
SAVEPOINT missing_pdf_correction;
RESET ROLE;
UPDATE storage.objects SET name='ba090000-0000-4000-8000-000000000001/uploads/missing-original.pdf' WHERE bucket_id='app-files' AND name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf';
SET LOCAL ROLE authenticated;
SELECT pg_temp.round_command('{"status":"Revise and Resubmit"}');
SELECT pg_temp.expect_round_error('missing PDF still denies resubmission',$q$SELECT pg_temp.round_command('{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}')$q$,'ROUND_SOURCE_INCOMPLETE');
ROLLBACK TO missing_pdf_correction;
SELECT pg_temp.assert_round('missing PDF allows correction but never resubmission',true);
SELECT pg_temp.assert_round('legacy approval has no automatic evidence',public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000051')->>'reason'='missing_manifest');
SELECT public.reconcile_submittal_round_evidence(id,gen_random_uuid(),updated_at,status,current_round_id,ARRAY['ba090000-0000-4000-8000-000000000040','ba090000-0000-4000-8000-000000000041']::uuid[],'Synthetic test PM reviewed the original transmittal and these exact revision pages.') FROM public.submittals WHERE id='ba090000-0000-4000-8000-000000000051';
SELECT pg_temp.assert_round('legacy reconciliation supports released package without current BIC',(public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000051')->>'ok')::boolean AND (SELECT status='Released for Fabrication' AND ball_in_court IS NULL FROM public.submittals WHERE id='ba090000-0000-4000-8000-000000000051'));
SELECT pg_temp.assert_round('both linked set gates accept approved exact sources',(public.evaluate_fab_release_set('ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000020')->>'ok')::boolean AND (public.evaluate_fab_release_set('ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000021')->>'ok')::boolean);
SELECT pg_temp.assert_round('non-Shop submission supported',pg_temp.round_command('{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}','ba090000-0000-4000-8000-000000000052')->'submittal'->>'status'='Submitted');
UPDATE public.drawing_revisions SET is_current=false WHERE id='ba090000-0000-4000-8000-000000000041';
INSERT INTO public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,is_current,file_url,pdf_page,release_status) VALUES
 ('ba090000-0000-4000-8000-000000000042','ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000031','B','T2','Stairs',2,true,'ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf',2,'released_for_shop');
SELECT pg_temp.assert_round('new distributed revision invalidates both set gates',NOT (public.evaluate_fab_release_set('ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000020')->>'ok')::boolean AND NOT (public.evaluate_fab_release_set('ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000021')->>'ok')::boolean);
SELECT pg_temp.round_command('{"status":"Revise and Resubmit"}');
SELECT pg_temp.assert_round('R and R captures new revision in round two',pg_temp.round_command('{"status":"Submitted","ball_in_court":"EOR","submitted_date":"2026-10-09"}')->'round'->>'round_number'='2');
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000012');
SELECT pg_temp.assert_round('real evidence RLS hides cross-workspace rows',(SELECT count(*)=0 FROM public.submittal_round_revision_evidence));
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000010','aal1');
SELECT pg_temp.assert_round('evidence RLS enforces enrolled MFA',(SELECT count(*)=0 FROM public.submittal_round_revision_evidence));
SELECT pg_temp.round_actor('ba090000-0000-4000-8000-000000000010');
RESET ROLE;
SELECT pg_temp.assert_round('public command grants exclude anon and service role',NOT has_function_privilege('anon','public.apply_submittal_round_workflow(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean)','EXECUTE') AND NOT has_function_privilege('service_role','public.apply_submittal_round_workflow(uuid,uuid,timestamptz,text,uuid,uuid[],jsonb,boolean)','EXECUTE') AND NOT has_schema_privilege('authenticated','steelbuild_workflow','USAGE'));
-- Savepoints retain none of these simulated metadata changes. The actual PDF
-- bytes are not read, written, deleted or claimed to be independently retained.
SAVEPOINT original_source;
UPDATE storage.objects SET version='replacement-version' WHERE bucket_id='app-files' AND name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf';
DO $$ BEGIN IF public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000050')->>'reason'<>'stale_manifest' THEN RAISE EXCEPTION 'Replacement version was not detected'; END IF; END $$;
ROLLBACK TO original_source;
SELECT pg_temp.assert_round('same-path object replacement invalidates approval',true);
SAVEPOINT original_source;
UPDATE storage.objects SET name='ba090000-0000-4000-8000-000000000001/uploads/moved-round-evidence.pdf' WHERE bucket_id='app-files' AND name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf';
DO $$ BEGIN IF public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000050')->>'reason'<>'stale_manifest' THEN RAISE EXCEPTION 'Missing source object was not detected'; END IF; END $$;
ROLLBACK TO original_source;
SELECT pg_temp.assert_round('missing original object invalidates approval',true);
SAVEPOINT original_source;
UPDATE storage.objects SET metadata=coalesce(metadata,'{}')||'{"contentType":"application/octet-stream"}' WHERE bucket_id='app-files' AND name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf';
DO $$ BEGIN IF public.get_submittal_revision_coverage('ba090000-0000-4000-8000-000000000050')->>'reason'<>'stale_manifest' THEN RAISE EXCEPTION 'Changed source metadata was not detected'; END IF; END $$;
ROLLBACK TO original_source;
SELECT pg_temp.assert_round('metadata mutation invalidates approval',true);
SAVEPOINT original_authorship;
INSERT INTO round_test_receipts(kind,result) SELECT 'authorship',jsonb_agg(to_jsonb(e)-'captured_by' ORDER BY e.id) FROM public.submittal_round_revision_evidence e WHERE e.project_id='ba090000-0000-4000-8000-000000000002';
DELETE FROM auth.users WHERE id='ba090000-0000-4000-8000-000000000010';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE project_id='ba090000-0000-4000-8000-000000000002' AND captured_by IS NOT NULL)
 OR (SELECT jsonb_agg(to_jsonb(e)-'captured_by' ORDER BY e.id) FROM public.submittal_round_revision_evidence e WHERE e.project_id='ba090000-0000-4000-8000-000000000002') IS DISTINCT FROM (SELECT result FROM round_test_receipts WHERE kind='authorship')
 THEN RAISE EXCEPTION 'Auth removal changed immutable evidence'; END IF; END $$;
ROLLBACK TO original_authorship;
SELECT pg_temp.assert_round('actual Auth FK cleanup retains all source snapshots',true);
-- Existing hard erasure is an administrative command. Test only the synthetic
-- archived project, with the fixture actor explicitly promoted for this case.
UPDATE public.organization_members SET role='admin' WHERE org_id='ba090000-0000-4000-8000-000000000001' AND user_id='ba090000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
SELECT public.soft_delete_project('ba090000-0000-4000-8000-000000000002');
SELECT public.hard_delete_project('ba090000-0000-4000-8000-000000000002','Rollback-only submittal evidence acceptance');
RESET ROLE;
SELECT pg_temp.assert_round('actual authorized project erasure clears private receipts',NOT EXISTS(SELECT 1 FROM steelbuild_workflow.round_requests WHERE project_id='ba090000-0000-4000-8000-000000000002') AND NOT EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE project_id='ba090000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_round('successful commands leave no private bypass context',NOT EXISTS(SELECT 1 FROM steelbuild_workflow.round_context));
DO $$ BEGIN IF (SELECT count(*) FROM round_test_results)<>31 THEN RAISE EXCEPTION 'Expected 31 hosted assertions'; END IF; END $$;
