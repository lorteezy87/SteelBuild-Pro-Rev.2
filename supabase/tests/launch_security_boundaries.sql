-- STAGING ONLY: psql --set=ON_ERROR_STOP=1 --file=this-file. Everything rolls back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email) VALUES
 ('11000000-5eed-4000-8000-000000000001','owner@example.invalid'),
 ('11000000-5eed-4000-8000-000000000002','admin@example.invalid'),
 ('11000000-5eed-4000-8000-000000000003','pm@example.invalid'),
 ('11000000-5eed-4000-8000-000000000004','viewer@example.invalid'),
 ('11000000-5eed-4000-8000-000000000005','outsider@example.invalid'),
 ('11000000-5eed-4000-8000-000000000006','field@example.invalid');
INSERT INTO public.organizations(id,name,slug,plan,member_default_project_role) VALUES
 ('21000000-5eed-4000-8000-000000000001','Security fixture','security-fixture','business',NULL),
 ('21000000-5eed-4000-8000-000000000002','Other tenant','security-other','business',NULL),
 ('21000000-5eed-4000-8000-000000000003','Cascade fixture','security-cascade','business',NULL);
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000001','owner'),
 ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000002','admin'),
 ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000003','member'),
 ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000004','member'),
 ('21000000-5eed-4000-8000-000000000002','11000000-5eed-4000-8000-000000000005','owner'),
 ('21000000-5eed-4000-8000-000000000003','11000000-5eed-4000-8000-000000000001','owner'),
 ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000006','member');
INSERT INTO public.projects(id,org_id,name,project_number) VALUES
 ('31000000-5eed-4000-8000-000000000001','21000000-5eed-4000-8000-000000000001','Security project','SEC-1'),
 ('31000000-5eed-4000-8000-000000000002','21000000-5eed-4000-8000-000000000002','Other project','SEC-2');
INSERT INTO public.user_projects(project_id,user_id,role) VALUES
 ('31000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000003','pm'),
 ('31000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000004','viewer'),
 ('31000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000006','field');
INSERT INTO public.organization_invitations(org_id,email,role,token) VALUES
 ('21000000-5eed-4000-8000-000000000001','outsider@example.invalid','member','91000000-5eed-4000-8000-000000000001');
INSERT INTO public.backcharges(id,project_id,backcharge_number,title) VALUES
 ('41000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','BC-900','Owned backcharge'),
 ('41000000-5eed-4000-8000-000000000002','31000000-5eed-4000-8000-000000000002','BC-900','Other backcharge');
INSERT INTO public.drawing_transmittals(id,project_id,transmittal_number) VALUES
 ('51000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','TR-900'),
 ('51000000-5eed-4000-8000-000000000002','31000000-5eed-4000-8000-000000000002','TR-900');
INSERT INTO public.drawing_sets(id,project_id) VALUES
 ('61000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001'),
 ('61000000-5eed-4000-8000-000000000002','31000000-5eed-4000-8000-000000000002');
INSERT INTO public.drawings(id,project_id,drawing_set_id,sheet_number) VALUES
 ('71000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','61000000-5eed-4000-8000-000000000001','SEC-OWN'),
 ('71000000-5eed-4000-8000-000000000002','31000000-5eed-4000-8000-000000000002','61000000-5eed-4000-8000-000000000002','SEC-OTHER');
INSERT INTO public.work_packages(id,project_id) VALUES
 ('81000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001'),
 ('81000000-5eed-4000-8000-000000000002','31000000-5eed-4000-8000-000000000002');
SET LOCAL session_replication_role = origin;
\ir ../migrations/20260921080604_harden_workspace_membership_and_audit_boundaries.sql

CREATE FUNCTION pg_temp.denied(command text) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  EXECUTE command;
  RAISE EXCEPTION 'Expected permission denial: %', command;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $test$;

