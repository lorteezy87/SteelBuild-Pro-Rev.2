-- Drawing Hub V3.1 — Zone-to-Zone Dependency Graph.
-- Directed edges between zones (blocks / depends_on / relates_to)
-- so an upstream zone's red/amber status can drag downstream
-- readiness rings down via cycle-safe propagation.
--
-- Justification for a dedicated table (not drawing_links): symmetric
-- semantics (both sides are zones), different propagation rules
-- (relates_to is informational), and cleaner UI queries (no
-- polymorphic dispatch over linked_record_type).
--
-- IMPORTANT — cycle handling: we deliberately do NOT enforce
-- acyclicity in the database. Cycle detection on every insert is
-- expensive over the full graph, and `relates_to` is naturally
-- bidirectional (Zone A relates_to B, B relates_to A is valid).
-- The propagation engine in drawingHub.js uses a visited-set
-- traversal that is safe against any directed-graph topology
-- including cycles.

CREATE TABLE IF NOT EXISTS drawing_zone_dependencies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_zone_id        uuid NOT NULL REFERENCES drawing_zones(id) ON DELETE CASCADE,
  target_zone_id        uuid NOT NULL REFERENCES drawing_zones(id) ON DELETE CASCADE,
  relationship          text NOT NULL,
  note                  text,
  propagation_weight    numeric NOT NULL DEFAULT 1.0,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  removed_at            timestamptz,
  removed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT chk_drawing_zone_dependencies_relationship
    CHECK (relationship IN ('blocks','depends_on','relates_to')),

  CONSTRAINT chk_drawing_zone_dependencies_weight
    CHECK (propagation_weight >= 0 AND propagation_weight <= 2),

  CONSTRAINT chk_no_self_dependency
    CHECK (source_zone_id <> target_zone_id)
);

-- Active edges are unique on (source, target, relationship). Soft-
-- removed rows can repeat so audit history is preserved.
CREATE UNIQUE INDEX IF NOT EXISTS ux_drawing_zone_dependencies_active
  ON drawing_zone_dependencies (source_zone_id, target_zone_id, relationship)
  WHERE removed_at IS NULL;

-- Hot-path indexes for the propagation engine: forward (source→target)
-- and reverse (target→source) lookups, both filtered to active edges.
CREATE INDEX IF NOT EXISTS idx_drawing_zone_dependencies_active_source
  ON drawing_zone_dependencies (project_id, source_zone_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drawing_zone_dependencies_active_target
  ON drawing_zone_dependencies (project_id, target_zone_id)
  WHERE removed_at IS NULL;

-- Same-project guard: both zones must belong to the row's project.
-- A trigger is used (not a CHECK) because CHECKs cannot reference
-- other tables. Aborts on mismatch with a clear message so the API
-- layer surfaces "cross-project dependency" cleanly.
CREATE OR REPLACE FUNCTION tg_validate_drawing_zone_dependency_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  src_project uuid;
  tgt_project uuid;
BEGIN
  SELECT project_id INTO src_project FROM drawing_zones WHERE id = NEW.source_zone_id;
  SELECT project_id INTO tgt_project FROM drawing_zones WHERE id = NEW.target_zone_id;

  IF src_project IS NULL THEN
    RAISE EXCEPTION 'source_zone_id % does not exist in drawing_zones', NEW.source_zone_id;
  END IF;
  IF tgt_project IS NULL THEN
    RAISE EXCEPTION 'target_zone_id % does not exist in drawing_zones', NEW.target_zone_id;
  END IF;
  IF src_project <> NEW.project_id OR tgt_project <> NEW.project_id THEN
    RAISE EXCEPTION 'drawing_zone_dependencies: source/target zones must share project_id (got src=%, tgt=%, row=%)',
      src_project, tgt_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_validate_drawing_zone_dependency_project
  ON drawing_zone_dependencies;
CREATE TRIGGER tg_validate_drawing_zone_dependency_project
BEFORE INSERT OR UPDATE OF source_zone_id, target_zone_id, project_id
ON drawing_zone_dependencies
FOR EACH ROW EXECUTE FUNCTION tg_validate_drawing_zone_dependency_project();

-- RLS — single ALL policy mirroring drawing_zones.
ALTER TABLE drawing_zone_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_zone_dependencies_project_access
  ON drawing_zone_dependencies;
CREATE POLICY drawing_zone_dependencies_project_access
  ON drawing_zone_dependencies
  FOR ALL
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- ── Activity log extension ─────────────────────────────────────────
-- Add `dependency_added` and `dependency_removed` to the existing
-- drawing_zone_activity event_type CHECK so the audit timeline can
-- carry V3.1 events alongside the original zone/link events.
ALTER TABLE drawing_zone_activity
  DROP CONSTRAINT IF EXISTS drawing_zone_activity_event_allowed;

ALTER TABLE drawing_zone_activity
  ADD CONSTRAINT drawing_zone_activity_event_allowed
  CHECK (event_type IN (
    'zone_created',
    'zone_renamed',
    'status_changed',
    'zone_deleted',
    'link_added',
    'link_removed',
    'dependency_added',
    'dependency_removed'
  ));
