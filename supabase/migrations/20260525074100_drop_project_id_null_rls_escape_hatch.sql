-- Security remediation F-1: remove the `project_id IS NULL` escape hatch.
--
-- Audit (docs/audits/SECURITY_MATRIX_2026-05-25.md) found that the permissive
-- `project_member_access` policy (cmd=ALL) on these tables resolved to
--   ((project_id IS NULL) OR EXISTS(... user_projects membership ...))
-- Because PostgreSQL OR's permissive policies, any row with project_id IS NULL was
-- readable AND writable by every authenticated user. A live row-count found zero
-- such rows today, so this is a latent fail-open pattern (and an INSERT path that
-- let any member create cross-tenant-visible rows), not active exposure.
--
-- Fix: regenerate the policy using the canonical user_has_project_access(project_id)
-- helper (already used by the sibling project_select/update/delete policies on these
-- tables), which is a clean membership EXISTS check that fails closed on NULL.
-- Roles (authenticated) and command (ALL) are preserved exactly.

DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'action_items','alerts','budget_hour_items','change_orders','change_requests',
    'contacts','cost_codes','daily_logs','deliveries','documents','drawing_activity',
    'expenses','inspections','look_ahead','meetings','mitigation_actions','mitigation_logs',
    'number_sequences','photos','pma_assumptions','pma_decisions','production_notes',
    'project_closeout','punchlist_items','quality_control_records','resources','rfis',
    'risks','safety_incidents','schedule_tasks','scope_items','sov_items','warranties',
    'work_packages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS project_member_access ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY project_member_access ON public.%I
        FOR ALL TO authenticated
        USING (user_has_project_access(project_id))
        WITH CHECK (user_has_project_access(project_id));
    $f$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
