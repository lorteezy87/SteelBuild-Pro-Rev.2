-- ============================================================================
-- 048_construction_scheduling_foundations.sql
--
-- Foundation for the construction-scheduling push:
--   1. task_dependencies     — relational FS/SS/FF/SF edges with lag
--   2. submittals            — proper submittal register (separate from drawings)
--   3. comments              — polymorphic comment thread for any entity
--   4. deliveries.long_lead_* — long-lead item tracking + lead-time in weeks
--   5. schedule_tasks.crew_* — short-interval/field-plan grouping
--   6. schedule_tasks.blockers — typed array of linked RFI/Submittal/Delivery ids
--
-- Every table gets project_member_access RLS with select/insert/update/delete
-- policies matching the existing pattern (migration 011). No auth_all anywhere.
-- ============================================================================

-- ─── 1. task_dependencies ────────────────────────────────────────────────
-- The legacy `schedule_tasks.dependencies` TEXT column stored a JSON array
-- of predecessor UUIDs with no lag and no type info. Real construction
-- schedules need Finish-to-Start / Start-to-Start / Finish-to-Finish /
-- Start-to-Finish with positive OR negative lag days. We keep the old
-- column for back-compat (writers unchanged) but now ALSO write to this
-- table whenever the UI creates a dependency; readers should prefer it.
CREATE TABLE IF NOT EXISTS task_dependencies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id    UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
  successor_id      UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
  dependency_type   TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days          INTEGER DEFAULT 0,
  metadata          JSONB DEFAULT '{}',
  CONSTRAINT task_dep_no_self      CHECK (predecessor_id <> successor_id),
  CONSTRAINT task_dep_unique_edge  UNIQUE (predecessor_id, successor_id, dependency_type)
);
SELECT add_updated_at_trigger('task_dependencies');
CREATE INDEX IF NOT EXISTS idx_task_deps_succ     ON task_dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_pred     ON task_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_project  ON task_dependencies(project_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_access" ON task_dependencies
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

-- ─── 2. submittals ───────────────────────────────────────────────────────
-- A submittal is the formal workflow artifact (unlike `drawings`, which is
-- individual sheets, and unlike `drawing_sets`, which is a set in review).
-- Submittals track the transmittal package itself: what was submitted,
-- when, to whom, current review round, approval status. One submittal
-- usually references many drawings + specs.
CREATE TABLE IF NOT EXISTS submittals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_name        TEXT,

  submittal_number    TEXT NOT NULL,
  title               TEXT NOT NULL,
  spec_section        TEXT,
  submittal_type      TEXT
    CHECK (submittal_type IN ('Shop Drawing','Product Data','Sample','Mock-up','Calculation','Other') OR submittal_type IS NULL),
  discipline          TEXT,
  revision            TEXT DEFAULT '0',
  round_number        INTEGER DEFAULT 1,

  submitted_date      DATE,
  required_date       DATE,            -- date we need it back by to protect schedule
  returned_date       DATE,
  approved_date       DATE,

  status              TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN (
      'Draft','Submitted','Under Review','Approved','Approved as Noted',
      'Revise and Resubmit','Rejected','Void'
    )),
  ball_in_court       TEXT,             -- 'Contractor','EOR','Architect','GC','Owner'
  submitted_by        TEXT,
  reviewer            TEXT,

  drawing_set_ids     UUID[] DEFAULT '{}',   -- linked drawing_sets
  linked_rfi_ids      UUID[] DEFAULT '{}',   -- RFIs that spawned this submittal
  linked_task_ids     UUID[] DEFAULT '{}',   -- schedule tasks this submittal unblocks

  notes               TEXT,
  file_url            TEXT,
  is_deleted          BOOLEAN DEFAULT false,
  deleted_at          TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}',

  CONSTRAINT submittals_unique_per_project UNIQUE (project_id, submittal_number)
);
SELECT add_updated_at_trigger('submittals');
CREATE INDEX IF NOT EXISTS idx_submittals_project     ON submittals(project_id);
CREATE INDEX IF NOT EXISTS idx_submittals_status      ON submittals(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_submittals_required    ON submittals(required_date) WHERE is_deleted = false;

ALTER TABLE submittals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_access" ON submittals
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

-- ─── 3. comments (polymorphic) ───────────────────────────────────────────
-- One thread per (entity_type, entity_id). entity_type is a string rather
-- than a FK because we need to comment on rfis / submittals / tasks /
-- deliveries / change_orders / etc. and adding a FK per target would
-- balloon the schema. Project isolation is enforced via project_id.
CREATE TABLE IF NOT EXISTS comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  entity_type  TEXT NOT NULL
    CHECK (entity_type IN (
      'rfi','submittal','drawing_set','drawing','schedule_task','delivery',
      'change_order','change_request','work_package','inspection','punchlist_item',
      'daily_log','action_item','meeting','project'
    )),
  entity_id    UUID NOT NULL,

  author_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name  TEXT,               -- cached display name
  body         TEXT NOT NULL,
  mentions     TEXT[] DEFAULT '{}', -- @mention user ids / emails
  edited_at    TIMESTAMPTZ,
  is_deleted   BOOLEAN DEFAULT false,
  deleted_at   TIMESTAMPTZ,
  metadata     JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('comments');
CREATE INDEX IF NOT EXISTS idx_comments_entity    ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_project   ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_created   ON comments(created_at DESC) WHERE is_deleted = false;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_member_access" ON comments
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

-- ─── 4. deliveries — long-lead tracking ──────────────────────────────────
-- A delivery becomes "long lead" when its lead-time-from-order exceeds the
-- project's tolerance. Surfacing this explicitly lets the dashboard flag
-- items that need to be ordered early (e.g. HSS sections from Korea = 16
-- weeks) before they become schedule-critical. `lead_time_weeks` is
-- denormalized from the vendor/product and captured at order time so
-- historical analysis remains stable even if the vendor's quote changes.
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS is_long_lead       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_time_weeks    INTEGER,
  ADD COLUMN IF NOT EXISTS order_placed_date  DATE,
  ADD COLUMN IF NOT EXISTS expected_ship_date DATE;
CREATE INDEX IF NOT EXISTS idx_deliveries_long_lead ON deliveries(project_id)
  WHERE is_long_lead = true AND status <> 'Delivered';

-- ─── 5. schedule_tasks — field planning ──────────────────────────────────
-- crew_id / crew_name lets the Field Plan page group tasks by crew for
-- the week-ahead view. blockers is an array of typed pointers so a single
-- task can declare "I'm blocked by RFI-042 and Submittal-15" without
-- joining three different link tables. Example element:
--   { "type": "rfi", "id": "…", "label": "RFI-042 embed conflict" }
ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS crew_id        UUID,
  ADD COLUMN IF NOT EXISTS crew_name      TEXT,
  ADD COLUMN IF NOT EXISTS blockers       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_milestone   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_release DATE;
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_crew
  ON schedule_tasks(crew_id) WHERE crew_id IS NOT NULL;

-- ─── 6. comments → reload PostgREST so clients see the new tables ───────
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- Consolidated from 048_tighten_late_rls.sql
-- This migration shared a numeric version prefix with 048_construction_scheduling_foundations.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
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
