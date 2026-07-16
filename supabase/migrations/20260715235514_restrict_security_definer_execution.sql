-- Security Definer execution lockdown (Batch 44A).
--
-- This migration changes function EXECUTE ACLs only. It does not change
-- function bodies, schemas, tables, data, triggers, or RLS policies.
--
-- SECURITY DEFINER functions in public are otherwise reachable through
-- PostgREST RPC endpoints because PostgreSQL grants EXECUTE to PUBLIC by
-- default. Trigger and event-trigger invocation does not depend on caller
-- EXECUTE privileges, so those functions can be denied to every API role
-- without changing trigger behavior.

-- Internal maintenance and lock/trigger routines. These have no supported
-- browser or Edge Function caller. pg_cron, when installed, runs its jobs as
-- the job owner rather than through the PostgREST API roles.
revoke all on function public.escalate_rfi_sla() from public, anon, authenticated, service_role;
revoke all on function public.reconcile_stuck_extractions() from public, anon, authenticated, service_role;
revoke all on function public.raise_if_drawing_set_locked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.recompute_schedule_summary(uuid) from public, anon, authenticated, service_role;

-- Trigger-only functions. Trigger execution is preserved after these direct
-- RPC grants are removed.
revoke all on function public.activities_stamp_actor() from public, anon, authenticated, service_role;
revoke all on function public.audit_log_trigger() from public, anon, authenticated, service_role;
revoke all on function public.demo_requests_throttle() from public, anon, authenticated, service_role;
revoke all on function public.drawing_watch_notify_impact() from public, anon, authenticated, service_role;
revoke all on function public.drawing_watch_notify_revision() from public, anon, authenticated, service_role;
revoke all on function public.enforce_drawing_set_unlock_role() from public, anon, authenticated, service_role;
revoke all on function public.enforce_org_invite_limit() from public, anon, authenticated, service_role;
revoke all on function public.enforce_org_member_guard() from public, anon, authenticated, service_role;
revoke all on function public.enforce_project_update_guard() from public, anon, authenticated, service_role;
revoke all on function public.enforce_user_projects_membership_identity() from public, anon, authenticated, service_role;
revoke all on function public.guard_drawing_set_lock_for_drawing_links() from public, anon, authenticated, service_role;
revoke all on function public.guard_drawing_set_lock_for_drawing_zone_dependencies() from public, anon, authenticated, service_role;
revoke all on function public.guard_drawing_set_lock_for_drawing_zones() from public, anon, authenticated, service_role;
revoke all on function public.guard_drawing_set_lock_for_drawings() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_project() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.log_drawing_activity() from public, anon, authenticated, service_role;
revoke all on function public.log_drawing_link_activity() from public, anon, authenticated, service_role;
revoke all on function public.log_drawing_zone_activity() from public, anon, authenticated, service_role;
revoke all on function public.log_user_project_member_activity() from public, anon, authenticated, service_role;
revoke all on function public.notify_demo_request() from public, anon, authenticated, service_role;
revoke all on function public.notify_rfi_bic_handoff() from public, anon, authenticated, service_role;
revoke all on function public.org_protect_billing_columns() from public, anon, authenticated, service_role;
revoke all on function public.prevent_schedule_task_cycle() from public, anon, authenticated, service_role;
revoke all on function public.prevent_user_profile_role_change() from public, anon, authenticated, service_role;
revoke all on function public.schedule_task_rollup() from public, anon, authenticated, service_role;
revoke all on function public.seed_default_setup_items() from public, anon, authenticated, service_role;
revoke all on function public.seed_project_cost_codes() from public, anon, authenticated, service_role;
revoke all on function public.set_updated_at_model_elements() from public, anon, authenticated, service_role;
revoke all on function public.trg_projects_seed_handoff_items() from public, anon, authenticated, service_role;
revoke all on function public.vendors_set_org() from public, anon, authenticated, service_role;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- Browser RPCs. These are called from authenticated application workflows or
-- are referenced by authenticated RLS policies. Anonymous and PUBLIC execution
-- is removed while the authenticated contract is preserved explicitly.
revoke all on function public.accept_invitation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.accept_invitation(uuid) to authenticated;
revoke all on function public.create_organization(text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_organization(text, text) to authenticated;
revoke all on function public.create_project(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_project(jsonb) to authenticated;
revoke all on function public.delete_drawing_set(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_drawing_set(uuid) to authenticated;
revoke all on function public.fab_release_blocking_rfis(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.fab_release_blocking_rfis(uuid[]) to authenticated;
revoke all on function public.founding_org_id() from public, anon, authenticated, service_role;
grant execute on function public.founding_org_id() to authenticated;
revoke all on function public.get_invitation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_invitation(uuid) to authenticated;
revoke all on function public.get_my_project_role(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_my_project_role(uuid) to authenticated;
revoke all on function public.get_next_sequence_number(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.get_next_sequence_number(uuid, text) to authenticated;
revoke all on function public.publish_drawing_revision(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.publish_drawing_revision(uuid, text) to authenticated;
revoke all on function public.set_for_drawing_is_locked(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_for_drawing_is_locked(uuid) to authenticated;
revoke all on function public.set_for_zone_is_locked(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_for_zone_is_locked(uuid) to authenticated;
revoke all on function public.soft_delete_project(uuid) from public, anon, authenticated, service_role;
grant execute on function public.soft_delete_project(uuid) to authenticated;
revoke all on function public.submittal_blocking_rfis(uuid) from public, anon, authenticated, service_role;
grant execute on function public.submittal_blocking_rfis(uuid) to authenticated;
revoke all on function public.user_has_project_access(uuid) from public, anon, authenticated, service_role;
grant execute on function public.user_has_project_access(uuid) to authenticated;
revoke all on function public.user_has_project_role(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.user_has_project_role(uuid, text) to authenticated;
revoke all on function public.user_has_project_role_at_least(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.user_has_project_role_at_least(uuid, text) to authenticated;
revoke all on function public.user_is_org_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.user_is_org_member(uuid) to authenticated;
revoke all on function public.user_is_project_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.user_is_project_admin(uuid) to authenticated;
revoke all on function public.user_is_system_admin() from public, anon, authenticated, service_role;
grant execute on function public.user_is_system_admin() to authenticated;
revoke all on function public.user_org_role_at_least(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.user_org_role_at_least(uuid, text) to authenticated;
revoke all on function public.users_share_org(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.users_share_org(uuid, uuid) to authenticated;

-- Internal LLM quota aggregate. The only repository caller uses the service
-- role from the llm-proxy Edge Function; browser and anonymous execution stay
-- denied even if that integration is disabled in staging.
revoke all on function public.get_llm_usage_window(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_llm_usage_window(uuid, timestamptz) to service_role;

-- The hard-delete RPCs are intentionally excluded: account-delete is frozen in
-- Batch 44A, and its existing authenticated/admin-gated contract is unchanged.

notify pgrst, 'reload schema';
