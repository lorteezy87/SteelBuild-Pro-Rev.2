-- Drawing viewer Tier 3: user-drawn markup (redlines, shapes, arrows, notes).
-- Stored as JSONB on the drawing row so it travels with the sheet. Each
-- entry is versioned + typed; see AnnotationLayer.jsx for the shape.
--
-- We deliberately use a NEW column rather than the pre-existing `annotations`
-- column (migration 010) because `annotations` is still reserved for
-- pdfjs-extracted link hotspots inside the PDF itself, and having two things
-- named the same way would guarantee a future bug.
ALTER TABLE drawings
  ADD COLUMN IF NOT EXISTS markup JSONB DEFAULT '[]'::jsonb;

-- Lightweight index so future features (e.g. "show sheets with markup")
-- don't table-scan the JSONB.
CREATE INDEX IF NOT EXISTS idx_drawings_markup_gin
  ON drawings USING GIN (markup);


-- ============================================================================
-- Consolidated from 045_project_handoff_checklist.sql
-- This migration shared a numeric version prefix with 045_drawings_markup_column.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- SteelBuild Pro — Project Handoff Checklist
-- Migration 045
--
-- Per-project fixed checklist with 36 items. Each project — new or existing —
-- gets the same standard list seeded on create. Users then fill in
-- date_required / date_completed / completed_by as they work through the
-- handoff.
--
-- Design:
--   • project_handoff_items — one row per (project × seq).
--   • Uniqueness on (project_id, seq) so the seed trigger is idempotent.
--   • Status is a free text with a check constraint restricting to the three
--     valid values. We'll tolerate legacy "Completed" + "Not Applicable"
--     inputs via the constraint.
--   • ON DELETE CASCADE from projects so handoff rows vanish when a project
--     is deleted.
--
-- Template is the canonical 36-item list from the PM handoff packet. Keep
-- it in sync with `HANDOFF_CHECKLIST_TEMPLATE` in the React code — when the
-- template changes, write a new migration that updates existing rows and
-- updates the seed function body.

CREATE TABLE IF NOT EXISTS project_handoff_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  description    TEXT NOT NULL,
  date_required  DATE,
  status         TEXT NOT NULL DEFAULT 'Not Completed',
  completed_by   TEXT,
  date_completed DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_handoff_items_status_check CHECK (
    status IN ('Not Completed', 'In Progress', 'Completed', 'Not Applicable')
  ),
  UNIQUE (project_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_project_handoff_items_project
  ON project_handoff_items (project_id);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION project_handoff_items_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_handoff_items_touch ON project_handoff_items;
CREATE TRIGGER project_handoff_items_touch
  BEFORE UPDATE ON project_handoff_items
  FOR EACH ROW EXECUTE FUNCTION project_handoff_items_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Inherit project access: a user can see/modify a handoff row iff they can
-- see the parent project row (RLS on projects already enforces membership).
ALTER TABLE project_handoff_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_handoff_items_select ON project_handoff_items;
CREATE POLICY project_handoff_items_select ON project_handoff_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_handoff_items.project_id)
  );

DROP POLICY IF EXISTS project_handoff_items_insert ON project_handoff_items;
CREATE POLICY project_handoff_items_insert ON project_handoff_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_handoff_items.project_id)
  );

DROP POLICY IF EXISTS project_handoff_items_update ON project_handoff_items;
CREATE POLICY project_handoff_items_update ON project_handoff_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_handoff_items.project_id)
  );

DROP POLICY IF EXISTS project_handoff_items_delete ON project_handoff_items;
CREATE POLICY project_handoff_items_delete ON project_handoff_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_handoff_items.project_id)
  );

-- ── Seed function ────────────────────────────────────────────────────────
-- `seed_project_handoff_items(p_project_id)` inserts the 36 standard rows
-- for one project. ON CONFLICT DO NOTHING means it's safe to re-run against
-- projects that already have some rows (e.g. after partial hand-edits).
CREATE OR REPLACE FUNCTION seed_project_handoff_items(p_project_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO project_handoff_items (project_id, seq, description) VALUES
    (p_project_id,  1, 'Project Hand Off Internal Review With Estimators'),
    (p_project_id,  2, 'Reviewed Contract'),
    (p_project_id,  3, 'Schedule Of Values Review'),
    (p_project_id,  4, 'Field Hours Breakout Review'),
    (p_project_id,  5, 'Detailing Released'),
    (p_project_id,  6, 'Joist Supplier Released'),
    (p_project_id,  7, 'Deck Supplier Released'),
    (p_project_id,  8, 'Job Sequenced'),
    (p_project_id,  9, 'Jobsite Visited'),
    (p_project_id, 10, 'Pre-Con Meeting'),
    (p_project_id, 11, 'SDS Book Emailed and Delivered'),
    (p_project_id, 12, 'Project Safety Plan, Quality Plan, and AHA Emailed'),
    (p_project_id, 13, 'Weld Certs and Training Certs Emailed'),
    (p_project_id, 14, 'Hilti Pins Submitted (No AV Schwan)'),
    (p_project_id, 15, 'Anchor Bolts Released for Order & Fabrication'),
    (p_project_id, 16, 'Embeds Released for Order & Fabrication'),
    (p_project_id, 17, 'Main Steel Released for Fabrication'),
    (p_project_id, 18, 'RTU Frames Released for Fabrication'),
    (p_project_id, 19, 'Misc Steel Released for Fabrication'),
    (p_project_id, 20, 'Joist Delivery Confirmed'),
    (p_project_id, 21, 'Deck Delivery Confirmed'),
    (p_project_id, 22, 'Job Start Date Confirmed'),
    (p_project_id, 23, 'Crane Ordered'),
    (p_project_id, 24, 'Crane Plan and Certs Submitted'),
    (p_project_id, 25, 'Equipment Ordered'),
    (p_project_id, 26, 'Field Bolts Ordered'),
    (p_project_id, 27, 'Shear Studs Ordered for Field'),
    (p_project_id, 28, 'Specific Rigging and Safety Ordered'),
    (p_project_id, 29, 'Perimeter Safety Cable Needed and Ordered'),
    (p_project_id, 30, 'Job Reviewed with S&H Super'),
    (p_project_id, 31, 'Job Reviewed with Foreman'),
    (p_project_id, 32, 'Anchor Bolt Survey Performed'),
    (p_project_id, 33, 'Ladders Field Measured'),
    (p_project_id, 34, 'Handrail Field Measured'),
    (p_project_id, 35, 'Gates Field Measured'),
    (p_project_id, 36, 'Special Orders')
  ON CONFLICT (project_id, seq) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ── Auto-seed new projects ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_projects_seed_handoff_items()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_project_handoff_items(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS projects_seed_handoff_items ON projects;
CREATE TRIGGER projects_seed_handoff_items
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_projects_seed_handoff_items();

-- ── Backfill existing projects ───────────────────────────────────────────
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM projects LOOP
    PERFORM seed_project_handoff_items(p.id);
  END LOOP;
END$$;
