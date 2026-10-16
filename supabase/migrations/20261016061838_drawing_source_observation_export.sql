-- UNINSTALLED CANDIDATE. Requires the reviewed drawing command package.
-- Public caller-JWT reader only; no direct access to observations or receipts.
-- Transaction control belongs to the reviewed whole-package manual wrapper.
CREATE INDEX drawing_source_observations_project_cursor
  ON steelbuild_drawing_revision.source_observations(project_id,receipt_id,drawing_id);

CREATE FUNCTION public.get_drawing_source_observations(
  p_project_id uuid,p_after_receipt uuid DEFAULT NULL,p_after_drawing uuid DEFAULT NULL,
  p_snapshot_token text DEFAULT NULL,p_limit integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_result jsonb;
BEGIN
  -- Same membership/MFA boundary as project-owned drawing reads, including
  -- viewers. No mutation-role floor, status-label gate, or system-admin bypass.
  IF auth.uid() IS NULL OR NOT coalesce(steelbuild_security.satisfies_mfa(),false)
    OR NOT coalesce(public.user_has_project_access(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND NOT coalesce(is_deleted,false)) THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>500
    OR (p_after_receipt IS NULL)<>(p_after_drawing IS NULL)
    OR (p_after_receipt IS NOT NULL AND p_snapshot_token IS NULL)
    OR (p_snapshot_token IS NOT NULL AND p_snapshot_token !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_INVALID_CURSOR' USING ERRCODE='22023';
  END IF;
  -- STABLE gives every query the invoking statement snapshot. The roster
  -- fingerprint and page below also share one SQL statement explicitly.
  -- The full identity scan is mandated per page; payloads are read only for
  -- limit+1 rows. No cap, N+1 lookups, mutable actor fields, or replay keys.
  WITH roster AS MATERIALIZED (
    SELECT encode(sha256(convert_to(p_project_id::text||':'||coalesce(
      string_agg(receipt_id::text||':'||drawing_id::text,',' ORDER BY receipt_id,drawing_id),''),'UTF8')),'hex') token
    FROM steelbuild_drawing_revision.source_observations WHERE project_id=p_project_id
  ), page AS MATERIALIZED (
    SELECT receipt_id,drawing_id,project_id,drawing_set_id,parent_file_url,parent_pdf_page,parent_revision_number,
      parent_updated_at,observed_current_revision_id,observed_current_revision_version,extracted_text,callouts,recorded_at,
      callouts IS NULL AS callouts_is_sql_null
    FROM (
      (SELECT * FROM steelbuild_drawing_revision.source_observations
       WHERE project_id=p_project_id AND p_after_receipt IS NULL
       ORDER BY receipt_id,drawing_id LIMIT p_limit+1)
      UNION ALL
      (SELECT * FROM steelbuild_drawing_revision.source_observations
       WHERE project_id=p_project_id AND p_after_receipt IS NOT NULL
         AND (receipt_id,drawing_id)>(p_after_receipt,p_after_drawing)
       ORDER BY receipt_id,drawing_id LIMIT p_limit+1)
    ) bounded_page
    WHERE (p_snapshot_token IS NULL OR p_snapshot_token=(SELECT token FROM roster))
    ORDER BY receipt_id,drawing_id LIMIT p_limit+1
  ), visible AS MATERIALIZED (SELECT * FROM page ORDER BY receipt_id,drawing_id LIMIT p_limit)
  SELECT jsonb_build_object('version',1,'snapshot_token',roster.token,
    '_cursor_valid',p_after_receipt IS NULL OR EXISTS(
      SELECT 1 FROM steelbuild_drawing_revision.source_observations
      WHERE project_id=p_project_id AND receipt_id=p_after_receipt AND drawing_id=p_after_drawing),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY receipt_id,drawing_id) FROM visible v),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN
      (SELECT jsonb_build_object('receipt_id',receipt_id,'drawing_id',drawing_id) FROM visible ORDER BY receipt_id DESC,drawing_id DESC LIMIT 1)
      ELSE NULL END) INTO v_result FROM roster;
  IF p_snapshot_token IS NOT NULL AND p_snapshot_token<>v_result->>'snapshot_token' THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_CONFLICT: observation roster changed' USING ERRCODE='40001';
  END IF;
  IF NOT (v_result->>'_cursor_valid')::boolean THEN
    RAISE EXCEPTION 'DRAWING_EXPORT_INVALID_CURSOR' USING ERRCODE='22023';
  END IF;
  RETURN v_result-'_cursor_valid';
END $$;
REVOKE ALL ON FUNCTION public.get_drawing_source_observations(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_drawing_source_observations(uuid,uuid,uuid,text,integer) TO authenticated;
