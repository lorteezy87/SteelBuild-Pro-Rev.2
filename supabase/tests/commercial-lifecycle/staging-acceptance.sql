-- STAGING ONLY: this file rolls back all fixture changes. For a rehearsal of
-- unapplied SQL, remove its BEGIN/COMMIT wrappers and run those bodies inside
-- this transaction before CREATE TEMP TABLE below.
-- It writes only fixed synthetic UUIDs, keeps actual RLS/triggers enabled, and
-- expects the three reviewed commercial APIs to be installed in the transaction.
-- No fixture rows or schema changes may be committed by this acceptance harness.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE commercial_acceptance_results(name text PRIMARY KEY, passed boolean NOT NULL);
GRANT SELECT, INSERT ON commercial_acceptance_results TO authenticated, anon;
CREATE FUNCTION pg_temp.assert_commercial(p_name text, p_ok boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Commercial acceptance failed: %',p_name; END IF;
  INSERT INTO commercial_acceptance_results VALUES(p_name,true);
END $$;
CREATE FUNCTION pg_temp.expect_commercial_error(p_name text,p_sql text,p_codes text[]) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_code text;
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
  PERFORM pg_temp.assert_commercial(p_name,v_code=ANY(p_codes));
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('91c70000-0000-4000-8000-000000000001','commercial-pm-rollback@example.invalid','{}'),
 ('91c70000-0000-4000-8000-000000000002','commercial-field-rollback@example.invalid','{}'),
 ('91c70000-0000-4000-8000-000000000003','commercial-viewer-rollback@example.invalid','{}'),
 ('91c70000-0000-4000-8000-000000000004','commercial-outsider-rollback@example.invalid','{}');
INSERT INTO public.organizations(id,name,member_default_project_role,plan) VALUES
 ('91c70000-0000-4000-8000-000000000011','Commercial rollback acceptance','pm','enterprise'),
 ('91c70000-0000-4000-8000-000000000012','Foreign commercial rollback acceptance','pm','enterprise');
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('91c70000-0000-4000-8000-000000000011','91c70000-0000-4000-8000-000000000001','member'),
 ('91c70000-0000-4000-8000-000000000011','91c70000-0000-4000-8000-000000000002','member'),
 ('91c70000-0000-4000-8000-000000000011','91c70000-0000-4000-8000-000000000003','member'),
 ('91c70000-0000-4000-8000-000000000012','91c70000-0000-4000-8000-000000000004','member');
-- Project seeding calls the real numbered Action Item helper, which requires
-- an authorized synthetic actor even when the fixture connection is postgres.
SELECT set_config('request.jwt.claims','{"sub":"91c70000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
INSERT INTO public.projects(id,org_id,name) VALUES
 ('91c70000-0000-4000-8000-000000000021','91c70000-0000-4000-8000-000000000011','Synthetic commercial acceptance');
SELECT set_config('request.jwt.claims','{"sub":"91c70000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
INSERT INTO public.projects(id,org_id,name) VALUES
 ('91c70000-0000-4000-8000-000000000022','91c70000-0000-4000-8000-000000000012','Foreign synthetic commercial acceptance');
UPDATE public.organizations SET member_default_project_role=null WHERE id IN ('91c70000-0000-4000-8000-000000000011','91c70000-0000-4000-8000-000000000012');
INSERT INTO public.cost_codes(id,project_id,cost_code_number,description) VALUES
 ('91c70000-0000-4000-8000-000000000071','91c70000-0000-4000-8000-000000000022','ROLLBACK-FOREIGN','Foreign fixture cost code');
INSERT INTO public.user_projects(project_id,user_id,role) VALUES
 ('91c70000-0000-4000-8000-000000000021','91c70000-0000-4000-8000-000000000001','pm'),
 ('91c70000-0000-4000-8000-000000000021','91c70000-0000-4000-8000-000000000002','field'),
 ('91c70000-0000-4000-8000-000000000021','91c70000-0000-4000-8000-000000000003','viewer'),
 ('91c70000-0000-4000-8000-000000000022','91c70000-0000-4000-8000-000000000004','pm');
INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES
 ('91c70000-0000-4000-8000-000000000031','91c70000-0000-4000-8000-000000000001','totp','verified',now(),now());
SELECT set_config('steelbuild.co_rpc','on',true),set_config('steelbuild.cost_rpc','on',true);
INSERT INTO public.sov_items(id,project_id,line_item_number,description,scheduled_value,updated_at) VALUES
 ('91c70000-0000-4000-8000-000000000041','91c70000-0000-4000-8000-000000000021',9999,'Synthetic steel SOV',1000,'2026-10-01T00:00:00Z');
INSERT INTO public.change_orders(id,project_id,co_number,title,status,co_amount,updated_at) VALUES
 ('91c70000-0000-4000-8000-000000000051','91c70000-0000-4000-8000-000000000021','CO-ROLLBACK-1','Connection change','Submitted',400,'2026-10-01T00:00:00Z'),
 ('91c70000-0000-4000-8000-000000000052','91c70000-0000-4000-8000-000000000021','CO-ROLLBACK-2','Invalid deduct','Submitted',-2000,'2026-10-01T00:00:00Z');
SELECT set_config('steelbuild.co_rpc','',true),set_config('steelbuild.cost_rpc','',true);
SELECT set_config('request.jwt.claims','{"sub":"91c70000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_commercial('PM reviewed approval adjusts SOV and project total',
 (public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000051','2026-10-01T00:00:00Z','Submitted',400,
 '{"title":"Reviewed connection change","status":"Approved","approved_by":"Synthetic GC","approved_date":"2026-10-08","sov_mode":"adjust_line","sov_line_item_id":"91c70000-0000-4000-8000-000000000041"}')->>'status')='Approved');
SELECT pg_temp.assert_commercial('SOV retains exact approved adjustment',
 (SELECT scheduled_value=1400 AND change_order_id='91c70000-0000-4000-8000-000000000051'::uuid FROM public.sov_items WHERE id='91c70000-0000-4000-8000-000000000041'));
SELECT pg_temp.assert_commercial('Project approved change total agrees',
 (SELECT approved_change_total=400 FROM public.projects WHERE id='91c70000-0000-4000-8000-000000000021'));
SELECT pg_temp.expect_commercial_error('Stale SOV rejects metadata and old value',
 $q$SELECT public.save_sov_item_reviewed('91c70000-0000-4000-8000-000000000041','2026-10-01T00:00:00Z','{"description":"Must not persist","scheduled_value":1000}')$q$,ARRAY['40001']);
SELECT pg_temp.assert_commercial('Stale SOV leaves amount and description unchanged',
 (SELECT scheduled_value=1400 AND description='Synthetic steel SOV' FROM public.sov_items WHERE id='91c70000-0000-4000-8000-000000000041'));
SELECT pg_temp.expect_commercial_error('Stale CO rejects metadata and lifecycle together',
 $q$SELECT public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000051','2026-10-01T00:00:00Z','Submitted',400,'{"title":"Must not persist"}')$q$,ARRAY['40001']);
SELECT pg_temp.expect_commercial_error('Invalid deduct rolls back ordinary edits',
 $q$SELECT public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000052','2026-10-01T00:00:00Z','Submitted',-2000,'{"title":"Must not persist","status":"Approved","approved_by":"Synthetic GC","sov_mode":"adjust_line","sov_line_item_id":"91c70000-0000-4000-8000-000000000041"}')$q$,ARRAY['23514']);
SELECT pg_temp.assert_commercial('Deduct rollback retains original CO',
 (SELECT status='Submitted' AND title='Invalid deduct' FROM public.change_orders WHERE id='91c70000-0000-4000-8000-000000000052'));
SELECT pg_temp.assert_commercial('Fresh SOV edit preserves adjusted amount',
 (SELECT (public.save_sov_item_reviewed(id,updated_at,'{"description":"Reviewed SOV","current_percent_complete":50}')->>'scheduled_value')::numeric=1400 FROM public.sov_items WHERE id='91c70000-0000-4000-8000-000000000041'));
SELECT pg_temp.expect_commercial_error('PM cannot void a reviewed CO',
 $q$SELECT public.save_change_order_reviewed(id,updated_at,status,co_amount,'{"status":"Void","void_reason":"Test"}') FROM public.change_orders WHERE id='91c70000-0000-4000-8000-000000000051'$q$,ARRAY['42501']);
SELECT pg_temp.expect_commercial_error('Approved CO amount remains frozen',
 $q$SELECT public.save_change_order_reviewed(id,updated_at,status,co_amount,'{"co_amount":9999}') FROM public.change_orders WHERE id='91c70000-0000-4000-8000-000000000051'$q$,ARRAY['42501']);
SELECT pg_temp.expect_commercial_error('SOV provenance is immutable',
 $q$SELECT public.save_sov_item_reviewed(id,updated_at,'{"change_order_id":null}') FROM public.sov_items WHERE id='91c70000-0000-4000-8000-000000000041'$q$,ARRAY['22023']);
SELECT pg_temp.expect_commercial_error('Cross-project CO cost link is rejected',
 $q$SELECT public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000052','2026-10-01T00:00:00Z','Submitted',-2000,'{"cost_code_id":"91c70000-0000-4000-8000-000000000071"}')$q$,ARRAY['23503']);
SELECT pg_temp.assert_commercial('Atomic create replay returns same official record',
 (public.create_numbered_record('91c70000-0000-4000-8000-000000000021','sov_items','91c70000-0000-4000-8000-000000000061','{"description":"Receipt SOV","scheduled_value":250}') ->>'id') =
 (public.create_numbered_record('91c70000-0000-4000-8000-000000000021','sov_items','91c70000-0000-4000-8000-000000000061','{"description":"Receipt SOV","scheduled_value":250}') ->>'id'));
SELECT pg_temp.expect_commercial_error('Receipt payload mismatch fails closed',
 $q$SELECT public.create_numbered_record('91c70000-0000-4000-8000-000000000021','sov_items','91c70000-0000-4000-8000-000000000061','{"description":"Changed payload","scheduled_value":250}')$q$,ARRAY['22023']);
SELECT pg_temp.expect_commercial_error('Receipts are not client-readable',
 'SELECT * FROM public.numbered_create_receipts',ARRAY['42501']);
SELECT set_config('request.jwt.claims','{"sub":"91c70000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SELECT pg_temp.expect_commercial_error('Enrolled AAL1 cannot save SOV',
 $q$SELECT public.save_sov_item_reviewed('91c70000-0000-4000-8000-000000000041',now(),'{}')$q$,ARRAY['42501']);
SELECT pg_temp.expect_commercial_error('Enrolled AAL1 cannot save CO',
 $q$SELECT public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000052','2026-10-01T00:00:00Z','Submitted',-2000,'{}')$q$,ARRAY['42501']);
DO $$ DECLARE actor text; BEGIN
 FOREACH actor IN ARRAY ARRAY['91c70000-0000-4000-8000-000000000002','91c70000-0000-4000-8000-000000000003','91c70000-0000-4000-8000-000000000004'] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
  PERFORM pg_temp.expect_commercial_error('CO role isolation '||actor,
   $q$SELECT public.save_change_order_reviewed('91c70000-0000-4000-8000-000000000052','2026-10-01T00:00:00Z','Submitted',-2000,'{"title":"Denied"}')$q$,ARRAY['42501','P0002']);
  PERFORM pg_temp.expect_commercial_error('SOV role isolation '||actor,
   $q$SELECT public.save_sov_item_reviewed('91c70000-0000-4000-8000-000000000041',now(),'{"description":"Denied"}')$q$,ARRAY['42501','P0002']);
 END LOOP;
END $$;
RESET ROLE;
SELECT pg_temp.assert_commercial('Real SOV audit records reviewed update',EXISTS(
 SELECT 1 FROM public.pma_audit_logs WHERE entity_id='91c70000-0000-4000-8000-000000000041'
 AND action='UPDATE' AND new_values->>'description'='Reviewed SOV'));
SELECT pg_temp.assert_commercial('Numbered SOV replay creates one receipt',
 (SELECT count(*)=1 FROM public.numbered_create_receipts WHERE project_id='91c70000-0000-4000-8000-000000000021'));
DELETE FROM public.organization_members WHERE user_id='91c70000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"91c70000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_commercial_error('Removed workspace member cannot replay receipt',
 $q$SELECT public.create_numbered_record('91c70000-0000-4000-8000-000000000021','sov_items','91c70000-0000-4000-8000-000000000061','{"description":"Receipt SOV","scheduled_value":250}')$q$,ARRAY['42501']);
SELECT pg_temp.expect_commercial_error('Removed workspace member cannot edit SOV',
 $q$SELECT public.save_sov_item_reviewed('91c70000-0000-4000-8000-000000000041',now(),'{"description":"Denied"}')$q$,ARRAY['42501','P0002']);
RESET ROLE;
SELECT pg_temp.assert_commercial('Reviewed APIs have authenticated-only execution',NOT EXISTS(
 SELECT 1 FROM unnest(ARRAY['anon','service_role']) r CROSS JOIN unnest(ARRAY[
 'public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb)',
 'public.save_sov_item_reviewed(uuid,timestamptz,jsonb)']) f WHERE has_function_privilege(r,f,'EXECUTE')));
SELECT count(*) AS passed, jsonb_agg(name ORDER BY name) AS checks FROM commercial_acceptance_results;
ROLLBACK;