-- Field users can create records; later viewer checks reuse exactly these rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11000000-5eed-4000-8000-000000000006","role":"authenticated"}',true);
INSERT INTO public.drawing_analyses(id,project_id,file_name,file_url)
VALUES ('a1000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','fixture.pdf','https://example.invalid/fixture.pdf');
INSERT INTO public.drawing_findings(id,analysis_id,description)
VALUES ('a1000000-5eed-4000-8000-000000000001','a1000000-5eed-4000-8000-000000000001','Synthetic finding');
INSERT INTO public.external_linked_folders(id,project_id,provider,folder_url)
VALUES ('a1000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','sharepoint','https://example.invalid/folder');
INSERT INTO public.email_accounts(id,project_id,email_address)
VALUES ('a1000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','fixture@example.invalid');
INSERT INTO public.email_messages(id,project_id,account_id,sender_email,received_at)
VALUES ('a1000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','a1000000-5eed-4000-8000-000000000001','fixture@example.invalid',now());
INSERT INTO public.email_attachments(id,project_id,message_id,filename)
VALUES ('a1000000-5eed-4000-8000-000000000001','31000000-5eed-4000-8000-000000000001','a1000000-5eed-4000-8000-000000000001','fixture.pdf');
DO $field$
DECLARE tbl text; affected int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['drawing_analyses','drawing_findings','external_linked_folders','email_accounts','email_messages','email_attachments'] LOOP
    EXECUTE format('UPDATE public.%I SET id=id WHERE id=%L::uuid',tbl,'a1000000-5eed-4000-8000-000000000001');
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Field update blocked: %',tbl; END IF;
  END LOOP;
END $field$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"11000000-5eed-4000-8000-000000000002","role":"authenticated"}',true);
DO $admin$
DECLARE affected int;
BEGIN
  DELETE FROM public.organization_members WHERE org_id='21000000-5eed-4000-8000-000000000001' AND role='owner';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Admin deleted an owner'; END IF;
  BEGIN
    UPDATE public.organization_members SET user_id='11000000-5eed-4000-8000-000000000005'
    WHERE org_id='21000000-5eed-4000-8000-000000000001' AND user_id='11000000-5eed-4000-8000-000000000003';
    RAISE EXCEPTION 'Membership identity was reassigned';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.organization_invitations WHERE org_id='21000000-5eed-4000-8000-000000000001') <> 1 THEN RAISE EXCEPTION 'Admin cannot list invitation'; END IF;
END $admin$;

SELECT set_config('request.jwt.claims','{"sub":"11000000-5eed-4000-8000-000000000001","role":"authenticated"}',true);
DO $owner$
BEGIN
  BEGIN
    DELETE FROM public.organization_members WHERE org_id='21000000-5eed-4000-8000-000000000001' AND user_id=auth.uid();
    RAISE EXCEPTION 'Last owner self-deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.organization_members SET role='member' WHERE org_id='21000000-5eed-4000-8000-000000000001' AND user_id=auth.uid();
    RAISE EXCEPTION 'Last owner self-demoted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $owner$;

-- An owner can add a successor and remove that second owner while retaining
-- the original owner; the last-owner fix must not freeze ordinary administration.
INSERT INTO public.organization_members(org_id,user_id,role)
VALUES ('21000000-5eed-4000-8000-000000000001','11000000-5eed-4000-8000-000000000005','owner');
DO $successor$
DECLARE affected int;
BEGIN
  DELETE FROM public.organization_members
  WHERE org_id='21000000-5eed-4000-8000-000000000001' AND user_id='11000000-5eed-4000-8000-000000000005';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Owner could not remove a second owner'; END IF;
END $successor$;

