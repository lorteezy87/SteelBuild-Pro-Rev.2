-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 025c — drawing_activity audit log + triggers                               │
-- │                                                                              │
-- │ Captures every meaningful state change on a drawings row so the UI can    │
-- │ render a history timeline ("Stage advanced OFA → BFA · 2d ago · Nick").    │
-- │                                                                              │
-- │ Events captured:                                                             │
-- │   • stage changes (from → to)                                                │
-- │   • revision_number changes                                                  │
-- │   • set_approval_status changes                                              │
-- │   • soft-delete / restore                                                   │
-- │   • INSERT (row created)                                                    │
-- │                                                                              │
-- │ Each row stores the minimum context needed to render a history line: the  │
-- │ event type, the from/to values, who did it (auth.uid), and when. Full     │
-- │ row snapshots live in metadata jsonb for anything else a diff tool wants. │
-- ╰────────────────────────────────────────────────────────────────────────────╯

CREATE TABLE IF NOT EXISTS drawing_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  drawing_id    UUID NOT NULL,
  event_type    TEXT NOT NULL,
  from_value    TEXT,
  to_value      TEXT,
  actor_id      UUID,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drawing_activity DROP CONSTRAINT IF EXISTS chk_drawing_activity_event_type;
ALTER TABLE drawing_activity ADD  CONSTRAINT chk_drawing_activity_event_type
  CHECK (event_type IN (
    'created', 'stage_changed', 'revision_changed',
    'approval_changed', 'deleted', 'restored',
    'ai_status_changed', 'superseded'
  ));

CREATE INDEX IF NOT EXISTS idx_drawing_activity_drawing ON drawing_activity (drawing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_activity_project ON drawing_activity (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_activity_type    ON drawing_activity (event_type);

-- RLS: activity is readable by anyone who can read the parent drawing.
-- For now we mirror the "auth_all" permissive policy used elsewhere on this
-- project; tighten when project-level RLS lands on drawing_activity itself.
ALTER TABLE drawing_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drawing_activity_auth_all ON drawing_activity;
CREATE POLICY drawing_activity_auth_all ON drawing_activity
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Trigger function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_drawing_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  -- auth.uid() may be NULL for service_role / background jobs; that's fine.
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO drawing_activity (project_id, drawing_id, event_type, to_value, actor_id, metadata)
    VALUES (NEW.project_id, NEW.id, 'created', NEW.stage, v_actor,
            jsonb_build_object('sheet_number', NEW.sheet_number, 'title', NEW.title));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft delete / restore
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id,
              CASE WHEN NEW.is_deleted THEN 'deleted' ELSE 'restored' END,
              OLD.is_deleted::text, NEW.is_deleted::text, v_actor);
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'stage_changed', OLD.stage, NEW.stage, v_actor);
    END IF;

    IF NEW.revision_number IS DISTINCT FROM OLD.revision_number THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'revision_changed', OLD.revision_number::text, NEW.revision_number::text, v_actor);
    END IF;

    IF NEW.set_approval_status IS DISTINCT FROM OLD.set_approval_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'approval_changed',
              COALESCE(OLD.set_approval_status, ''), COALESCE(NEW.set_approval_status, ''), v_actor);
    END IF;

    IF NEW.ai_extraction_status IS DISTINCT FROM OLD.ai_extraction_status THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'ai_status_changed',
              COALESCE(OLD.ai_extraction_status, ''), COALESCE(NEW.ai_extraction_status, ''), v_actor);
    END IF;

    IF NEW.is_superseded IS DISTINCT FROM OLD.is_superseded AND NEW.is_superseded = TRUE THEN
      INSERT INTO drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id)
      VALUES (NEW.project_id, NEW.id, 'superseded', 'false', 'true', v_actor);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_drawings_activity ON drawings;
CREATE TRIGGER trg_drawings_activity
AFTER INSERT OR UPDATE ON drawings
FOR EACH ROW
EXECUTE FUNCTION log_drawing_activity();
