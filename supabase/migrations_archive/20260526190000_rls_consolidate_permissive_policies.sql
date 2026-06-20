-- 20260526190000_rls_consolidate_permissive_policies.sql (Batch 1)
--
-- Consolidate redundant PERMISSIVE RLS policies (Supabase
-- multiple_permissive_policies perf advisor). Postgres ORs all permissive
-- policies for a (role, action) and evaluates each per row; duplicates cost
-- per-row eval with no access benefit. Every drop below removes a policy whose
-- access is already provided, byte-for-byte, by a surviving sibling policy with
-- a STRING-IDENTICAL condition -- so the OR result (and thus access) is
-- unchanged. Perf-only; no grant change. Verified against pg_policies before
-- and after applying (143 -> 5 findings). FK/PK/unique and stricter (lock-aware
-- / admin-only) policies are left intact. Applied live via Supabase MCP
-- (user-confirmed) 2026-05-26.
--
-- The residual 5 findings (projects, user_projects, default_cost_codes,
-- feature_flags) are special-cased in a follow-up batch.

-- A1 (32 tables): drop the FOR ALL `project_member_access`. The four
-- per-command policies project_{select,insert,update,delete} each carry the
-- identical condition user_has_project_access(project_id) in USING/WITH CHECK,
-- so they fully replicate project_member_access for every action.
DROP POLICY IF EXISTS project_member_access ON public.action_items;
DROP POLICY IF EXISTS project_member_access ON public.alerts;
DROP POLICY IF EXISTS project_member_access ON public.change_orders;
DROP POLICY IF EXISTS project_member_access ON public.change_requests;
DROP POLICY IF EXISTS project_member_access ON public.contacts;
DROP POLICY IF EXISTS project_member_access ON public.cost_codes;
DROP POLICY IF EXISTS project_member_access ON public.daily_logs;
DROP POLICY IF EXISTS project_member_access ON public.deliveries;
DROP POLICY IF EXISTS project_member_access ON public.documents;
DROP POLICY IF EXISTS project_member_access ON public.drawing_activity;
DROP POLICY IF EXISTS project_member_access ON public.expenses;
DROP POLICY IF EXISTS project_member_access ON public.inspections;
DROP POLICY IF EXISTS project_member_access ON public.look_ahead;
DROP POLICY IF EXISTS project_member_access ON public.meetings;
DROP POLICY IF EXISTS project_member_access ON public.mitigation_actions;
DROP POLICY IF EXISTS project_member_access ON public.mitigation_logs;
DROP POLICY IF EXISTS project_member_access ON public.number_sequences;
DROP POLICY IF EXISTS project_member_access ON public.photos;
DROP POLICY IF EXISTS project_member_access ON public.pma_assumptions;
DROP POLICY IF EXISTS project_member_access ON public.pma_decisions;
DROP POLICY IF EXISTS project_member_access ON public.production_notes;
DROP POLICY IF EXISTS project_member_access ON public.project_closeout;
DROP POLICY IF EXISTS project_member_access ON public.punchlist_items;
DROP POLICY IF EXISTS project_member_access ON public.quality_control_records;
DROP POLICY IF EXISTS project_member_access ON public.resources;
DROP POLICY IF EXISTS project_member_access ON public.rfis;
DROP POLICY IF EXISTS project_member_access ON public.safety_incidents;
DROP POLICY IF EXISTS project_member_access ON public.schedule_tasks;
DROP POLICY IF EXISTS project_member_access ON public.scope_items;
DROP POLICY IF EXISTS project_member_access ON public.sov_items;
DROP POLICY IF EXISTS project_member_access ON public.warranties;
DROP POLICY IF EXISTS project_member_access ON public.work_packages;

-- drawings: drop the generic project_* duplicates of the domain drawings_*
-- family. drawings_{select,insert,delete} carry the identical
-- user_has_project_access(project_id) condition; drawings_update (the lock-aware
-- WITH CHECK) is the sole UPDATE policy and is untouched.
DROP POLICY IF EXISTS project_select ON public.drawings;
DROP POLICY IF EXISTS project_insert ON public.drawings;
DROP POLICY IF EXISTS project_delete ON public.drawings;

-- drawing_sets: drop the generic project_* duplicates of the domain
-- drawing_sets_* family. drawing_sets_{select,insert,update} carry the identical
-- condition; drawing_sets_delete_admin (admin-only DELETE) is the sole DELETE
-- policy and is untouched.
DROP POLICY IF EXISTS project_select ON public.drawing_sets;
DROP POLICY IF EXISTS project_insert ON public.drawing_sets;
DROP POLICY IF EXISTS project_update ON public.drawing_sets;

-- drawing_zone_activity: two byte-identical FOR ALL policies
-- (user_has_project_access(project_id)); drop the duplicate, keep
-- drawing_zone_activity_project_access.
DROP POLICY IF EXISTS zone_activity_project_access ON public.drawing_zone_activity;

NOTIFY pgrst, 'reload schema';
