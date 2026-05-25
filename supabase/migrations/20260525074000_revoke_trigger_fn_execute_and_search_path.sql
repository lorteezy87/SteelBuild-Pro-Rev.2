-- Security remediation F-2: lock down trigger/enforcement SECURITY DEFINER functions.
--
-- Audit (docs/audits/SECURITY_MATRIX_2026-05-25.md) found these trigger and
-- enforcement functions had EXECUTE granted to anon/authenticated, exposing them
-- as REST RPCs. Trigger functions fire via the trigger mechanism regardless of
-- the caller's EXECUTE privilege, so revoking direct EXECUTE is safe and removes
-- the surface. seed_default_setup_items was also missing an explicit search_path
-- (the SECURITY DEFINER injection vector the engineering contract forbids).
--
-- The intended RPC helpers (get_my_project_role, user_has_project_access,
-- create_project, delete_drawing_set, get_next_sequence_number, set_for_*_is_locked,
-- the RBAC predicates) deliberately KEEP EXECUTE for authenticated and are untouched.

ALTER FUNCTION public.seed_default_setup_items() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.audit_log_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_drawing_set_unlock_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_projects_membership_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_project() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_drawing_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_drawing_link_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_drawing_zone_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_user_project_member_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_profile_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_setup_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_project_cost_codes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_projects_seed_handoff_items() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
