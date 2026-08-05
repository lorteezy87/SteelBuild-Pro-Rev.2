-- SteelBuild Pro — Migration 011: Harden RLS with project-level isolation
--
-- PROBLEM:
--   All business tables use a blanket permissive policy:
--     CREATE POLICY "auth_all" ... USING (true) WITH CHECK (true)
--   This means ANY authenticated user can read/write/delete ANY record in
--   ANY project, even projects they do not belong to.
--
-- FIX:
--   Replace blanket policies with project-membership checks. A user can only
--   access records in projects where they have a row in `user_projects`.
--   The `project_id IS NULL` escape hatch allows unassigned records to remain
--   visible to all authenticated users.
--
-- DEPENDENCIES:
--   - user_projects table (created in migration 003)
--   - get_my_project_role() function (created in migration 003)
--
-- IDEMPOTENCY:
--   All DROP/CREATE use IF EXISTS / IF NOT EXISTS to be safe for re-runs.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Performance indexes for the user_projects join table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id    ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_project_id ON user_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_composite  ON user_projects(user_id, project_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Projects table — special case
--    Users may only see projects they belong to.
--    Any authenticated user may create a new project (the create_project RPC
--    handles auto-inserting the owner membership row).
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "auth_all" ON projects;

CREATE POLICY "project_member_access" ON projects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = projects.id
    )
  )
  WITH CHECK (true);  -- Any authenticated user can create projects


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Tables with project_id — replace blanket policy with membership check
--    Pattern: user must have a row in user_projects for the record's project_id.
--    Records with NULL project_id remain accessible to all authenticated users.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── rfis ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON rfis;
CREATE POLICY "project_member_access" ON rfis
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = rfis.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = rfis.project_id
    )
  );

-- ── cost_codes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON cost_codes;
CREATE POLICY "project_member_access" ON cost_codes
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = cost_codes.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = cost_codes.project_id
    )
  );

-- ── work_packages ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON work_packages;
CREATE POLICY "project_member_access" ON work_packages
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = work_packages.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = work_packages.project_id
    )
  );

-- ── drawings ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawings;
CREATE POLICY "project_member_access" ON drawings
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawings.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawings.project_id
    )
  );

-- ── drawing_sets ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON drawing_sets;
CREATE POLICY "project_member_access" ON drawing_sets
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawing_sets.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = drawing_sets.project_id
    )
  );

-- ── change_orders ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON change_orders;
CREATE POLICY "project_member_access" ON change_orders
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = change_orders.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = change_orders.project_id
    )
  );

-- ── change_requests ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON change_requests;
CREATE POLICY "project_member_access" ON change_requests
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = change_requests.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = change_requests.project_id
    )
  );

-- ── schedule_tasks ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON schedule_tasks;
CREATE POLICY "project_member_access" ON schedule_tasks
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = schedule_tasks.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = schedule_tasks.project_id
    )
  );

-- ── expenses ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON expenses;
CREATE POLICY "project_member_access" ON expenses
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = expenses.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = expenses.project_id
    )
  );

-- ── deliveries ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON deliveries;
CREATE POLICY "project_member_access" ON deliveries
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = deliveries.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = deliveries.project_id
    )
  );

-- ── sov_items ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON sov_items;
CREATE POLICY "project_member_access" ON sov_items
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = sov_items.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = sov_items.project_id
    )
  );

-- ── contacts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON contacts;
CREATE POLICY "project_member_access" ON contacts
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = contacts.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = contacts.project_id
    )
  );

-- ── daily_logs ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON daily_logs;
CREATE POLICY "project_member_access" ON daily_logs
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = daily_logs.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = daily_logs.project_id
    )
  );

-- ── meetings ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON meetings;
CREATE POLICY "project_member_access" ON meetings
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = meetings.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = meetings.project_id
    )
  );

-- ── action_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON action_items;
CREATE POLICY "project_member_access" ON action_items
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = action_items.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = action_items.project_id
    )
  );

-- ── inspections ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON inspections;
CREATE POLICY "project_member_access" ON inspections
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = inspections.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = inspections.project_id
    )
  );

-- ── photos ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON photos;
CREATE POLICY "project_member_access" ON photos
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = photos.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = photos.project_id
    )
  );

