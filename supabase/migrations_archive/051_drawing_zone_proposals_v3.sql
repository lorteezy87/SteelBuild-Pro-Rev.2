-- Drawing Hub V3.0 — Analyzer→Zones bridge.
-- AI findings (drawing_findings) are spatially clustered into proposals,
-- which a PM reviews and accepts/rejects/merges into real drawing_zones.
--
-- Sister to migration 050_drawing_findings_add_bbox.sql, which added the
-- per-finding bbox columns this clustering reads.

CREATE TABLE IF NOT EXISTS drawing_zone_proposals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id                  uuid NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  drawing_revision_id         uuid REFERENCES drawing_revisions(id) ON DELETE SET NULL,
  analysis_id                 uuid REFERENCES drawing_analyses(id) ON DELETE SET NULL,

  finding_ids                 uuid[] NOT NULL DEFAULT '{}',
  cluster_size                integer NOT NULL DEFAULT 1,

  shape_type                  text NOT NULL DEFAULT 'rect',
  x_min                       numeric,
  y_min                       numeric,
  x_max                       numeric,
  y_max                       numeric,
  polygon_points              jsonb,

  suggested_zone_type         text,
  suggested_label             text,
  confidence                  numeric,

  status                      text NOT NULL DEFAULT 'pending',
  accepted_zone_id            uuid REFERENCES drawing_zones(id) ON DELETE SET NULL,
  merged_into_proposal_id     uuid REFERENCES drawing_zone_proposals(id) ON DELETE SET NULL,
  decision_reason             text,
  decided_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at                  timestamptz,

  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_drawing_zone_proposals_shape
    CHECK (shape_type IN ('rect','polygon')),

  CONSTRAINT chk_drawing_zone_proposals_status
    CHECK (status IN ('pending','accepted','rejected','merged')),

  CONSTRAINT chk_drawing_zone_proposals_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  -- Mirror drawing_zones bbox check; only enforce when shape_type='rect'.
  CONSTRAINT chk_drawing_zone_proposals_bbox_range
    CHECK (
      shape_type <> 'rect'
      OR (
        x_min IS NOT NULL AND y_min IS NOT NULL
        AND x_max IS NOT NULL AND y_max IS NOT NULL
        AND x_min >= 0 AND x_min <= 1
        AND y_min >= 0 AND y_min <= 1
        AND x_max >= 0 AND x_max <= 1
        AND y_max >= 0 AND y_max <= 1
        AND x_max > x_min
        AND y_max > y_min
      )
    ),

  -- polygon_points present iff shape_type='polygon'.
  CONSTRAINT chk_drawing_zone_proposals_polygon_consistency
    CHECK (
      CASE shape_type
        WHEN 'rect'    THEN polygon_points IS NULL
        WHEN 'polygon' THEN (
          polygon_points IS NOT NULL
          AND jsonb_typeof(polygon_points) = 'array'
          AND jsonb_array_length(polygon_points) >= 3
        )
        ELSE FALSE
      END
    )
);

CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_project_drawing_status
  ON drawing_zone_proposals (project_id, drawing_id, status);

CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_project_analysis
  ON drawing_zone_proposals (project_id, analysis_id);

CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_revision
  ON drawing_zone_proposals (drawing_revision_id);

-- Touch trigger: keep updated_at fresh and recompute cluster_size from finding_ids.
CREATE OR REPLACE FUNCTION tg_drawing_zone_proposals_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.cluster_size = COALESCE(array_length(NEW.finding_ids, 1), 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_drawing_zone_proposals_touch ON drawing_zone_proposals;
CREATE TRIGGER tg_drawing_zone_proposals_touch
BEFORE INSERT OR UPDATE ON drawing_zone_proposals
FOR EACH ROW EXECUTE FUNCTION tg_drawing_zone_proposals_touch();

-- RLS — single ALL policy mirroring drawing_zones.
ALTER TABLE drawing_zone_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drawing_zone_proposals_project_access ON drawing_zone_proposals;
CREATE POLICY drawing_zone_proposals_project_access
  ON drawing_zone_proposals
  FOR ALL
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));
