-- PREPARED ONLY: manual review and explicit staging execution authorization required.
-- Target ONLY ndyfjffsulfbwpmwdmic (persistent staging branch), never production.
-- This is fixture data, not a migration; do not stamp the migration ledger.
-- Creates one clearly synthetic Shop Drawing Draft, set and sheet for read-only
-- desktop/mobile acceptance. No PDF, revision, review round, submission date,
-- approval, sign-off or release is invented. Normal audit/activity triggers remain on.
-- Fixed IDs intentionally FAIL on replay: inspect state after an unknown outcome.
-- Retain for repeated read-only runs. Any future cleanup must first recheck that
-- nobody has added evidence/history or referenced these IDs; no automatic deletes.

BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $fixture$
DECLARE
  v_org constant uuid := 'b0d853ce-2ad7-470e-bf23-c962cf72699f';
  v_project constant uuid := '6573ede6-e29d-4d15-8855-403029735231';
  v_set constant uuid := '882d7aa6-c5ca-49f2-b30b-b54423f61280';
  v_sheet constant uuid := '1c05c5dd-10a4-4635-bcc5-df5e3ec3e28b';
  v_submittal constant uuid := '00b6757a-0a79-4b64-9d27-2feb204840a2';
  v_before jsonb;
  v_after jsonb;
BEGIN
  -- Exact known synthetic parent identity; lock it against concurrent changes.
  PERFORM 1 FROM public.organizations
    WHERE id=v_org AND name='Example Fabrication (staging)' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wrong staging organization fixture'; END IF;
  PERFORM 1 FROM public.projects
    WHERE id=v_project AND org_id=v_org AND project_number='STG-0001'
      AND name='STAGING — Warehouse Expansion' AND NOT is_deleted AND deleted_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wrong staging project fixture'; END IF;

  IF EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=v_set)
    OR EXISTS(SELECT 1 FROM public.drawings WHERE id=v_sheet)
    OR EXISTS(SELECT 1 FROM public.submittals WHERE id=v_submittal)
    OR EXISTS(SELECT 1 FROM public.drawing_sets WHERE project_id=v_project AND set_name='SYNTHETIC - Revision Evidence Draft')
    OR EXISTS(SELECT 1 FROM public.drawings WHERE project_id=v_project AND sheet_number='SYNTHETIC-REV-DRAFT')
    OR EXISTS(SELECT 1 FROM public.submittals WHERE project_id=v_project AND
      (submittal_number='QA-REV-DRAFT-20261009' OR title='SYNTHETIC - Revision evidence draft'))
  THEN RAISE EXCEPTION 'Fixture identity already occupied; inspect before retry'; END IF;

  IF (SELECT count(*) FROM public.drawing_sets WHERE project_id=v_project)<>2
    OR (SELECT count(*) FROM public.drawings WHERE project_id=v_project)<>4
    OR (SELECT count(*) FROM public.submittals WHERE project_id=v_project)<>2
  THEN RAISE EXCEPTION 'Existing fixture counts changed; review before installing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.submittals WHERE id='bcc819a3-b410-400c-8db0-0b45266f8421'
    AND project_id=v_project AND title='Staging erection drawings' AND submittal_type IS NULL AND status='Approved')
  THEN RAISE EXCEPTION 'Legacy exclusion fixture changed'; END IF;

  -- Preserve every existing row exactly, including legacy untyped approvals.
  PERFORM 1 FROM public.drawing_sets WHERE project_id=v_project FOR SHARE;
  PERFORM 1 FROM public.drawings WHERE project_id=v_project FOR SHARE;
  PERFORM 1 FROM public.submittals WHERE project_id=v_project FOR SHARE;
  SELECT jsonb_build_object(
    'sets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.drawing_sets x WHERE project_id=v_project),
    'sheets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.drawings x WHERE project_id=v_project),
    'submittals',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.submittals x WHERE project_id=v_project),
    'project',(SELECT to_jsonb(x) FROM public.projects x WHERE id=v_project),
    'organization',(SELECT to_jsonb(x) FROM public.organizations x WHERE id=v_org)
  ) INTO v_before;

  INSERT INTO public.drawing_sets(id,project_id,set_name,category,register)
    VALUES(v_set,v_project,'SYNTHETIC - Revision Evidence Draft','shop','shop');
  -- A manual synthetic identifier avoids consuming the project's business sequence.
  INSERT INTO public.submittals(id,project_id,submittal_number,title,submittal_type,status,
    drawing_set_ids,total_rounds,current_round_id,submitted_date,approved_date,ball_in_court)
    VALUES(v_submittal,v_project,'QA-REV-DRAFT-20261009','SYNTHETIC - Revision evidence draft',
      'Shop Drawing','Draft',ARRAY[v_set],0,NULL,NULL,NULL,NULL);
  INSERT INTO public.drawings(id,project_id,drawing_set_id,sheet_number,title,stage)
    VALUES(v_sheet,v_project,v_set,'SYNTHETIC-REV-DRAFT','SYNTHETIC - No source PDF; acceptance Draft only','Not Started');
  UPDATE public.drawing_sets SET current_submittal_id=v_submittal WHERE id=v_set AND project_id=v_project;

  SELECT jsonb_build_object(
    'sets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.drawing_sets x WHERE project_id=v_project AND id<>v_set),
    'sheets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.drawings x WHERE project_id=v_project AND id<>v_sheet),
    'submittals',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.submittals x WHERE project_id=v_project AND id<>v_submittal),
    'project',(SELECT to_jsonb(x) FROM public.projects x WHERE id=v_project),
    'organization',(SELECT to_jsonb(x) FROM public.organizations x WHERE id=v_org)
  ) INTO v_after;
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'An existing fixture row changed; rolling back'; END IF;
  IF (SELECT count(*) FROM public.drawing_sets WHERE project_id=v_project)<>3
    OR (SELECT count(*) FROM public.drawings WHERE project_id=v_project)<>5
    OR (SELECT count(*) FROM public.submittals WHERE project_id=v_project)<>3
  THEN RAISE EXCEPTION 'Unexpected fixture row counts; rolling back'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.submittals s JOIN public.drawing_sets ds ON ds.id=v_set
    JOIN public.drawings d ON d.drawing_set_id=ds.id AND d.id=v_sheet
    WHERE s.id=v_submittal AND s.project_id=v_project AND ds.project_id=v_project AND d.project_id=v_project
      AND s.drawing_set_ids=ARRAY[v_set] AND ds.current_submittal_id=s.id
      AND s.submittal_type='Shop Drawing' AND s.status='Draft' AND s.current_round_id IS NULL
      AND s.submitted_date IS NULL AND s.approved_date IS NULL AND s.total_rounds=0 AND s.file_url IS NULL
      AND d.stage='Not Started' AND d.file_url IS NULL)
    OR EXISTS(SELECT 1 FROM public.submittal_rounds WHERE submittal_id=v_submittal)
    OR EXISTS(SELECT 1 FROM public.drawing_revisions WHERE drawing_id=v_sheet)
    OR EXISTS(SELECT 1 FROM public.drawing_signoffs WHERE drawing_id=v_sheet)
    OR EXISTS(SELECT 1 FROM public.submittal_round_revision_evidence WHERE submittal_id=v_submittal)
  THEN RAISE EXCEPTION 'Draft evidence or reciprocal links differ from reviewed fixture'; END IF;
END $fixture$;

COMMIT;
