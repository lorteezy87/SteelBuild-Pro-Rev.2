-- Security remediation (F-1 follow-up): harden the SECURITY DEFINER functions
-- the `authenticated_security_definer_function_executable` advisor flagged.
--
-- The advisor flags every SECURITY DEFINER function the `authenticated` role can
-- execute. Most flagged functions are RLS helpers (user_has_project_access,
-- get_my_project_role, user_is_*, set_for_*_is_locked) that MUST stay executable
-- by authenticated or RLS itself stops working — those are accepted as-is (they
-- already pin search_path). create_project already enforces auth.uid(). This
-- migration fixes the four where the grant is an actual authz gap or pointless:
--
--   1. delete_drawing_set(uuid): SECURITY DEFINER (so it bypasses RLS) but
--      performed NO authorization check — any authenticated user could
--      soft-delete ANY project's drawing set, cascading to its sheets, by
--      passing a set id. Cross-tenant destructive IDOR. Add an admin-role guard
--      on the set's own project, matching both the table's hard-DELETE policy
--      (drawing_sets_delete_admin = user_has_project_role_at_least 'admin') and
--      the client gate (can('delete') requires admin level), so no legitimate
--      caller is affected.
--   2. get_next_sequence_number(uuid,text): SECURITY DEFINER, no check — any user
--      could bump another project's counter by passing its id. Add a
--      project-membership guard (matches the create flow that calls it).
--   3. reconcile_stuck_extractions(): maintenance reset invoked only by pg_cron
--      (runs as the job owner), never by clients. Revoke EXECUTE from
--      authenticated/anon/public.
--   4. rls_auto_enable(): an event-trigger function — it cannot be invoked
--      directly at all, so the authenticated grant is meaningless. Revoke it.
--
-- Verified before applying: neither delete_drawing_set nor get_next_sequence_number
-- has any DB-internal or Edge Function caller; both are only called from the
-- authenticated browser client, so the guards cannot break a service_role/trigger
-- path. Function bodies are otherwise unchanged (security definer, search_path,
-- return types preserved).

-- 1 ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_drawing_set(p_set_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_child_count INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM drawing_sets WHERE id = p_set_id;
  IF v_project_id IS NULL THEN
    RETURN 0;  -- set doesn't exist or is already gone; nothing to delete
  END IF;

  IF NOT public.user_has_project_role_at_least(v_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete this drawing set'
      USING ERRCODE = '42501';
  END IF;

  WITH updated AS (
    UPDATE drawings
       SET is_deleted = TRUE,
           deleted_at = v_now,
           updated_at = v_now
     WHERE drawing_set_id = p_set_id
       AND (is_deleted IS NULL OR is_deleted = FALSE)
     RETURNING id
  )
  SELECT COUNT(*) INTO v_child_count FROM updated;

  UPDATE drawing_sets
     SET is_deleted = TRUE,
         deleted_at = v_now,
         updated_at = v_now
   WHERE id = p_set_id
     AND (is_deleted IS NULL OR is_deleted = FALSE);

  RETURN v_child_count;
END;
$function$;

-- 2 ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_next_sequence_number(p_project_id uuid, p_record_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.user_has_project_access(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (p_project_id, p_record_type, 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET next_value = number_sequences.next_value + 1,
                updated_at = now()
  RETURNING next_value - 1 INTO v_next;

  RETURN v_next;
END;
$function$;

-- 3 & 4 ───────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reconcile_stuck_extractions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()             FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
