-- Run only on staging with psql --set=ON_ERROR_STOP=1 --file=this-file.
-- All setup and schema changes roll back, including generated record numbers.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id,email) VALUES
 ('10000000-5eed-4000-8000-000000000001','viewer@example.invalid'),
 ('10000000-5eed-4000-8000-000000000002','field@example.invalid'),
 ('10000000-5eed-4000-8000-000000000003','pm@example.invalid'),
 ('10000000-5eed-4000-8000-000000000004','outsider@example.invalid');
INSERT INTO public.organizations(id,name,slug,member_default_project_role) VALUES
 ('20000000-5eed-4000-8000-000000000001','Permission fixture','cr-permission-fixture',NULL),
 ('20000000-5eed-4000-8000-000000000002','Other tenant','cr-other-tenant',NULL);
INSERT INTO public.organization_members(org_id,user_id,role)
 SELECT '20000000-5eed-4000-8000-000000000001',id,'member'
 FROM auth.users WHERE id IN ('10000000-5eed-4000-8000-000000000001','10000000-5eed-4000-8000-000000000002','10000000-5eed-4000-8000-000000000003','10000000-5eed-4000-8000-000000000004');
INSERT INTO public.projects(id,org_id,name,project_number) VALUES
 ('30000000-5eed-4000-8000-000000000001','20000000-5eed-4000-8000-000000000001','Permission test','TEST-CR'),
 ('30000000-5eed-4000-8000-000000000002','20000000-5eed-4000-8000-000000000002','Other tenant test','TEST-OTHER');
INSERT INTO public.user_projects(project_id,user_id,role) VALUES
 ('30000000-5eed-4000-8000-000000000001','10000000-5eed-4000-8000-000000000001','viewer'),
 ('30000000-5eed-4000-8000-000000000001','10000000-5eed-4000-8000-000000000002','field'),
 ('30000000-5eed-4000-8000-000000000001','10000000-5eed-4000-8000-000000000003','pm');
INSERT INTO public.rfis(id,project_id,rfi_number,title,date_required,date_answered,due_date,responded_date) VALUES
 ('40000000-5eed-4000-8000-000000000001','30000000-5eed-4000-8000-000000000001','TEST-1','Canonical dates','2026-09-25','2026-09-26',NULL,NULL),
 ('40000000-5eed-4000-8000-000000000002','30000000-5eed-4000-8000-000000000001','TEST-2','Legacy dates',NULL,NULL,'2026-09-27','2026-09-28'),
 ('40000000-5eed-4000-8000-000000000003','30000000-5eed-4000-8000-000000000001','TEST-3','Unknown dates',NULL,NULL,NULL,NULL);
SET LOCAL session_replication_role = origin;

-- Rehearse the migration even when staging already has it; ROLLBACK restores
-- the installed trigger and all pre-test state.
DROP TRIGGER IF EXISTS trg_sync_rfi_date_aliases ON public.rfis;
\ir ../migrations/20260921054458_allow_project_members_to_raise_change_requests.sql
\ir ../migrations/20260921055027_synchronize_rfi_date_aliases.sql

SET LOCAL ROLE authenticated;
DO $permissions$
DECLARE u uuid; row public.change_requests; affected integer;
BEGIN
 FOREACH u IN ARRAY ARRAY[
  '10000000-5eed-4000-8000-000000000001'::uuid,
  '10000000-5eed-4000-8000-000000000002'::uuid,
  '10000000-5eed-4000-8000-000000000003'::uuid
 ] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  row := public.create_change_request('30000000-5eed-4000-8000-000000000001','{"title":"Member request"}');
  IF row.id IS NULL OR row.cr_number IS NULL OR row.created_by <> u THEN
   RAISE EXCEPTION 'Member creation/atomic number/actor failed';
  END IF;
  UPDATE public.change_requests SET title='PM edit' WHERE id=row.id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> (CASE WHEN u='10000000-5eed-4000-8000-000000000003'::uuid THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'PM-only updates regressed';
  END IF;
  BEGIN
   PERFORM public.create_change_request('30000000-5eed-4000-8000-000000000002','{"title":"Cross tenant"}');
   RAISE EXCEPTION 'Cross-tenant creation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
   INSERT INTO public.change_requests(project_id,title,cr_number)
    VALUES ('30000000-5eed-4000-8000-000000000001','Bypass','CR-MANUAL');
   RAISE EXCEPTION 'Direct insert bypassed atomic numbering';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"10000000-5eed-4000-8000-000000000004","role":"authenticated"}',true);
 BEGIN
  PERFORM public.create_change_request('30000000-5eed-4000-8000-000000000001','{"title":"Non-project member"}');
  RAISE EXCEPTION 'Org membership alone granted project creation';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $permissions$;
RESET ROLE;

DO $dates$
DECLARE r public.rfis; test_id uuid := '40000000-5eed-4000-8000-000000000001';
BEGIN
 IF EXISTS (SELECT 1 FROM public.rfis WHERE date_required IS DISTINCT FROM due_date OR date_answered IS DISTINCT FROM responded_date) THEN
  RAISE EXCEPTION 'Evidence-based backfill left divergent dates';
 END IF;
 IF EXISTS (SELECT 1 FROM public.rfis WHERE id='40000000-5eed-4000-8000-000000000003' AND (date_required IS NOT NULL OR date_answered IS NOT NULL)) THEN
  RAISE EXCEPTION 'Backfill invented a date';
 END IF;
 UPDATE public.rfis SET date_required='2026-10-01',date_answered='2026-10-02' WHERE id=test_id RETURNING * INTO r;
 IF r.due_date<>'2026-10-01' OR r.responded_date<>'2026-10-02' THEN RAISE EXCEPTION 'Canonical writes not mirrored'; END IF;
 UPDATE public.rfis SET due_date='2026-10-03',responded_date='2026-10-04' WHERE id=test_id RETURNING * INTO r;
 IF r.date_required<>'2026-10-03' OR r.date_answered<>'2026-10-04' THEN RAISE EXCEPTION 'Legacy writes not mirrored'; END IF;
 UPDATE public.rfis SET date_required=NULL,date_answered=NULL WHERE id=test_id RETURNING * INTO r;
 IF r.due_date IS NOT NULL OR r.responded_date IS NOT NULL THEN RAISE EXCEPTION 'Cleared dates were resurrected'; END IF;
 BEGIN
  UPDATE public.rfis SET date_required='2026-10-01',due_date='2026-10-02' WHERE id=test_id;
  RAISE EXCEPTION 'Conflicting dates were silently accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $dates$;
ROLLBACK;
SELECT 'Change-request permissions and RFI date synchronization passed; all fixtures rolled back' AS result;
