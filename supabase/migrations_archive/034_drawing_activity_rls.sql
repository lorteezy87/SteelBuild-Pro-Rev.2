-- ============================================================================
-- 034_drawing_activity_rls.sql
--
-- Closes the remaining wildcard-policy finding from the enterprise audit:
-- drawing_activity had drawing_activity_auth_all with qual:true for the
-- {authenticated} role — any authenticated user could read every project's
-- drawing activity log.
--
-- Lower severity than 5.1/5.2 (anonymous access is not possible — restricted
-- to {authenticated}), but still leaks cross-project revision history in a
-- multi-user scenario. Not triggered today because the app is single-user
-- and because no app code reads drawing_activity directly (verified via
-- grep: DrawingActivity entity is registered in supabaseClient.js but has
-- zero callers).
--
-- Replacing with the standard 5-policy project-scoped pattern used on
-- action_items, alerts, mitigation_actions, mitigation_logs, etc.
--
-- Pre-migration verification:
--   - drawing_activity.project_id is uuid NOT NULL ✓
--   - Zero app-code references to DrawingActivity entity beyond registration
--   - Activity is populated by DB triggers running as postgres role
--     (bypasses RLS), so write-side behavior is unaffected
-- ============================================================================

DROP POLICY IF EXISTS drawing_activity_auth_all ON public.drawing_activity;

CREATE POLICY project_member_access ON public.drawing_activity
  FOR ALL TO authenticated
  USING (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawing_activity.project_id
    ))
  )
  WITH CHECK (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawing_activity.project_id
    ))
  );

CREATE POLICY project_select ON public.drawing_activity
  FOR SELECT TO authenticated
  USING (user_has_project_access(project_id));

CREATE POLICY project_insert ON public.drawing_activity
  FOR INSERT TO authenticated
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_update ON public.drawing_activity
  FOR UPDATE TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_delete ON public.drawing_activity
  FOR DELETE TO authenticated
  USING (user_has_project_access(project_id));
