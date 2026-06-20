-- ============================================================================
-- Migration 014: Enterprise Automation
-- Attaches updated_at triggers, audit-log trigger, and soft-delete columns.
-- ============================================================================

-- ─── 1. Attach updated_at triggers to ALL tables ─────────────────────────────
-- The trigger function `update_updated_at()` already exists but was never
-- attached.  Every table with an updated_at column should auto-update it.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'projects','rfis','action_items','change_orders','change_requests',
    'deliveries','work_packages','scope_items','documents','drawings',
    'drawing_sets','expenses','inspections','meetings','photos',
    'punchlist_items','quality_control_records','safety_incidents',
    'production_notes','warranties','resources','look_ahead',
    'activities','uploaded_files','cost_codes','sov_items',
    'schedule_tasks','daily_logs','contacts','alerts',
    'project_closeout','pma_decisions','pma_assumptions','vendors',
    'number_sequences'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop first in case it already exists (idempotent)
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at()', t
    );
  END LOOP;
END $$;


-- ─── 2. Audit log trigger ────────────────────────────────────────────────────
-- Automatically captures INSERT / UPDATE / DELETE on critical tables
-- into pma_audit_logs.  Uses SECURITY DEFINER so auth.uid() works.

CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_project UUID;
  v_old JSONB;
  v_new JSONB;
  v_action TEXT;
BEGIN
  -- Try to get the current user; might be NULL for service-role operations
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old    := to_jsonb(OLD);
    v_new    := NULL;
    v_project := OLD.project_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_project := NEW.project_id;
  ELSE  -- INSERT
    v_action := 'INSERT';
    v_old    := NULL;
    v_new    := to_jsonb(NEW);
    v_project := NEW.project_id;
  END IF;

  INSERT INTO pma_audit_logs (
    project_id, entity_type, entity_id, action,
    old_values, new_values, changed_by
  ) VALUES (
    v_project,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_action,
    v_old,
    v_new,
    v_user_id::TEXT
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


-- Attach audit trigger to critical business tables
DO $$
DECLARE
  t TEXT;
  audited TEXT[] := ARRAY[
    'rfis','change_orders','change_requests','deliveries',
    'work_packages','scope_items','inspections','punchlist_items',
    'safety_incidents','expenses','sov_items'
  ];
BEGIN
  FOREACH t IN ARRAY audited LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_log ON %I', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_audit_log
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW
         EXECUTE FUNCTION audit_log_trigger()', t
    );
  END LOOP;
END $$;


-- ─── 3. Verify pma_audit_logs has the columns the trigger writes ─────────────
ALTER TABLE pma_audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE pma_audit_logs ADD COLUMN IF NOT EXISTS entity_id   UUID;
ALTER TABLE pma_audit_logs ADD COLUMN IF NOT EXISTS old_values  JSONB;
ALTER TABLE pma_audit_logs ADD COLUMN IF NOT EXISTS new_values  JSONB;

-- Index for efficient querying of audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON pma_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by
  ON pma_audit_logs (changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON pma_audit_logs (created_at DESC);


-- ─── 4. Soft delete support for critical tables ──────────────────────────────
-- Add is_deleted + deleted_at to tables where accidental deletion is dangerous.

DO $$
DECLARE
  t TEXT;
  soft_delete_tables TEXT[] := ARRAY[
    'rfis','change_orders','deliveries','work_packages',
    'documents','drawings','expenses','inspections',
    'punchlist_items','safety_incidents','scope_items',
    'sov_items','contacts','meetings'
  ];
BEGIN
  FOREACH t IN ARRAY soft_delete_tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN NOT NULL DEFAULT FALSE', t
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ', t
    );
  END LOOP;
END $$;

-- Partial indexes for soft-deleted queries (only index non-deleted rows)
DO $$
DECLARE
  t TEXT;
  soft_delete_tables TEXT[] := ARRAY[
    'rfis','change_orders','deliveries','work_packages',
    'documents','drawings','expenses','inspections',
    'punchlist_items','safety_incidents','scope_items',
    'sov_items','contacts','meetings'
  ];
BEGIN
  FOREACH t IN ARRAY soft_delete_tables LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_active ON %I (project_id) WHERE NOT is_deleted', t, t
    );
  END LOOP;
END $$;


-- ─── 5. Storage bucket: ensure app-files is private ──────────────────────────
-- Remove any remaining public-access policies (migration 007 may have missed)
DO $$
BEGIN
  -- Drop if still lingering
  DROP POLICY IF EXISTS "public_read" ON storage.objects;
  DROP POLICY IF EXISTS "public_read_files" ON storage.objects;
EXCEPTION WHEN OTHERS THEN
  NULL;  -- Ignore if storage schema doesn't exist in test
END $$;
