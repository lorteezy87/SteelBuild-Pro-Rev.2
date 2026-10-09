-- A package preflight and fab_release_log insert must use the same complete,
-- current drawing-set evidence as work-package release. The former evaluator
-- checked selected sheet fields and governing_stage only; the log trigger saw
-- only IDs supplied by the browser. Neither was sufficient when a sibling
-- sheet acquired a hold, a new received revision, or an open set-level RFI.
-- Apply and hand-stamp this exact migration only through reviewed release.

-- Preserve the existing sheet/RFI checks behind the public RPC while adding
-- set-level blockers to the same result shape. Keep the base helper private.
ALTER FUNCTION public.evaluate_fab_release_package(uuid[])
  RENAME TO evaluate_fab_release_package_base;
REVOKE ALL ON FUNCTION public.evaluate_fab_release_package_base(uuid[])
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.evaluate_fab_release_package(p_drawing_ids uuid[])
RETURNS TABLE(kind text, title text, sheet_numbers text[], rfi_numbers text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_project_id uuid;
  v_set_id uuid;
  v_eval jsonb;
  v_blocker jsonb;
BEGIN
  RETURN QUERY SELECT base.kind, base.title, base.sheet_numbers, base.rfi_numbers
    FROM public.evaluate_fab_release_package_base(p_drawing_ids) base;

  IF cardinality(coalesce(p_drawing_ids, '{}'::uuid[])) = 0 THEN
    kind := 'no_drawings'; title := 'No drawing sheets were selected for release';
    sheet_numbers := '{}'::text[]; rfi_numbers := '{}'::text[]; RETURN NEXT;
    RETURN;
  END IF;

  SELECT d.project_id INTO v_project_id
    FROM public.drawings d WHERE d.id = ANY(p_drawing_ids) LIMIT 1;
  IF v_project_id IS NULL OR EXISTS (
    SELECT 1 FROM unnest(p_drawing_ids) requested(id)
    LEFT JOIN public.drawings d ON d.id = requested.id
    WHERE d.id IS NULL OR d.project_id <> v_project_id
       OR d.is_deleted = true OR d.deleted_at IS NOT NULL
       OR d.drawing_set_id IS NULL
  ) THEN
    kind := 'invalid_drawing_scope';
    title := 'Release sheets must be active, in one project, and linked to a drawing set';
    sheet_numbers := '{}'::text[]; rfi_numbers := '{}'::text[]; RETURN NEXT;
    RETURN;
  END IF;

  FOR v_set_id IN
    SELECT DISTINCT d.drawing_set_id FROM public.drawings d
     WHERE d.id = ANY(p_drawing_ids) ORDER BY 1
  LOOP
    v_eval := public.evaluate_fab_release_set(v_project_id, v_set_id);
    IF v_eval ->> 'rule_version' IS DISTINCT FROM 'drawing-shop-v2' THEN
      kind := 'unknown_set_gate'; title := 'Drawing-set release rule is unavailable';
      sheet_numbers := '{}'::text[]; rfi_numbers := '{}'::text[]; RETURN NEXT;
    ELSIF coalesce((v_eval ->> 'ok')::boolean, false) = false THEN
      FOR v_blocker IN SELECT value FROM jsonb_array_elements(coalesce(v_eval -> 'blockers', '[]'::jsonb))
      LOOP
        kind := coalesce(v_blocker ->> 'kind', 'drawing_set_blocked');
        title := format('%s: %s', coalesce(v_eval ->> 'set_name', 'Drawing set'),
                        coalesce(v_blocker ->> 'title', 'Release evidence unavailable'));
        sheet_numbers := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_blocker -> 'sheet_numbers', '[]'::jsonb)));
        rfi_numbers := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_blocker -> 'rfi_numbers', '[]'::jsonb)));
        RETURN NEXT;
      END LOOP;
      IF jsonb_array_length(coalesce(v_eval -> 'blockers', '[]'::jsonb)) = 0 THEN
        kind := 'drawing_set_blocked'; title := 'Drawing-set release evidence is incomplete';
        sheet_numbers := '{}'::text[]; rfi_numbers := '{}'::text[]; RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  RETURN;
END
$function$;

