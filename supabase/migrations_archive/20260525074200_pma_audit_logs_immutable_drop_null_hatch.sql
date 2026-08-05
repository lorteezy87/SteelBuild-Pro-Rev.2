-- Security remediation (F-1 follow-up): pma_audit_logs — remove the
-- `project_id IS NULL` fail-open escape hatch AND restore the append-only /
-- immutable audit semantics that migration 011 originally intended.
--
-- Findings (live policy audit, 2026-05-25):
--   * audit_insert / audit_select (from 011_rls_project_isolation) both resolve to
--       (project_id IS NULL OR EXISTS(... user_projects membership ...)).
--     project_id is NOT NULL on this table, so the NULL branch is unreachable for
--     any real row — but it is a latent fail-open pattern, and these policies are
--     now exact duplicates of the canonical project_select/project_insert policies
--     (which use user_has_project_access). PostgreSQL OR-combines permissive
--     policies, so the duplicates add nothing but the dead null hatch.
--   * project_update / project_delete policies had drifted onto the table.
--     011 deliberately created NO update/delete policies ("audit entries remain
--     immutable"); the added policies let any project member tamper with or delete
--     audit records — a regression against the audit trail's tamper-resistance.
--
-- Writers are unaffected: rows are written by the SECURITY DEFINER audit_log_trigger
-- (bypasses RLS). No client code inserts/updates/deletes pma_audit_logs via RLS
-- (PmaAuditLog entity client has zero consumers; auditLogger.ts writes to activities).
--
-- Fix: drop the legacy null-hatch policies and the tamper policies; keep a single
-- canonical member-scoped INSERT + SELECT pair (user_has_project_access), recreated
-- idempotently because they exist live but were never committed to a migration.

DROP POLICY IF EXISTS audit_insert   ON public.pma_audit_logs;
DROP POLICY IF EXISTS audit_select   ON public.pma_audit_logs;
DROP POLICY IF EXISTS project_update ON public.pma_audit_logs;
DROP POLICY IF EXISTS project_delete ON public.pma_audit_logs;

DROP POLICY IF EXISTS project_select ON public.pma_audit_logs;
CREATE POLICY project_select ON public.pma_audit_logs
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.pma_audit_logs;
CREATE POLICY project_insert ON public.pma_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));

-- No UPDATE or DELETE policies — audit entries are immutable (matches 011 intent).

NOTIFY pgrst, 'reload schema';
