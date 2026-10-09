-- LOCAL CANDIDATE ONLY. Apply and hand-stamp only after the reviewed release.
-- The PDF is uploaded before this RPC. A failed call may leave an unreferenced
-- Storage object, but it cannot leave a partial set/sheet/revision DB change.
-- This first contract accepts only real drawing_set_id relationships. It
-- refuses active zones on revised sheets until zone/link carry-forward is
-- moved into the same transaction; no coordination evidence is discarded.

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.drawing_revision_apply_requests (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  drawing_set_id uuid NOT NULL REFERENCES public.drawing_sets(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  applied_by uuid NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, request_id)
);

CREATE INDEX drawing_revision_apply_requests_set_idx
  ON public.drawing_revision_apply_requests (project_id, drawing_set_id, created_at DESC);

ALTER TABLE public.drawing_revision_apply_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY drawing_revision_apply_requests_select
  ON public.drawing_revision_apply_requests FOR SELECT TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));
REVOKE ALL ON TABLE public.drawing_revision_apply_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.drawing_revision_apply_requests TO authenticated;
GRANT ALL ON TABLE public.drawing_revision_apply_requests TO service_role;

CREATE OR REPLACE FUNCTION public.apply_reviewed_shop_drawing_revision(
  p_project_id uuid,
  p_drawing_set_id uuid,
  p_request_id uuid,
  p_expected_set_updated_at timestamptz,
  p_expected_set_revision text,
  p_revision_label text,
  p_issued_date date,
  p_issued_by text,
  p_notes text,
  p_previous_disposition text,
  p_file_path text,
  p_reviewed_sheets jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_project_name text;
  v_set public.drawing_sets%rowtype;
  v_sheet public.drawings%rowtype;
  v_current public.drawing_revisions%rowtype;
  v_request public.drawing_revision_apply_requests%rowtype;
  v_entry jsonb;
  v_existing_by_id jsonb := '{}'::jsonb;
  v_source_pages jsonb := '[]'::jsonb;
  v_history jsonb;
  v_result jsonb;
  v_digest text;
  v_action text;
  v_mark text;
  v_code text;
  v_title text;
  v_drawing_id uuid;
  v_expected_revision_id uuid;
  v_previous_revision_id uuid;
  v_new_revision_id uuid;
  v_pdf_page integer;
  v_next_version integer;
  v_existing_input_count integer := 0;
  v_distinct_id_count integer;
  v_distinct_mark_count integer;
  v_live_count integer := 0;
  v_revised integer := 0;
  v_added integer := 0;
  v_removed integer := 0;
  v_unchanged integer := 0;
  v_final_count integer;
BEGIN
  IF v_actor IS NULL OR p_project_id IS NULL OR p_drawing_set_id IS NULL OR p_request_id IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'pm') THEN
    RAISE EXCEPTION 'Project manager access is required for a reviewed drawing revision'
      USING ERRCODE = '42501';
  END IF;
  IF p_expected_set_updated_at IS NULL
     OR nullif(btrim(p_revision_label), '') IS NULL
     OR length(btrim(p_revision_label)) > 80
     OR upper(btrim(p_revision_label)) = upper(btrim(coalesce(p_expected_set_revision, '')))
     OR p_issued_date IS NULL
     OR p_previous_disposition IS NULL
     OR p_previous_disposition NOT IN ('superseded', 'reference')
     OR jsonb_typeof(p_reviewed_sheets) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_reviewed_sheets) = 0
     OR jsonb_array_length(p_reviewed_sheets) > 5000 THEN
    RAISE EXCEPTION 'Invalid or unchanged reviewed revision request' USING ERRCODE = '22023';
  END IF;

  -- JSONB canonicalization gives retries with reordered object keys the same
  -- digest. The key is scoped to a project and its original human actor.
  v_digest := encode(sha256(convert_to(jsonb_build_object(
    'set_id', p_drawing_set_id, 'expected_set_updated_at', p_expected_set_updated_at,
    'expected_set_revision', p_expected_set_revision, 'revision_label', p_revision_label,
    'issued_date', p_issued_date, 'issued_by', p_issued_by,
    'notes', p_notes, 'previous_disposition', p_previous_disposition,
    'file_path', p_file_path, 'reviewed_sheets', p_reviewed_sheets
  )::text, 'UTF8')), 'hex');
  INSERT INTO public.drawing_revision_apply_requests
    (project_id, drawing_set_id, request_id, request_sha256, applied_by)
  VALUES (p_project_id, p_drawing_set_id, p_request_id, v_digest, v_actor)
  ON CONFLICT (project_id, request_id) DO NOTHING;
  SELECT * INTO v_request FROM public.drawing_revision_apply_requests
    WHERE project_id = p_project_id AND request_id = p_request_id FOR UPDATE;
  IF v_request.drawing_set_id IS DISTINCT FROM p_drawing_set_id
     OR v_request.request_sha256 IS DISTINCT FROM v_digest
     OR v_request.applied_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Revision request key was already used for different reviewed content'
      USING ERRCODE = '23505';
  END IF;
  IF v_request.result IS NOT NULL THEN RETURN v_request.result; END IF;

  SELECT p.org_id, p.name INTO v_org_id, v_project_name
    FROM public.projects p WHERE p.id = p_project_id;
  SELECT * INTO v_set FROM public.drawing_sets
    WHERE id = p_drawing_set_id AND project_id = p_project_id
      AND is_deleted = false AND deleted_at IS NULL FOR UPDATE;
  IF v_set.id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Active drawing set not found in this project' USING ERRCODE = 'P0002';
  END IF;
  IF v_set.is_locked THEN
    RAISE EXCEPTION 'Drawing set is locked' USING ERRCODE = '42501';
  END IF;
  IF v_set.updated_at IS DISTINCT FROM p_expected_set_updated_at
     OR v_set.revision IS DISTINCT FROM p_expected_set_revision THEN
    RAISE EXCEPTION 'Drawing set changed since review; refresh the comparison'
      USING ERRCODE = '40001';
  END IF;
  v_history := coalesce(nullif(btrim(v_set.revision_history), ''), '[]')::jsonb;
  IF jsonb_typeof(v_history) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Existing revision history is malformed' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_history) AS history_entry
    WHERE upper(btrim(coalesce(history_entry->>'revisionLabel', ''))) = upper(btrim(p_revision_label))
  ) THEN
    RAISE EXCEPTION 'Set revision label was already used in its history'
      USING ERRCODE = '23505';
  END IF;
  -- The current fabrication gate can still choose a previously linked,
  -- released Shop Drawing submittal after the set gets a new revision. Until
  -- exact per-revision submission evidence is installed in that gate, reject
  -- this operation rather than showing the new issue as fab-ready.
  IF EXISTS (
    SELECT 1 FROM public.submittals s
    WHERE s.project_id = p_project_id AND s.submittal_type = 'Shop Drawing'
      AND s.is_deleted = false AND s.deleted_at IS NULL
      AND s.status IN ('Approved', 'Approved as Noted', 'Released for Fabrication')
      AND p_drawing_set_id = ANY(coalesce(s.drawing_set_ids, '{}'::uuid[]))
  ) THEN
    RAISE EXCEPTION 'Linked approved Shop Drawing must have exact current-revision coverage before revising this set'
      USING ERRCODE = '22023';
  END IF;
  IF p_file_path IS NULL
     OR p_file_path = v_set.file_url
     OR p_file_path !~ ('^' || v_org_id::text || '/uploads/[A-Za-z0-9._-]+[.]pdf$')
     OR p_file_path ~ '[.][.]'
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'app-files' AND o.name = p_file_path
     ) THEN
    RAISE EXCEPTION 'Reviewed source PDF must be an uploaded file in this workspace'
      USING ERRCODE = '22023';
  END IF;

  -- Build an exact expected roster. Each active FK-linked sheet must occur
  -- once, including unchanged sheets. Legacy name-only sheets fail closed.
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_reviewed_sheets) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each reviewed sheet must be an object' USING ERRCODE = '22023';
    END IF;
    v_action := v_entry->>'action';
    v_mark := btrim(coalesce(v_entry->>'sheet_number', ''));
    IF v_action IS NULL OR v_action NOT IN ('same', 'revised', 'added', 'removed')
       OR v_mark = '' OR length(v_mark) > 120 THEN
      RAISE EXCEPTION 'Unknown action or blank sheet mark in reviewed roster'
        USING ERRCODE = '22023';
    END IF;
    IF v_action = 'added' THEN
      IF v_entry ? 'drawing_id' THEN
        RAISE EXCEPTION 'Added sheet cannot name an existing drawing' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF nullif(v_entry->>'drawing_id', '') IS NULL
         OR NOT (v_entry ? 'expected_updated_at')
         OR NOT (v_entry ? 'expected_revision_id') THEN
        RAISE EXCEPTION 'Existing sheet requires its reviewed row and revision versions'
          USING ERRCODE = '22023';
      END IF;
      v_drawing_id := (v_entry->>'drawing_id')::uuid;
      v_existing_input_count := v_existing_input_count + 1;
    END IF;
    IF v_action IN ('revised', 'added') THEN
      v_code := btrim(coalesce(v_entry->>'revision_code', ''));
      v_title := btrim(coalesce(v_entry->>'sheet_title', ''));
      IF v_entry->'reviewed' IS DISTINCT FROM 'true'::jsonb
         OR v_code = '' OR length(v_code) > 80
         OR v_title = '' OR length(v_title) > 500
         OR coalesce(v_entry->>'pdf_page', '') !~ '^[1-9][0-9]{0,5}$'
         OR (v_entry ? 'extracted_text'
             AND jsonb_typeof(v_entry->'extracted_text') IS DISTINCT FROM 'string')
         OR (v_entry ? 'callouts'
             AND jsonb_typeof(v_entry->'callouts') IS DISTINCT FROM 'array') THEN
        RAISE EXCEPTION 'Changed sheet needs a reviewed mark, title, revision and 1-based source PDF page'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  SELECT count(DISTINCT upper(btrim(value->>'sheet_number')))
    INTO v_distinct_mark_count FROM jsonb_array_elements(p_reviewed_sheets);
  IF v_distinct_mark_count <> jsonb_array_length(p_reviewed_sheets) THEN
    RAISE EXCEPTION 'Duplicate sheet mark in reviewed roster' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_object_agg(((value->>'drawing_id')::uuid)::text, value), '{}'::jsonb),
         count(DISTINCT (value->>'drawing_id')::uuid)
    INTO v_existing_by_id, v_distinct_id_count
  FROM jsonb_array_elements(p_reviewed_sheets)
  WHERE value->>'action' <> 'added';
  IF v_distinct_id_count <> v_existing_input_count THEN
    RAISE EXCEPTION 'Duplicate drawing in reviewed roster' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.drawings d
    WHERE d.project_id = p_project_id AND d.drawing_set_id IS NULL
      AND d.drawing_set_name = v_set.set_name
      AND d.is_deleted = false AND d.deleted_at IS NULL AND NOT coalesce(d.is_superseded, false)
  ) THEN
    RAISE EXCEPTION 'Legacy name-only sheets must be linked to the drawing set before atomic revision'
      USING ERRCODE = '22023';
  END IF;

  FOR v_sheet IN
    SELECT * FROM public.drawings d
    WHERE d.project_id = p_project_id AND d.drawing_set_id = p_drawing_set_id
      AND d.is_deleted = false AND d.deleted_at IS NULL AND NOT coalesce(d.is_superseded, false)
    ORDER BY d.id FOR UPDATE
  LOOP
    v_live_count := v_live_count + 1;
    v_entry := v_existing_by_id->v_sheet.id::text;
    IF v_entry IS NULL
       OR v_entry->>'sheet_number' IS DISTINCT FROM v_sheet.sheet_number
       OR (v_entry->>'expected_updated_at')::timestamptz IS DISTINCT FROM v_sheet.updated_at THEN
      RAISE EXCEPTION 'Drawing roster changed since review; refresh the comparison'
        USING ERRCODE = '40001';
    END IF;
    v_action := v_entry->>'action';
    v_expected_revision_id := nullif(v_entry->>'expected_revision_id', '')::uuid;
    SELECT * INTO v_current FROM public.drawing_revisions r
      WHERE r.drawing_id = v_sheet.id AND r.is_current
      FOR UPDATE;
    IF (v_current.id IS NOT NULL AND v_current.project_id IS DISTINCT FROM p_project_id)
       OR v_current.id IS DISTINCT FROM v_expected_revision_id
       OR (v_current.id IS NOT NULL AND v_current.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Current sheet revision changed since review'
        USING ERRCODE = '40001';
    END IF;
    IF v_action = 'same' THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    IF v_action = 'removed' AND EXISTS (
      SELECT 1 FROM public.drawing_holds h
      WHERE h.project_id = p_project_id AND h.drawing_id = v_sheet.id AND h.is_active
    ) THEN
      RAISE EXCEPTION 'Release the active sheet hold before removing it from this set'
        USING ERRCODE = '22023';
    END IF;

    -- A zone or active coordination link is anchored to the old revision.
    -- Refuse a partial carry-forward until it can be included in this RPC.
    IF v_action = 'revised' AND v_current.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.drawing_zones z
      WHERE z.drawing_revision_id = v_current.id AND z.is_active AND z.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Sheet has active zones; transactional zone carry-forward is required'
        USING ERRCODE = '22023';
    END IF;

    -- Backfill a pre-register current sheet snapshot inside this transaction.
    IF v_current.id IS NULL THEN
      SELECT coalesce(max(r.version_number), 0) + 1 INTO v_next_version
      FROM public.drawing_revisions r WHERE r.drawing_id = v_sheet.id;
      v_code := coalesce(nullif(btrim(v_sheet.revision_number), ''), 'v1');
      IF EXISTS (SELECT 1 FROM public.drawing_revisions r
                 WHERE r.drawing_id = v_sheet.id AND upper(btrim(r.revision_code)) = upper(v_code)) THEN
        RAISE EXCEPTION 'Historical revision code already exists without a current pointer'
          USING ERRCODE = '40001';
      END IF;
      INSERT INTO public.drawing_revisions (
        project_id, drawing_id, revision_code, sheet_number, sheet_title,
        version_number, is_current, file_url, pdf_page, archived_at, created_by
      ) VALUES (
        p_project_id, v_sheet.id, v_code, coalesce(v_sheet.sheet_number, '—'),
        coalesce(v_sheet.title, 'Untitled'), v_next_version, false,
        v_sheet.file_url, v_sheet.pdf_page, now(), v_actor
      ) RETURNING id INTO v_previous_revision_id;
      v_next_version := v_next_version + 1;
    ELSE
      v_previous_revision_id := v_current.id;
      SELECT coalesce(max(r.version_number), 0) + 1 INTO v_next_version
      FROM public.drawing_revisions r WHERE r.drawing_id = v_sheet.id;
      UPDATE public.drawing_revisions r SET
        is_current = false, archived_at = now(),
        file_url = coalesce(r.file_url, v_sheet.file_url),
        pdf_page = coalesce(r.pdf_page, v_sheet.pdf_page), updated_by = v_actor
      WHERE r.id = v_current.id;
    END IF;

    IF v_action = 'removed' THEN
      UPDATE public.drawings SET is_deleted = true, deleted_at = now(),
        is_superseded = true, stage = 'Not Started',
        set_approval_status = 'pending_review', set_approved_date = NULL
      WHERE id = v_sheet.id;
      v_removed := v_removed + 1;
      CONTINUE;
    END IF;

    v_code := btrim(v_entry->>'revision_code');
    IF EXISTS (SELECT 1 FROM public.drawing_revisions r
               WHERE r.drawing_id = v_sheet.id AND upper(btrim(r.revision_code)) = upper(v_code)) THEN
      RAISE EXCEPTION 'Revision code already exists for sheet %', v_sheet.sheet_number
        USING ERRCODE = '23505';
    END IF;
    v_pdf_page := (v_entry->>'pdf_page')::integer;
    INSERT INTO public.drawing_revisions (
      project_id, drawing_id, revision_code, sheet_number, sheet_title,
      version_number, is_current, supersedes_revision_id, file_url, pdf_page,
      issued_at, revision_notes, release_status, created_by
    ) VALUES (
      p_project_id, v_sheet.id, v_code, v_sheet.sheet_number,
      btrim(v_entry->>'sheet_title'), v_next_version, true,
      v_previous_revision_id, p_file_path, v_pdf_page,
      p_issued_date::timestamptz, p_notes, 'received', v_actor
    ) RETURNING id INTO v_new_revision_id;
    UPDATE public.drawings SET
      title = btrim(v_entry->>'sheet_title'), revision_number = v_code,
      file_url = p_file_path, pdf_page = v_pdf_page,
      extracted_text = CASE WHEN v_entry ? 'extracted_text' THEN v_entry->>'extracted_text' ELSE extracted_text END,
      callouts = CASE WHEN v_entry ? 'callouts' THEN v_entry->'callouts' ELSE callouts END,
      stage = 'Not Started', set_approval_status = 'pending_review',
      set_approved_date = NULL, ifc_status = NULL
    WHERE id = v_sheet.id;
    v_source_pages := v_source_pages || jsonb_build_array(jsonb_build_object(
      'drawing_id', v_sheet.id, 'drawing_revision_id', v_new_revision_id,
      'sheet_number', v_sheet.sheet_number, 'pdf_page', v_pdf_page,
      'file_path', p_file_path
    ));
    v_revised := v_revised + 1;
  END LOOP;

  IF v_live_count IS DISTINCT FROM v_existing_input_count THEN
    RAISE EXCEPTION 'Reviewed roster contains an unknown, deleted, or cross-project drawing'
      USING ERRCODE = '40001';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_reviewed_sheets)
                 WHERE value->>'action' = 'added' LOOP
    IF EXISTS (
      SELECT 1 FROM public.drawings d
      WHERE d.project_id = p_project_id AND d.drawing_set_id = p_drawing_set_id
        AND d.is_deleted = false AND d.deleted_at IS NULL
        AND upper(btrim(coalesce(d.sheet_number, ''))) = upper(btrim(v_entry->>'sheet_number'))
    ) THEN
      RAISE EXCEPTION 'Sheet mark already exists in this set, including superseded history'
        USING ERRCODE = '23505';
    END IF;
    v_code := btrim(v_entry->>'revision_code');
    v_pdf_page := (v_entry->>'pdf_page')::integer;
    INSERT INTO public.drawings (
      project_id, project_name, drawing_set_id, drawing_set_name,
      sheet_number, title, discipline, revision_number, stage,
      file_url, pdf_page, is_superseded, set_approval_status,
      extracted_text, callouts
    ) VALUES (
      p_project_id, v_project_name, p_drawing_set_id, v_set.set_name,
      btrim(v_entry->>'sheet_number'), btrim(v_entry->>'sheet_title'),
      coalesce(nullif(btrim(v_entry->>'discipline'), ''), v_set.discipline, 'Structural'),
      v_code, 'Not Started', p_file_path, v_pdf_page, false, 'pending_review',
      CASE WHEN v_entry ? 'extracted_text' THEN v_entry->>'extracted_text' ELSE NULL END,
      CASE WHEN v_entry ? 'callouts' THEN v_entry->'callouts' ELSE '[]'::jsonb END
    ) RETURNING id INTO v_drawing_id;
    INSERT INTO public.drawing_revisions (
      project_id, drawing_id, revision_code, sheet_number, sheet_title,
      version_number, is_current, file_url, pdf_page, issued_at,
      revision_notes, release_status, created_by
    ) VALUES (
      p_project_id, v_drawing_id, v_code, btrim(v_entry->>'sheet_number'),
      btrim(v_entry->>'sheet_title'), 1, true, p_file_path, v_pdf_page,
      p_issued_date::timestamptz, p_notes, 'received', v_actor
    ) RETURNING id INTO v_new_revision_id;
    v_source_pages := v_source_pages || jsonb_build_array(jsonb_build_object(
      'drawing_id', v_drawing_id, 'drawing_revision_id', v_new_revision_id,
      'sheet_number', btrim(v_entry->>'sheet_number'), 'pdf_page', v_pdf_page,
      'file_path', p_file_path
    ));
    v_added := v_added + 1;
  END LOOP;

  IF v_revised + v_added + v_removed = 0 THEN
    RAISE EXCEPTION 'Reviewed revision has no sheet changes' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_final_count FROM public.drawings d
  WHERE d.project_id = p_project_id AND d.drawing_set_id = p_drawing_set_id
    AND d.is_deleted = false AND d.deleted_at IS NULL AND NOT coalesce(d.is_superseded, false);
  IF v_final_count = 0 THEN
    RAISE EXCEPTION 'A drawing set cannot be left without an active sheet'
      USING ERRCODE = '22023';
  END IF;

  -- Header publication is last. The prior approval is a historical snapshot;
  -- this issue is pending review and has no inherited current submittal.
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'revisionLabel', v_set.revision, 'issueDate', v_set.issued_date,
    'issuedBy', v_set.issued_by, 'fileUrl', v_set.file_url,
    'sheetCount', v_set.sheet_count, 'notes', coalesce(v_set.notes, ''),
    'approvalStatus', v_set.set_approval_status,
    'approvedDate', v_set.set_approved_date, 'approvedBy', v_set.set_approved_by,
    'uploadedAt', now(), 'status', p_previous_disposition
  ));
  UPDATE public.drawing_sets SET
    revision = btrim(p_revision_label), issued_date = p_issued_date,
    issued_by = coalesce(nullif(btrim(p_issued_by), ''), v_set.issued_by),
    notes = coalesce(nullif(btrim(p_notes), ''), v_set.notes),
    file_url = p_file_path, revision_history = v_history::text,
    sheet_count = v_final_count, set_approval_status = 'pending_review',
    set_approved_date = NULL, set_approved_by = NULL,
    set_approval_notes = NULL, current_submittal_id = NULL,
    submittal_status = NULL
  WHERE id = p_drawing_set_id AND project_id = p_project_id;

  v_result := jsonb_build_object(
    'applied', true, 'project_id', p_project_id,
    'drawing_set_id', p_drawing_set_id, 'request_id', p_request_id,
    'revision_label', btrim(p_revision_label), 'file_path', p_file_path,
    'sheet_count', v_final_count, 'revised', v_revised,
    'added', v_added, 'removed', v_removed, 'unchanged', v_unchanged,
    'source_pages', v_source_pages, 'reviewed_by', v_actor
  );
  UPDATE public.drawing_revision_apply_requests SET result = v_result
    WHERE project_id = p_project_id AND request_id = p_request_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_reviewed_shop_drawing_revision(
  uuid, uuid, uuid, timestamptz, text, text, date, text, text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_reviewed_shop_drawing_revision(
  uuid, uuid, uuid, timestamptz, text, text, date, text, text, text, text, jsonb
) TO authenticated;

NOTIFY pgrst, 'reload schema';
