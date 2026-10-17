-- Review-only until the exact committed payload is manually applied and stamped.
-- Last-sheet soft deletion must not archive a drawing set: sheet Undo cannot
-- authorize restoring a separately archived parent. Explicit set deletion is
-- still the existing admin operation. No historical tombstones are repaired.
-- The deployed helper was captured in production-public-functions-2026-09-15.sql.
-- Preserve its entire signature/configuration/ACL and replace only its body.
DO $migration$
DECLARE
  v_helper oid := to_regprocedure('public.recount_drawing_set(uuid)');
  v_source text;
  v_definition text;
  v_acl text;
  v_owner oid;
  v_definer boolean;
  v_config text[];
  v_language text;
  v_hash text;
  v_fixed_source text := $recount$
begin
  update public.drawing_sets ds set
    sheet_count        = (select count(*) from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    processed_count    = (select count(*) filter (where ai_extraction_status = 'Processed') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    needs_review_count = (select count(*) filter (where ai_extraction_status = 'NeedsReview') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    failed_count       = (select count(*) filter (where ai_extraction_status = 'Failed' or upload_status = 'Failed') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    updated_at         = now()
  where ds.id = p_set_id;

end;
$recount$;
BEGIN
  IF v_helper IS NULL THEN
    -- Fresh baseline replay already has the count-only inline trigger. Do not
    -- introduce an optional helper with fresh/default API execution privileges.
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_hash
      FROM pg_proc p WHERE p.oid = to_regprocedure('public.sync_drawing_set_counts()');
    IF v_hash IS DISTINCT FROM '828b321fa38ebe7c91f4d73a14d4e548' THEN
      RAISE EXCEPTION 'Reviewed recount_drawing_set helper is absent and count-only baseline lineage is unverified';
    END IF;
    RAISE NOTICE 'Count-only baseline already preserves empty drawing sets; no helper created';
    RETURN;
  END IF;

  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.proowner,
         p.prosecdef, p.proconfig, l.lanname
    INTO v_source, v_definition, v_acl, v_owner, v_definer, v_config, v_language
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_helper;
  IF NOT v_definer OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR v_language <> 'plpgsql' OR pg_get_function_result(v_helper) <> 'void' THEN
    RAISE EXCEPTION 'recount_drawing_set metadata differs from the reviewed hosted helper';
  END IF;
  v_hash := md5(replace(v_source, chr(13), ''));
  IF v_hash = '88d2db3aeaa1f56d9c9946d4f4bf9757' THEN RETURN; END IF;
  IF v_hash IS DISTINCT FROM '510e63a36ccb6d16d46245bdb9a61140' THEN
    RAISE EXCEPTION 'recount_drawing_set body differs from the reviewed hosted helper';
  END IF;
  -- pg_get_functiondef retains language, security, volatility, cost and settings.
  -- CREATE OR REPLACE on this verified existing object retains owner and ACL.
  EXECUTE replace(v_definition, v_source, v_fixed_source);
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_helper
      AND p.proacl::text IS NOT DISTINCT FROM v_acl AND p.proowner = v_owner) THEN
    RAISE EXCEPTION 'recount_drawing_set owner or execution privileges changed';
  END IF;
END;
$migration$;
