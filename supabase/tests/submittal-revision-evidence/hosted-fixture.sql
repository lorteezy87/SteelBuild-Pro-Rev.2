-- Existing policies/triggers remain enabled. No bytes are uploaded to Storage;
-- the transient object metadata exercises source lookup and real Storage RLS.
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('ba090000-0000-4000-8000-000000000010','round-evidence-pm@example.invalid','{}','{}'),
 ('ba090000-0000-4000-8000-000000000011','round-evidence-viewer@example.invalid','{}','{}'),
 ('ba090000-0000-4000-8000-000000000012','round-evidence-foreign@example.invalid','{}','{}');
INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES
 ('ba090000-0000-4000-8000-000000000013','ba090000-0000-4000-8000-000000000010','totp','verified',now(),now());
INSERT INTO public.organizations(id,name,member_default_project_role) VALUES
 ('ba090000-0000-4000-8000-000000000001','Rollback-only steel round evidence',NULL);
INSERT INTO public.organization_members(org_id,user_id,role) VALUES
 ('ba090000-0000-4000-8000-000000000001','ba090000-0000-4000-8000-000000000010','admin'),
 ('ba090000-0000-4000-8000-000000000001','ba090000-0000-4000-8000-000000000011','member');
SELECT set_config('request.jwt.claims','{"sub":"ba090000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
INSERT INTO public.projects(id,org_id,name,project_number) VALUES
 ('ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000001','Rollback-only shop project','ROUND-EVIDENCE-TEST');
INSERT INTO public.user_projects(user_id,project_id,role) VALUES
 ('ba090000-0000-4000-8000-000000000010','ba090000-0000-4000-8000-000000000002','pm'),
 ('ba090000-0000-4000-8000-000000000011','ba090000-0000-4000-8000-000000000002','viewer'),
 -- Deliberate stale assignment without organization membership.
 ('ba090000-0000-4000-8000-000000000012','ba090000-0000-4000-8000-000000000002','pm');
UPDATE public.organization_members SET role='member' WHERE org_id='ba090000-0000-4000-8000-000000000001' AND user_id='ba090000-0000-4000-8000-000000000010';
INSERT INTO storage.objects(bucket_id,name,owner) VALUES
 ('app-files','ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf','ba090000-0000-4000-8000-000000000010');
INSERT INTO public.drawing_sets(id,project_id,set_name) VALUES
 ('ba090000-0000-4000-8000-000000000020','ba090000-0000-4000-8000-000000000002','Test shop A'),
 ('ba090000-0000-4000-8000-000000000021','ba090000-0000-4000-8000-000000000002','Test shop B');
INSERT INTO public.drawings(id,project_id,drawing_set_id,sheet_number,title,file_url,pdf_page,stage) VALUES
 ('ba090000-0000-4000-8000-000000000030','ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000020','T1','Connections','ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf',1,'IFC'),
 ('ba090000-0000-4000-8000-000000000031','ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000021','T2','Stairs','ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf',2,'IFC');
INSERT INTO public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,is_current,file_url,pdf_page,release_status) VALUES
 ('ba090000-0000-4000-8000-000000000040','ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000030','A','T1','Connections',true,'ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf',1,'released_for_shop'),
 ('ba090000-0000-4000-8000-000000000041','ba090000-0000-4000-8000-000000000002','ba090000-0000-4000-8000-000000000031','A','T2','Stairs',true,'ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf',2,'released_for_shop');
INSERT INTO public.submittals(id,project_id,submittal_number,title,submittal_type,drawing_set_ids) VALUES
 ('ba090000-0000-4000-8000-000000000050','ba090000-0000-4000-8000-000000000002','ROUND-TEST-1','Test shop package','Shop Drawing',ARRAY['ba090000-0000-4000-8000-000000000020','ba090000-0000-4000-8000-000000000021']::uuid[]),
 ('ba090000-0000-4000-8000-000000000051','ba090000-0000-4000-8000-000000000002','ROUND-TEST-2','Legacy package','Shop Drawing',ARRAY['ba090000-0000-4000-8000-000000000020','ba090000-0000-4000-8000-000000000021']::uuid[]),
 ('ba090000-0000-4000-8000-000000000052','ba090000-0000-4000-8000-000000000002','ROUND-TEST-3','Product data','Product Data',ARRAY['ba090000-0000-4000-8000-000000000020']::uuid[]);
UPDATE public.submittals SET status='Submitted',ball_in_court='EOR',submitted_date='2026-10-01' WHERE id='ba090000-0000-4000-8000-000000000051';
UPDATE public.submittals SET status='Approved',ball_in_court='GC',metadata='{"ofs_checklist":{"markups_incorporated":true,"comments_addressed":true,"sheets_ready":true,"authorized_to_issue":true}}' WHERE id='ba090000-0000-4000-8000-000000000051';
UPDATE public.submittals SET status='Released for Fabrication',ball_in_court=NULL WHERE id='ba090000-0000-4000-8000-000000000051';
