-- Run only in a disposable database with the canonical schema and real auth/RBAC
-- functions. Fixture insertion suppresses triggers; acceptance restores them and
-- uses authenticated with real organization/project memberships. All rows roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id, email) VALUES
 ('10000000-0000-0000-0000-000000000001', 'field@example.invalid'),
 ('10000000-0000-0000-0000-000000000002', 'pm@example.invalid'),
 ('10000000-0000-0000-0000-000000000003', 'outsider@example.invalid');
INSERT INTO public.organizations(id, name, member_default_project_role)
 VALUES ('20000000-0000-0000-0000-000000000001', 'Synthetic reconciliation test', NULL);
INSERT INTO public.projects(id, org_id, name, piece_control_mode)
 VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Synthetic project', 'pilot');
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','member'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','member');
INSERT INTO public.user_projects(project_id,user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','field'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','pm');
INSERT INTO public.pieces(id,project_id,piece_mark,is_container)
 VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','SET-ONLY',false);
INSERT INTO public.piece_drawing_sets(project_id,piece_id,drawing_set_id)
 VALUES ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
INSERT INTO public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title)
 VALUES ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','A','S1','Synthetic');
INSERT INTO public.drawing_impacts(id,project_id,drawing_revision_id,impact_type,title)
 VALUES ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','fabrication','Original');
INSERT INTO public.email_integration_settings(id,project_id,mailbox_address)
 VALUES ('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','test@example.invalid');
SET LOCAL session_replication_role = origin;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE result jsonb; affected integer;
BEGIN
  IF NOT public.user_has_project_role_at_least('30000000-0000-0000-0000-000000000001','field')
     OR public.user_has_project_role_at_least('30000000-0000-0000-0000-000000000001','pm') THEN
    RAISE EXCEPTION 'Fixture must exercise real field membership';
  END IF;
  result := public.piece_control_pilot_readiness('30000000-0000-0000-0000-000000000001');
  IF (result #>> '{metrics,missing_drawing_link_count}')::integer <> 0 THEN
    RAISE EXCEPTION 'Set-only actionable leaf incorrectly reported as missing drawing link';
  END IF;
  UPDATE public.drawing_impacts SET title='FIELD MUST NOT WRITE' WHERE id='70000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Field user updated drawing impact'; END IF;
  DELETE FROM public.drawing_impacts WHERE id='70000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Field user deleted drawing impact'; END IF;
  BEGIN
    INSERT INTO public.drawing_impacts(project_id,drawing_revision_id,impact_type,title)
      VALUES ('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','fabrication','Forbidden');
    RAISE EXCEPTION 'Field user inserted drawing impact';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.email_integration_settings SET mailbox_address='forbidden@example.invalid' WHERE id='80000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Field user updated email settings'; END IF;
  DELETE FROM public.email_integration_settings WHERE id='80000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Field user deleted email settings'; END IF;
  BEGIN
    INSERT INTO public.email_integration_settings(project_id,mailbox_address)
      VALUES ('30000000-0000-0000-0000-000000000001','forbidden@example.invalid');
    RAISE EXCEPTION 'Field user inserted email settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
DELETE FROM public.piece_drawing_sets WHERE piece_id='40000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF (public.piece_control_pilot_readiness('30000000-0000-0000-0000-000000000001') #>> '{metrics,missing_drawing_link_count}')::integer <> 1 THEN
    RAISE EXCEPTION 'Unlinked leaf must still report a missing link';
  END IF;
END $test$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.piece_control_pilot_readiness('30000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Nonmember accessed project readiness';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE affected integer;
BEGIN
  IF NOT public.user_has_project_role_at_least('30000000-0000-0000-0000-000000000001','pm') THEN
    RAISE EXCEPTION 'Fixture must exercise real PM membership';
  END IF;
  UPDATE public.drawing_impacts SET title='PM authorized' WHERE id='70000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'PM could not update drawing impact'; END IF;
  UPDATE public.email_integration_settings SET mailbox_address='pm@example.invalid' WHERE id='80000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'PM could not update email settings'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: set-only and missing links, real member/nonmember authorization, field write denial, PM write acceptance'
