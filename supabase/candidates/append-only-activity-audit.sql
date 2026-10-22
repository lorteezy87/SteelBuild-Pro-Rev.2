-- UNINSTALLED SOURCE CANDIDATE. Not a release migration or ledger payload.
-- Purpose: make the drawing/submittal activity logs and the row-change audit
-- append-only for application roles, so a project member cannot rewrite or
-- erase the record of who moved a drawing or submittal, or forge audit rows.
--
-- Current state this targets (repo lineage):
--   drawing_activity    project_update / project_delete permissive policies
--                       (baseline B:10104 / B:9505) let any project member edit
--                       or delete rows; restrictive *_role_floor policies only
--                       raise that to field role (20260702034009).
--   submittal_activity  submittal_activity_update / _delete at field role
--                       (20260721030200:238-245).
--   pma_audit_logs      project_insert (B:9760) lets any project member insert
--                       hand-written rows into the server audit. The only
--                       legitimate writer is audit_log_trigger(), which is
--                       SECURITY DEFINER and owned by postgres, so it does not
--                       need a client INSERT policy.
--   All three           GRANT ALL to authenticated (includes TRUNCATE, which
--                       RLS does not govern).
--
-- Unchanged on purpose:
--   * SELECT policies (project-scoped reads keep working).
--   * INSERT on drawing_activity / submittal_activity (log_drawing_activity()
--     and any client logger keep working).
--   * Owner-run paths: hard-erasure RPCs and FK ON DELETE CASCADE run with the
--     table owner's rights and are not affected by these policies or grants.
--   * No triggers are added: production also carries a pma_audit guard from
--     the sibling application's lineage (see production-ownership-manifest),
--     and this file must not collide with it.
--
-- Rollback (documented, not automatic):
--   create policy project_update on public.drawing_activity for update to authenticated
--     using (public.user_has_project_access(project_id)) with check (public.user_has_project_access(project_id));
--   create policy project_delete on public.drawing_activity for delete to authenticated
--     using (public.user_has_project_access(project_id));
--   create policy submittal_activity_update on public.submittal_activity for update to authenticated
--     using (public.user_has_project_role_at_least(project_id, 'field'))
--     with check (public.user_has_project_role_at_least(project_id, 'field'));
--   create policy submittal_activity_delete on public.submittal_activity for delete to authenticated
--     using (public.user_has_project_role_at_least(project_id, 'field'));
--   create policy project_insert on public.pma_audit_logs for insert to authenticated
--     with check (public.user_has_project_access(project_id));
--   grant update, delete, truncate on public.drawing_activity, public.submittal_activity,
--     public.pma_audit_logs to authenticated;
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS project_update ON public.drawing_activity;
DROP POLICY IF EXISTS project_delete ON public.drawing_activity;

DROP POLICY IF EXISTS submittal_activity_update ON public.submittal_activity;
DROP POLICY IF EXISTS submittal_activity_delete ON public.submittal_activity;
-- The baseline FOR ALL policy was replaced in 20260620231716; drop it again in
-- case an environment still carries it, since FOR ALL includes UPDATE/DELETE.
DROP POLICY IF EXISTS project_member_access ON public.submittal_activity;
-- 20260620231716's FOR ALL write policy was split in 20260721030200; same reason.
DROP POLICY IF EXISTS submittal_activity_write ON public.submittal_activity;

DROP POLICY IF EXISTS project_insert ON public.pma_audit_logs;

REVOKE UPDATE, DELETE, TRUNCATE ON public.drawing_activity FROM authenticated, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.submittal_activity FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pma_audit_logs FROM authenticated, anon;

-- Fail closed if a read path was lost along the way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'submittal_activity' AND cmd IN ('SELECT', 'ALL')) THEN
    RAISE EXCEPTION 'submittal_activity has no read policy; refusing to continue';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'drawing_activity' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'drawing_activity has no read policy; refusing to continue';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pma_audit_logs' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'pma_audit_logs has no read policy; refusing to continue';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND tablename IN ('drawing_activity', 'submittal_activity', 'pma_audit_logs')
             AND permissive = 'PERMISSIVE' AND cmd IN ('UPDATE', 'DELETE', 'ALL')) THEN
    RAISE EXCEPTION 'a permissive UPDATE/DELETE/ALL policy remains on an audit table';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
