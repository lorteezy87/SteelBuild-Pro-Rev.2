-- Re-homed from migrations_archive (2026-05-25 F-1) so new/staging
-- environments receive the same remediations already applied on prod.
-- Safe to re-run: DROP POLICY IF EXISTS is idempotent.

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
-- 2026-09-05 (Work Package Control Center audit, §4): the original version of
-- this file re-created `project_member_access FOR ALL TO authenticated USING
-- (user_has_project_access(project_id))` on every table below. That policy is
-- membership-only — no role check — so on any environment that applied it, a
-- *viewer* could UPDATE and DELETE work packages, RFIs, change orders, … in
-- OR with the per-role `project_select/insert/update/delete` policies that
-- carry the field/PM floors. Production never ran this file (verified: the
-- work_packages policy set is the four per-role policies only), so this is
-- now DROP-only: it removes the escape hatch and leaves the per-role
-- policies, which already exist on every listed table, as the sole access
-- path.

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
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS project_member_access ON public.%I;', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
