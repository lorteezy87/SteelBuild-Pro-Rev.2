-- STAGING ONLY. This harness always rolls back its synthetic rows.
-- To rehearse unapplied SQL, insert the exact candidate body (without its
-- BEGIN/COMMIT wrappers) after the timeout settings and before the temp table.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE membership_acceptance_results(name text PRIMARY KEY,passed boolean NOT NULL);
GRANT SELECT,INSERT ON membership_acceptance_results TO authenticated;
CREATE FUNCTION pg_temp.assert_membership(p_name text,p_ok boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
 IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Membership acceptance failed: %',p_name; END IF;
 INSERT INTO membership_acceptance_results VALUES(p_name,true);
END $$;
CREATE FUNCTION pg_temp.expect_membership_denial(p_name text,p_sql text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$ DECLARE v_code text; BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE; END;
 PERFORM pg_temp.assert_membership(p_name,v_code='42501');
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT ('91d80000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'membership-'||n||'-rollback@example.invalid','{}'::jsonb FROM generate_series(1,7) n;
INSERT INTO public.organizations(id,name,plan,member_default_project_role) VALUES
 ('91d80000-0000-4000-8000-000000000011','Membership rollback acceptance','enterprise',null),
 ('91d80000-0000-4000-8000-000000000012','Foreign membership rollback acceptance','enterprise',null);
INSERT INTO public.organization_members(org_id,user_id,role)
SELECT '91d80000-0000-4000-8000-000000000011'::uuid,
 ('91d80000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=1 THEN 'owner' ELSE 'member' END FROM generate_series(1,6) n;
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('91d80000-0000-4000-8000-000000000012','91d80000-0000-4000-8000-000000000007','owner');
SELECT set_config('request.jwt.claims','{"sub":"91d80000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
INSERT INTO public.projects(id,org_id,name) VALUES
 ('91d80000-0000-4000-8000-000000000021','91d80000-0000-4000-8000-000000000011','Synthetic membership active project'),
 ('91d80000-0000-4000-8000-000000000022','91d80000-0000-4000-8000-000000000011','Synthetic membership archived project');
INSERT INTO public.user_projects(project_id,user_id,role)
SELECT p.id,('91d80000-0000-4000-8000-'||lpad(r.n::text,12,'0'))::uuid,r.role
FROM (VALUES(2,'viewer'),(3,'field'),(4,'pm'),(5,'admin'),(6,'owner'),(7,'admin')) r(n,role)
CROSS JOIN (VALUES('91d80000-0000-4000-8000-000000000021'::uuid),('91d80000-0000-4000-8000-000000000022'::uuid)) p(id);

SELECT set_config('request.jwt.claims','{"sub":"91d80000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_membership('Current explicit admin can read active project',
 (SELECT count(*)=1 FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000021'));
SELECT public.soft_delete_project('91d80000-0000-4000-8000-000000000022');
SELECT pg_temp.assert_membership('Current explicit admin retains archived-project role',
 public.user_has_project_role_at_least('91d80000-0000-4000-8000-000000000022','admin')
 AND public.user_has_project_role('91d80000-0000-4000-8000-000000000022','admin')
 AND public.get_my_project_role('91d80000-0000-4000-8000-000000000022')='admin');
SELECT pg_temp.assert_membership('Archived project is absent from ordinary project reads',
 (SELECT count(*)=0 FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000022'));
SELECT pg_temp.assert_membership('Current project admin can census actual archived dependencies',
 (public.project_row_counts('91d80000-0000-4000-8000-000000000022')->>'action_items')::integer>0);
SELECT set_config('request.jwt.claims','{"sub":"91d80000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SELECT pg_temp.assert_membership('Current workspace owner can census actual archived dependencies',
 (public.project_row_counts('91d80000-0000-4000-8000-000000000022')->>'action_items')::integer>0);
RESET ROLE;
SELECT pg_temp.assert_membership('Actual project archive trigger stamped deletion',
 (SELECT is_deleted AND deleted_at IS NOT NULL FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000022'));
DELETE FROM public.organization_members
WHERE org_id='91d80000-0000-4000-8000-000000000011' AND user_id<>'91d80000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; actor text; BEGIN
 FOR r IN SELECT * FROM (VALUES(2,'viewer'),(3,'field'),(4,'pm'),(5,'admin'),(6,'owner'),(7,'foreign admin')) x(n,label) LOOP
  actor:='91d80000-0000-4000-8000-'||lpad(r.n::text,12,'0');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','aal','aal2')::text,true);
  PERFORM pg_temp.assert_membership(r.label||' has no minimum project authority',
   NOT public.user_has_project_role_at_least('91d80000-0000-4000-8000-000000000021','viewer'));
  PERFORM pg_temp.assert_membership(r.label||' has no exact project authority',
   NOT public.user_has_project_role('91d80000-0000-4000-8000-000000000021',CASE WHEN r.n=7 THEN 'admin' ELSE r.label END));
  PERFORM pg_temp.assert_membership(r.label||' has no resolved project role',
   public.get_my_project_role('91d80000-0000-4000-8000-000000000021') IS NULL);
  PERFORM pg_temp.assert_membership(r.label||' cannot read through actual project policy',
   NOT EXISTS(SELECT 1 FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000021'));
  PERFORM pg_temp.expect_membership_denial(r.label||' cannot archive through definer RPC',
   $q$SELECT public.soft_delete_project('91d80000-0000-4000-8000-000000000021')$q$);
  PERFORM pg_temp.expect_membership_denial(r.label||' cannot census archived dependencies',
   $q$SELECT public.project_row_counts('91d80000-0000-4000-8000-000000000022')$q$);
  PERFORM pg_temp.expect_membership_denial(r.label||' cannot erase archived project',
   $q$SELECT public.hard_delete_project('91d80000-0000-4000-8000-000000000022','Synthetic rollback acceptance')$q$);
 END LOOP;
END $$;
RESET ROLE;
SELECT pg_temp.assert_membership('Denied archives left active project unchanged',
 (SELECT NOT is_deleted AND deleted_at IS NULL FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000021'));
SELECT set_config('request.jwt.claims','{"sub":"91d80000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_membership('Current workspace owner can erase the archived synthetic project',
 (public.hard_delete_project('91d80000-0000-4000-8000-000000000022','Synthetic rollback acceptance')->>'project_id')='91d80000-0000-4000-8000-000000000022');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.assert_membership('Actual erasure removed the archived project and dependencies',
 NOT EXISTS(SELECT 1 FROM public.projects WHERE id='91d80000-0000-4000-8000-000000000022')
 AND public.project_row_counts('91d80000-0000-4000-8000-000000000022')='{}'::jsonb);
SELECT pg_temp.assert_membership('Actual erasure retained its audit receipt',
 EXISTS(SELECT 1 FROM public.data_erasure_log WHERE project_id='91d80000-0000-4000-8000-000000000022'
 AND requested_by='91d80000-0000-4000-8000-000000000001' AND reason='Synthetic rollback acceptance'));
SELECT pg_temp.assert_membership('Candidate preserves authenticated-only helper execution',
 NOT EXISTS(SELECT 1 FROM unnest(ARRAY['public.user_has_project_role(uuid,text)',
 'public.get_my_project_role(uuid)','public.user_has_project_role_at_least(uuid,text)']) f
 WHERE NOT has_function_privilege('authenticated',f,'execute') OR has_function_privilege('anon',f,'execute') OR has_function_privilege('service_role',f,'execute')));
SELECT count(*) AS passed,jsonb_agg(name ORDER BY name) AS checks FROM membership_acceptance_results;
ROLLBACK;