REVOKE ALL ON FUNCTION public.evaluate_fab_release_package(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_fab_release_package(uuid[]) TO authenticated, service_role;

-- The canonical piece helper previously read only governing_stage. A clear
-- stage with a blocked set is not an approved drawing for piece release.
CREATE OR REPLACE FUNCTION public.piece_control_drawing_is_approved(p_drawing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce((
    SELECT CASE WHEN coalesce(auth.role(), '') = 'service_role'
                    OR public.user_has_project_access(d.project_id)
      THEN coalesce((public.evaluate_fab_release_set(d.project_id, d.drawing_set_id) ->> 'ok')::boolean, false)
      ELSE false END
      FROM public.drawings d
     WHERE d.id = p_drawing_id AND d.is_deleted = false AND d.deleted_at IS NULL
       AND d.is_superseded = false AND d.drawing_set_id IS NOT NULL
  ), false);
$function$;
REVOKE ALL ON FUNCTION public.piece_control_drawing_is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piece_control_drawing_is_approved(uuid) TO authenticated, service_role;

-- The trigger expands every requested set to all of its live sheets on the
-- server, then checks each entire set in the insert transaction. A normal
-- release cannot omit a blocked sibling. An explicit PM override remains the
-- audited partial-release path; cross-project/unknown IDs are never allowed.
CREATE OR REPLACE FUNCTION public.enforce_fab_release_gate()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_requested uuid[];
  v_sets uuid[];
  v_full_ids uuid[];
  v_set_id uuid;
  v_eval jsonb;
  v_blocking text[] := '{}'::text[];
  v_rejected text[] := '{}'::text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested FROM unnest(coalesce(NEW.drawing_ids, '{}'::uuid[])) id;
  IF cardinality(v_requested) = 0 THEN
    RAISE EXCEPTION 'FAB_RELEASE_BLOCKED: Select active drawing sheets before release';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_requested) requested(id)
    LEFT JOIN public.drawings d ON d.id = requested.id
    WHERE d.id IS NULL OR d.project_id <> NEW.project_id
       OR d.is_deleted = true OR d.deleted_at IS NOT NULL
       OR d.drawing_set_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FAB_RELEASE_BLOCKED: A release sheet is missing, inactive, outside this project, or not linked to a set';
  END IF;

  SELECT coalesce(array_agg(DISTINCT d.drawing_set_id ORDER BY d.drawing_set_id), '{}'::uuid[])
    INTO v_sets FROM public.drawings d WHERE d.id = ANY(v_requested);
  SELECT coalesce(array_agg(DISTINCT d.id ORDER BY d.id), '{}'::uuid[])
    INTO v_full_ids FROM public.drawings d
   WHERE d.project_id = NEW.project_id AND d.drawing_set_id = ANY(v_sets)
     AND d.is_deleted = false AND d.deleted_at IS NULL;

  -- Preserve the original release-log rejection guard over every live sibling,
  -- not just the browser-supplied IDs. A previously IFC submittal does not
  -- clear a sheet subsequently marked rejected or revise-and-resubmit.
  SELECT coalesce(array_agg(coalesce(nullif(btrim(d.sheet_number), ''), d.id::text)
                    ORDER BY d.sheet_number, d.id), '{}'::text[])
    INTO v_rejected FROM public.drawings d
   WHERE d.id = ANY(v_full_ids)
     AND lower(coalesce(d.stage,'') || ' ' || coalesce(d.set_approval_status,'') || ' ' || coalesce(d.ifc_status,''))
           ~ '(reject|revise|resubmit|returned|r&r)';
  IF coalesce(btrim(NEW.override_reason), '') = ''
     AND cardinality(v_rejected) > 0 THEN
    RAISE EXCEPTION
      'FAB_RELEASE_BLOCKED: % sheet marks in this package came back rejected or revise-and-resubmit. Resolve them or release with an override reason. Sheets: %',
      cardinality(v_rejected), array_to_string(v_rejected, ', ');
  END IF;

  SELECT coalesce(array_agg(DISTINCT rfi_number ORDER BY rfi_number), '{}'::text[])
    INTO v_blocking FROM public.fab_release_blocking_rfis(v_full_ids);
  FOREACH v_set_id IN ARRAY v_sets LOOP
    v_eval := public.evaluate_fab_release_set(NEW.project_id, v_set_id);
    IF v_eval ->> 'rule_version' IS DISTINCT FROM 'drawing-shop-v2' THEN
      RAISE EXCEPTION 'FAB_RELEASE_BLOCKED: Drawing-set release rule is unavailable';
    END IF;
    SELECT coalesce(array_agg(DISTINCT number ORDER BY number), '{}'::text[])
      INTO v_blocking FROM (
        SELECT unnest(v_blocking) AS number
        UNION
        SELECT jsonb_array_elements_text(coalesce(v_eval -> 'blocking_rfi_numbers', '[]'::jsonb)) AS number
      ) numbers WHERE number IS NOT NULL;
    IF coalesce(btrim(NEW.override_reason), '') = ''
       AND coalesce((v_eval ->> 'ok')::boolean, false) = false THEN
      RAISE EXCEPTION 'FAB_RELEASE_BLOCKED: Drawing set % has unresolved release evidence: %',
        coalesce(v_eval ->> 'set_name', v_set_id::text), coalesce(v_eval -> 'blockers', '[]'::jsonb);
    END IF;
  END LOOP;

  NEW.blocking_rfi_numbers := v_blocking;
  NEW.drawing_count := cardinality(v_requested);
  IF coalesce(btrim(NEW.override_reason), '') = ''
     AND NOT (v_requested @> v_full_ids AND v_full_ids @> v_requested) THEN
    RAISE EXCEPTION 'FAB_RELEASE_BLOCKED: Include every active sheet in the selected drawing sets or provide an audited PM override reason';
  END IF;
  RETURN NEW;
END
$function$;

NOTIFY pgrst, 'reload schema';