-- ── punchlist_items ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON punchlist_items;
CREATE POLICY "project_member_access" ON punchlist_items
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = punchlist_items.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = punchlist_items.project_id
    )
  );

-- ── quality_control_records ───────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON quality_control_records;
CREATE POLICY "project_member_access" ON quality_control_records
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = quality_control_records.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = quality_control_records.project_id
    )
  );

-- ── safety_incidents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON safety_incidents;
CREATE POLICY "project_member_access" ON safety_incidents
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = safety_incidents.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = safety_incidents.project_id
    )
  );

-- ── production_notes ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON production_notes;
CREATE POLICY "project_member_access" ON production_notes
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = production_notes.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = production_notes.project_id
    )
  );

-- ── warranties ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON warranties;
CREATE POLICY "project_member_access" ON warranties
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = warranties.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = warranties.project_id
    )
  );

-- ── resources ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON resources;
CREATE POLICY "project_member_access" ON resources
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = resources.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = resources.project_id
    )
  );

-- ── look_ahead ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON look_ahead;
CREATE POLICY "project_member_access" ON look_ahead
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = look_ahead.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = look_ahead.project_id
    )
  );

-- ── documents ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON documents;
CREATE POLICY "project_member_access" ON documents
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = documents.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = documents.project_id
    )
  );

-- ── activities ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON activities;
CREATE POLICY "project_member_access" ON activities
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = activities.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = activities.project_id
    )
  );

-- ── uploaded_files ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON uploaded_files;
CREATE POLICY "project_member_access" ON uploaded_files
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = uploaded_files.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = uploaded_files.project_id
    )
  );

-- ── scope_items ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON scope_items;
CREATE POLICY "project_member_access" ON scope_items
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = scope_items.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = scope_items.project_id
    )
  );

-- ── alerts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON alerts;
CREATE POLICY "project_member_access" ON alerts
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = alerts.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = alerts.project_id
    )
  );

-- ── pma_assumptions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON pma_assumptions;
CREATE POLICY "project_member_access" ON pma_assumptions
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_assumptions.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_assumptions.project_id
    )
  );

-- ── pma_decisions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON pma_decisions;
CREATE POLICY "project_member_access" ON pma_decisions
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_decisions.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_decisions.project_id
    )
  );

-- ── project_closeout ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON project_closeout;
CREATE POLICY "project_member_access" ON project_closeout
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = project_closeout.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = project_closeout.project_id
    )
  );

-- ── number_sequences ──────────────────────────────────────────────────────
-- number_sequences has project_id, so it needs project isolation too.
-- Also drop the re-created blanket policy from migration 004.
DROP POLICY IF EXISTS "auth_all" ON number_sequences;
CREATE POLICY "project_member_access" ON number_sequences
  FOR ALL TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = number_sequences.project_id
    )
  )
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = number_sequences.project_id
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. pma_audit_logs — preserve append-only semantics + add project isolation
--    Migration 006 made this table INSERT+SELECT only (no UPDATE/DELETE).
--    We replace those open policies with project-scoped versions.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_insert" ON pma_audit_logs;
CREATE POLICY "audit_insert" ON pma_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_audit_logs.project_id
    )
  );

DROP POLICY IF EXISTS "audit_select" ON pma_audit_logs;
CREATE POLICY "audit_select" ON pma_audit_logs
  FOR SELECT TO authenticated
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = pma_audit_logs.project_id
    )
  );

-- No UPDATE or DELETE policies — audit entries remain immutable.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Tables WITHOUT project_id — intentionally left unchanged
-- ═══════════════════════════════════════════════════════════════════════════
-- user_profiles  : own-row isolation (hardened in migration 006)
-- vendors        : global lookup table, no project_id — keeps existing auth_all
-- user_projects  : governed by fine-grained policies from migration 003
--                  (admins_update_memberships, admins_delete_memberships,
--                   users_insert_own_membership, postgres_full_access)


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Grant the postgres role bypass on number_sequences
--    The create_project RPC (SECURITY DEFINER) may need to insert sequences.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "postgres_full_access" ON number_sequences;
CREATE POLICY "postgres_full_access" ON number_sequences
  FOR ALL TO postgres
  USING (true) WITH CHECK (true);
