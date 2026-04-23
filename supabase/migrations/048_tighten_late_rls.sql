-- ============================================================================
-- 048_tighten_late_rls.sql — close the post-011 RLS gap
-- ============================================================================
-- Verify script (Section 4) found six tables still carrying the permissive
-- `auth_all USING (true)` policy. They were all added AFTER migration 011
-- tightened RLS, and each one cribbed from the pre-tightening template in
-- migration 001:
--
--   036 → drawing_analyses, drawing_sheets, drawing_findings
--   039 → drawing_revision_comparisons, drawing_revision_deltas
--   041 → delivery_items
--
-- Active impact on prod: any authenticated user can read every other
-- tenant's drawing-AI analyses, revision deltas, and delivery load-item
-- lists. That's a cross-tenant data leak. This migration replaces the
-- blanket policy with the same project-member-access pattern migration
-- 011 uses, walking FKs where the table has no direct project_id.
--
-- Idempotent: drops before create.
-- ============================================================================

-- ── drawing_analyses ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_analyses;
CREATE POLICY "project_member_access" ON drawing_analyses
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM user_projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM user_projects WHERE user_id = auth.uid()
    )
  );

-- ── drawing_sheets — scope through parent analysis ─────────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_sheets;
CREATE POLICY "project_member_access" ON drawing_sheets
  FOR ALL TO authenticated
  USING (
    analysis_id IN (
      SELECT id FROM drawing_analyses
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    analysis_id IN (
      SELECT id FROM drawing_analyses
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  );

-- ── drawing_findings — scope through parent analysis ───────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_findings;
CREATE POLICY "project_member_access" ON drawing_findings
  FOR ALL TO authenticated
  USING (
    analysis_id IN (
      SELECT id FROM drawing_analyses
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    analysis_id IN (
      SELECT id FROM drawing_analyses
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  );

-- ── drawing_revision_comparisons ───────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_revision_comparisons;
CREATE POLICY "project_member_access" ON drawing_revision_comparisons
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM user_projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM user_projects WHERE user_id = auth.uid()
    )
  );

-- ── drawing_revision_deltas — scope through comparison ─────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_revision_deltas;
CREATE POLICY "project_member_access" ON drawing_revision_deltas
  FOR ALL TO authenticated
  USING (
    comparison_id IN (
      SELECT id FROM drawing_revision_comparisons
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    comparison_id IN (
      SELECT id FROM drawing_revision_comparisons
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  );

-- ── delivery_items — scope through parent delivery ─────────────────────────
DROP POLICY IF EXISTS "auth_all" ON delivery_items;
CREATE POLICY "project_member_access" ON delivery_items
  FOR ALL TO authenticated
  USING (
    delivery_id IN (
      SELECT id FROM deliveries
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    delivery_id IN (
      SELECT id FROM deliveries
      WHERE project_id IN (
        SELECT project_id FROM user_projects WHERE user_id = auth.uid()
      )
    )
  );

-- Also revoke any lingering anon grants on these six tables (migration 047
-- covered every public table via loop, but belt-and-suspenders in case 047
-- runs before or alongside this one).
REVOKE ALL ON TABLE drawing_analyses             FROM anon;
REVOKE ALL ON TABLE drawing_sheets               FROM anon;
REVOKE ALL ON TABLE drawing_findings             FROM anon;
REVOKE ALL ON TABLE drawing_revision_comparisons FROM anon;
REVOKE ALL ON TABLE drawing_revision_deltas      FROM anon;
REVOKE ALL ON TABLE delivery_items               FROM anon;

NOTIFY pgrst, 'reload schema';