SELECT set_config('request.jwt.claims','{"sub":"11000000-5eed-4000-8000-000000000004","role":"authenticated"}',true);
DO $viewer$
DECLARE tbl text; affected int; visible int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.organization_invitations WHERE org_id='21000000-5eed-4000-8000-000000000001') THEN RAISE EXCEPTION 'Viewer read invitation tokens'; END IF;
  -- Preserve the explicit owner decision from #460: viewers can raise requests.
  PERFORM public.create_change_request('31000000-5eed-4000-8000-000000000001','{"title":"Viewer request remains allowed"}');
  FOREACH tbl IN ARRAY ARRAY['drawing_analyses','drawing_findings','external_linked_folders','email_accounts','email_messages','email_attachments'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id=%L::uuid',tbl,'a1000000-5eed-4000-8000-000000000001') INTO visible;
    IF visible <> 1 THEN RAISE EXCEPTION 'Viewer read was blocked: %',tbl; END IF;
    EXECUTE format('UPDATE public.%I SET id=id WHERE id=%L::uuid',tbl,'a1000000-5eed-4000-8000-000000000001');
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Viewer updated %',tbl; END IF;
    EXECUTE format('DELETE FROM public.%I WHERE id=%L::uuid',tbl,'a1000000-5eed-4000-8000-000000000001');
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Viewer deleted %',tbl; END IF;
    PERFORM pg_temp.denied(format('INSERT INTO public.%I SELECT * FROM public.%I WHERE id=%L::uuid',tbl,tbl,'a1000000-5eed-4000-8000-000000000001'));
  END LOOP;
END $viewer$;
SELECT pg_temp.denied($sql$SELECT public.log_backcharge_event('41000000-5eed-4000-8000-000000000001','note',NULL,NULL,'forged')$sql$);
SELECT pg_temp.denied($sql$SELECT public.log_transmittal_event('31000000-5eed-4000-8000-000000000001','51000000-5eed-4000-8000-000000000001','created',NULL,'draft')$sql$);

SELECT set_config('request.jwt.claims','{"sub":"11000000-5eed-4000-8000-000000000003","role":"authenticated"}',true);
-- Legitimate invoker RPC and audit paths must continue working.
SELECT public.create_backcharge('31000000-5eed-4000-8000-000000000001','{"title":"Authorized creation"}');
SELECT public.note_backcharge('41000000-5eed-4000-8000-000000000001','Authorized note');
SELECT public.log_transmittal_event('31000000-5eed-4000-8000-000000000001','51000000-5eed-4000-8000-000000000001','created',NULL,'draft');
SELECT * FROM public.evaluate_fab_release_package(ARRAY['71000000-5eed-4000-8000-000000000001'::uuid]);
SELECT public.work_package_drawing_set_reports('81000000-5eed-4000-8000-000000000001');
SELECT pg_temp.denied($sql$SELECT public.log_backcharge_event('41000000-5eed-4000-8000-000000000002','note',NULL,NULL,'cross tenant')$sql$);
SELECT pg_temp.denied($sql$SELECT public.log_transmittal_event('31000000-5eed-4000-8000-000000000002','51000000-5eed-4000-8000-000000000002','created',NULL,'draft')$sql$);
SELECT pg_temp.denied($sql$SELECT public.log_transmittal_event('31000000-5eed-4000-8000-000000000001','51000000-5eed-4000-8000-000000000002','created',NULL,'draft')$sql$);
SELECT pg_temp.denied($sql$SELECT * FROM public.evaluate_fab_release_package(ARRAY['71000000-5eed-4000-8000-000000000001'::uuid,'71000000-5eed-4000-8000-000000000002'::uuid])$sql$);
SELECT pg_temp.denied($sql$SELECT public.work_package_drawing_set_reports('81000000-5eed-4000-8000-000000000002')$sql$);
DO $piece$
BEGIN
  IF public.piece_control_drawing_is_approved('71000000-5eed-4000-8000-000000000002') THEN RAISE EXCEPTION 'Foreign drawing approved'; END IF;
END $piece$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.denied($sql$SELECT * FROM public.evaluate_fab_release_package('{}'::uuid[])$sql$);
SELECT pg_temp.denied($sql$SELECT public.log_backcharge_event('41000000-5eed-4000-8000-000000000001','note',NULL,NULL,'anonymous')$sql$);
RESET ROLE;
DELETE FROM public.organizations WHERE id='21000000-5eed-4000-8000-000000000003';
DO $evidence$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE org_id='21000000-5eed-4000-8000-000000000003') THEN RAISE EXCEPTION 'Parent erasure cascade blocked'; END IF;
  IF EXISTS (SELECT 1 FROM public.backcharge_events WHERE backcharge_id='41000000-5eed-4000-8000-000000000002') THEN RAISE EXCEPTION 'Foreign audit row written'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.backcharge_events WHERE backcharge_id='41000000-5eed-4000-8000-000000000001' AND actor='11000000-5eed-4000-8000-000000000003') THEN RAISE EXCEPTION 'Authorized audit row missing'; END IF;
END $evidence$;
ROLLBACK;
SELECT 'Workspace ownership, invitation visibility, audited writes and definer reads passed; fixtures rolled back' AS result;
