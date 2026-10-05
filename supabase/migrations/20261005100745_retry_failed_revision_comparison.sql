-- Pending reviewed backend release; do not apply from the browser or CI.
-- A terminal failure needs an authorized transition before it can be recorded
-- again. Completed reviews and archived evidence are never reopened.
BEGIN;

CREATE OR REPLACE FUNCTION public.retry_revision_comparison(p_comparison_id uuid)
RETURNS public.drawing_revision_comparisons
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  comparison public.drawing_revision_comparisons;
  previous_rpc text := coalesce(current_setting('steelbuild.revcmp_rpc', true), '');
BEGIN
  SELECT * INTO comparison
  FROM public.drawing_revision_comparisons
  WHERE id = p_comparison_id AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comparison not found' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT auth.uid()) IS NULL
     OR NOT coalesce(public.user_has_project_role_at_least(comparison.project_id, 'pm'), false) THEN
    RAISE EXCEPTION 'Revision analysis needs a project manager' USING ERRCODE = '42501';
  END IF;
  IF comparison.source IS DISTINCT FROM 'revision'
     OR comparison.compare_status IS DISTINCT FROM 'error' THEN
    RAISE EXCEPTION 'Only failed revision comparisons can be retried' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.drawings
    WHERE id = comparison.drawing_id AND project_id = comparison.project_id AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Sheet not found' USING ERRCODE = 'P0002';
  END IF;
  -- Never reopen a row with recorded findings, even if legacy data is inconsistent.
  IF EXISTS (SELECT 1 FROM public.drawing_revision_deltas WHERE comparison_id = comparison.id)
     OR coalesce(comparison.delta_count, 0) <> 0 THEN
    RAISE EXCEPTION 'A comparison with recorded findings cannot be retried' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('steelbuild.revcmp_rpc', 'on', true);
  UPDATE public.drawing_revision_comparisons
  SET compare_status = 'processing', completed_at = NULL
  WHERE id = comparison.id
  RETURNING * INTO comparison;
  PERFORM set_config('steelbuild.revcmp_rpc', previous_rpc, true);
  RETURN comparison;
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_revision_comparison(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_revision_comparison(uuid) TO authenticated;
COMMENT ON FUNCTION public.retry_revision_comparison(uuid) IS
  'PM-authorized retry of an active, failed revision comparison without recorded findings.';

COMMIT;
