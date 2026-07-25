-- Slice 8 (2026-07-25): package fab-release preflight requires IFC/Released.
-- Adds a not_ifc_ready blocker that reuses piece_control_drawing_is_approved
-- (Slice 6). Open RFI / rejected / superseded / unresolved checks unchanged.

CREATE OR REPLACE FUNCTION "public"."evaluate_fab_release_package"(
  p_drawing_ids uuid[]
)
RETURNS TABLE(
  kind text,
  title text,
  sheet_numbers text[],
  rfi_numbers text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rfis text[];
  v_rejected text[];
  v_superseded text[];
  v_unresolved text[];
  v_not_ifc text[];
BEGIN
  -- Open RFIs
  SELECT coalesce(array_agg(DISTINCT b.rfi_number) FILTER (WHERE b.rfi_number IS NOT NULL), '{}')
    INTO v_rfis
  FROM public.fab_release_blocking_rfis(coalesce(p_drawing_ids, '{}')) b;

  IF array_length(v_rfis, 1) IS NOT NULL THEN
    kind := 'open_rfis';
    title := format('%s open RFI(s) reference this package', array_length(v_rfis, 1));
    sheet_numbers := '{}';
    rfi_numbers := v_rfis;
    RETURN NEXT;
  END IF;

  -- Rejected / R&R sheets (sheet fields + legacy status vocabulary)
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_rejected
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          ~ '(reject|revise|resubmit|returned|r&r)';

  IF array_length(v_rejected, 1) IS NOT NULL THEN
    kind := 'rejected_sheets';
    title := format('%s rejected / revise-and-resubmit sheet(s)', array_length(v_rejected, 1));
    sheet_numbers := v_rejected;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Superseded sheets
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_superseded
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS TRUE;

  IF array_length(v_superseded, 1) IS NOT NULL THEN
    kind := 'revision_conflict';
    title := format('%s sheet(s) with a superseded revision', array_length(v_superseded, 1));
    sheet_numbers := v_superseded;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Unresolved current revision
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_unresolved
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS DISTINCT FROM true
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.drawing_revisions r
        WHERE r.drawing_id = d.id
          AND r.is_current = true
          AND r.archived_at IS NULL
          AND r.release_status IN ('on_hold', 'void', 'pending_review')
      )
    );

  IF array_length(v_unresolved, 1) IS NOT NULL THEN
    kind := 'unresolved_revision';
    title := format('%s sheet(s) with an unresolved current revision', array_length(v_unresolved, 1));
    sheet_numbers := v_unresolved;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  -- Slice 8: not IFC / Released (reuse piece_control_drawing_is_approved)
  SELECT coalesce(array_agg(d.sheet_number ORDER BY d.sheet_number)
                    FILTER (WHERE d.sheet_number IS NOT NULL), '{}')
    INTO v_not_ifc
  FROM public.drawings d
  WHERE d.id = ANY (coalesce(p_drawing_ids, '{}'))
    AND d.is_deleted IS DISTINCT FROM true
    AND d.is_superseded IS DISTINCT FROM true
    AND NOT public.piece_control_drawing_is_approved(d.id)
    AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
          !~ '(reject|revise|resubmit|returned|r&r)';

  IF array_length(v_not_ifc, 1) IS NOT NULL THEN
    kind := 'not_ifc_ready';
    title := format('%s sheet(s) not IFC / Released for fabrication', array_length(v_not_ifc, 1));
    sheet_numbers := v_not_ifc;
    rfi_numbers := '{}';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION "public"."evaluate_fab_release_package"(uuid[]) IS
  'Package fab-release preflight: open RFIs, rejected/R&R, superseded, unresolved revision, and not-IFC/Released (Slice 8).';
