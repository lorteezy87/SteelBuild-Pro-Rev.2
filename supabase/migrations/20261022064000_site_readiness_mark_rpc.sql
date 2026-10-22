-- Atomic per-item update for erection site-readiness checklists.
--
-- A readiness checklist is one action_items row (category SITE_READINESS)
-- whose marks live in metadata.site_readiness.marks. Writing the whole jsonb
-- value from the client let two users ticking different items at the same time
-- erase each other's tick. This function sets ONE item under a row lock, so
-- concurrent ticks serialize and every one survives.
--
-- SECURITY INVOKER: the caller's own RLS applies. SELECT ... FOR UPDATE and the
-- UPDATE both pass through the action_items UPDATE policy
-- (user_has_project_role_at_least(project_id, 'field')), so a user who cannot
-- edit the row gets "not found" and changes nothing.
--
-- The item keys mirror READINESS_ITEMS in src/lib/fieldOversight/readiness.ts;
-- a unit test fails if the two lists drift. Status follows readinessStatus():
-- Complete when every item is done or N/A, otherwise Open — except a row that
-- was Cancelled or Closed by hand stays that way until the checklist completes.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_site_readiness_mark(
  p_action_item_id uuid,
  p_key text,
  p_state text,
  p_by text
)
RETURNS public.action_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_keys constant text[] := ARRAY[
    'anchors', 'concrete', 'repairs', 'access', 'pad', 'laydown',
    'steel', 'overhead', 'controlling', 'lift', 'inspector'
  ];
  v_row public.action_items;
  v_section jsonb;
  v_marks jsonb;
  v_complete boolean;
BEGIN
  IF p_key IS NULL OR NOT (p_key = ANY (v_keys)) THEN
    RAISE EXCEPTION 'Unknown site readiness item: %', p_key USING ERRCODE = '22023';
  END IF;
  IF p_state IS NOT NULL AND p_state NOT IN ('done', 'na') THEN
    RAISE EXCEPTION 'Readiness state must be done, na or null' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.action_items
  WHERE id = p_action_item_id
    AND category = 'SITE_READINESS'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site readiness checklist not found' USING ERRCODE = 'P0002';
  END IF;

  v_section := CASE
    WHEN jsonb_typeof(v_row.metadata -> 'site_readiness') = 'object' THEN v_row.metadata -> 'site_readiness'
    ELSE '{}'::jsonb
  END;
  v_marks := CASE
    WHEN jsonb_typeof(v_section -> 'marks') = 'object' THEN v_section -> 'marks'
    ELSE '{}'::jsonb
  END;

  IF p_state IS NULL THEN
    v_marks := v_marks - p_key;
  ELSE
    v_marks := v_marks || jsonb_build_object(
      p_key,
      jsonb_build_object(
        'state', p_state,
        'by', nullif(btrim(coalesce(p_by, '')), ''),
        'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
  END IF;

  SELECT bool_and(v_marks ? k) INTO v_complete FROM unnest(v_keys) AS k;

  UPDATE public.action_items
  SET metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
             'site_readiness',
             v_section || jsonb_build_object('version', 1, 'marks', v_marks)
           ),
      status = CASE
        WHEN v_complete THEN 'Complete'
        WHEN status IN ('Cancelled', 'Closed') THEN status
        ELSE 'Open'
      END
  WHERE id = p_action_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_site_readiness_mark(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_site_readiness_mark(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_site_readiness_mark(uuid, text, text, text) IS
  'Sets one erection site-readiness item (done | na | null to reopen) under a row lock and reconciles the action item status. SECURITY INVOKER: action_items RLS applies.';

COMMIT;

NOTIFY pgrst, 'reload schema';
