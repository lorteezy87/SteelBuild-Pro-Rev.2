-- Only synthetic fixtures. Actual installed policies and triggers stay enabled.
CREATE TEMP TABLE project_limit_results(name text PRIMARY KEY, passed boolean NOT NULL);
CREATE TEMP TABLE project_limit_context(project_id uuid);
GRANT SELECT,INSERT ON project_limit_results,project_limit_context TO authenticated,service_role,anon;
CREATE FUNCTION pg_temp.assert_limit(p_name text,p_ok boolean) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
 IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Project capacity acceptance failed: %',p_name; END IF;
 INSERT INTO project_limit_results VALUES(p_name,true);
END $$;
CREATE FUNCTION pg_temp.expect_limit_error(p_name text,p_sql text,p_code text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$ DECLARE v_code text; BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
 PERFORM pg_temp.assert_limit(p_name,v_code=p_code);
END $$;
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('ca090000-0000-4000-8000-000000000010','project-cap-owner@example.invalid','{}','{}'),
 ('ca090000-0000-4000-8000-000000000011','project-cap-member@example.invalid','{}','{}'),
 ('ca090000-0000-4000-8000-000000000012','project-cap-foreign@example.invalid','{}','{}');
INSERT INTO public.organizations(id,name,plan) VALUES
 ('ca090000-0000-4000-8000-000000000001','Rollback-only project capacity','free'),
 ('ca090000-0000-4000-8000-000000000002','Rollback-only foreign capacity','free');
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('ca090000-0000-4000-8000-000000000001','ca090000-0000-4000-8000-000000000010','owner'),
 ('ca090000-0000-4000-8000-000000000001','ca090000-0000-4000-8000-000000000011','member'),
 ('ca090000-0000-4000-8000-000000000002','ca090000-0000-4000-8000-000000000012','owner');
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO project_limit_context(project_id)
 SELECT (public.create_project('{"org_id":"ca090000-0000-4000-8000-000000000001","name":"  Capacity test  ","project_number":"CAP-ROLLBACK-01","joist_manufacturer":"Synthetic joists","deck_manufacturer":"Synthetic deck","retainage_percent":5,"metadata":{"capacity_acceptance":true}}')->>'id')::uuid;
SELECT pg_temp.assert_limit('RPC preserves live creation fields',EXISTS(SELECT 1 FROM public.projects p JOIN project_limit_context c ON c.project_id=p.id WHERE p.name='Capacity test' AND p.joist_manufacturer='Synthetic joists' AND p.deck_manufacturer='Synthetic deck' AND p.retainage_percent=5 AND p.metadata->>'capacity_acceptance'='true'));
SELECT pg_temp.assert_limit('RPC assigns the creator as owner',EXISTS(SELECT 1 FROM public.user_projects up JOIN project_limit_context c ON c.project_id=up.project_id WHERE up.user_id='ca090000-0000-4000-8000-000000000010' AND up.role='owner'));
SELECT pg_temp.expect_limit_error('Direct authenticated INSERT cannot bypass Free cap',$q$INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000001','Forbidden extra','CAP-EXTRA')$q$,'P0001');
SELECT pg_temp.expect_limit_error('Normal RPC also denies the second Free project',$q$SELECT public.create_project('{"org_id":"ca090000-0000-4000-8000-000000000001","name":"Forbidden second RPC","project_number":"CAP-RPC-EXTRA"}')$q$,'P0001');
SELECT pg_temp.expect_limit_error('Foreign workspace insert remains forbidden',$q$INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000002','Foreign','CAP-FOREIGN')$q$,'42501');
SELECT pg_temp.expect_limit_error('Trigger helper cannot be invoked as RPC','SELECT public.enforce_project_plan_limit()','42501');
SELECT pg_temp.assert_limit('Failed creates leave one active project',(SELECT count(*)=1 FROM public.projects WHERE org_id='ca090000-0000-4000-8000-000000000001'));
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"service_role"}',true);
SELECT pg_temp.expect_limit_error('Maintenance admission still observes cap',$q$INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000001','Maintenance extra','CAP-MAINT')$q$,'P0001');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_limit_error('Service-role admission still observes cap',$q$INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000001','Service extra','CAP-SERVICE')$q$,'P0001');
RESET ROLE;
UPDATE public.organizations SET plan='pro' WHERE id='ca090000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.projects(id,org_id,name,project_number) VALUES
 ('ca090000-0000-4000-8000-000000000020','ca090000-0000-4000-8000-000000000001','Archived capacity test','CAP-ARCHIVED');
SELECT public.soft_delete_project('ca090000-0000-4000-8000-000000000020');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"service_role"}',true);
UPDATE public.organizations SET plan='free' WHERE id='ca090000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_limit('Archived row is admitted without consuming an active slot',(SELECT count(*)=1 FROM public.projects WHERE org_id='ca090000-0000-4000-8000-000000000001' AND NOT coalesce(is_deleted,false)));
SELECT pg_temp.expect_limit_error('Privileged restore at capacity is denied',$q$UPDATE public.projects SET is_deleted=false WHERE id='ca090000-0000-4000-8000-000000000020'$q$,'P0001');
UPDATE public.organizations SET plan='pro' WHERE id='ca090000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',true);
SELECT pg_temp.expect_limit_error('Privileged restore rejects acting non-admin',$q$UPDATE public.projects SET is_deleted=false WHERE id='ca090000-0000-4000-8000-000000000020'$q$,'42501');
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
UPDATE public.projects SET is_deleted=false WHERE id='ca090000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_limit('Authorized privileged restore consumes the second slot',(SELECT count(*)=2 FROM public.projects WHERE org_id='ca090000-0000-4000-8000-000000000001' AND NOT coalesce(is_deleted,false)));
SET LOCAL ROLE authenticated;
INSERT INTO public.projects(org_id,name,project_number)
 SELECT 'ca090000-0000-4000-8000-000000000001','Synthetic Pro '||n,'CAP-PRO-'||n FROM generate_series(1,8) n;
SELECT pg_temp.assert_limit('Pro permits exactly ten active projects',(SELECT count(*)=10 FROM public.projects WHERE org_id='ca090000-0000-4000-8000-000000000001'));
SELECT pg_temp.expect_limit_error('Pro eleventh direct project denied',$q$INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000001','Eleventh','CAP-11')$q$,'P0001');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"service_role"}',true);
UPDATE public.organizations SET plan='business' WHERE id='ca090000-0000-4000-8000-000000000001';
INSERT INTO public.projects(org_id,name,project_number) VALUES('ca090000-0000-4000-8000-000000000001','Business eleventh','CAP-BUSINESS');
SELECT pg_temp.assert_limit('Business keeps existing unlimited policy',(SELECT count(*)=11 FROM public.projects WHERE org_id='ca090000-0000-4000-8000-000000000001'));
UPDATE public.organizations SET plan='free' WHERE id='ca090000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"ca090000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.projects SET notes='Existing projects remain usable' WHERE id=(SELECT project_id FROM project_limit_context);
SELECT pg_temp.assert_limit('Existing project remains editable after downgrade',EXISTS(SELECT 1 FROM public.projects WHERE id=(SELECT project_id FROM project_limit_context) AND notes='Existing projects remain usable'));
SELECT pg_temp.expect_limit_error('Downgrade denies additional admission',$q$SELECT public.create_project('{"org_id":"ca090000-0000-4000-8000-000000000001","name":"Downgrade extra","project_number":"CAP-DOWNGRADE"}')$q$,'P0001');
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM project_limit_results)<>18 THEN RAISE EXCEPTION 'Expected 18 hosted capacity assertions'; END IF; END $$;
