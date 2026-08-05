-- ─── Document Storage Integration ────────────────────────────────────────────
-- Adds linked_folders, extends documents with external provider fields,
-- and creates a document_import_queue staging table.

-- ─── Linked Folders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS linked_folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('sharepoint','onedrive','google_drive','dropbox')),
  folder_name       TEXT NOT NULL,
  folder_path       TEXT,
  external_folder_id TEXT,
  external_site_id  TEXT,
  external_drive_id TEXT,
  sync_enabled      BOOLEAN NOT NULL DEFAULT false,
  sync_frequency    TEXT NOT NULL DEFAULT 'manual' CHECK (sync_frequency IN ('manual','hourly','daily')),
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT CHECK (last_sync_status IN ('success','error','pending','never')),
  last_sync_error   TEXT,
  tenant_id         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS linked_folders_project_idx ON linked_folders(project_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS linked_folders_provider_idx ON linked_folders(provider, project_id);
SELECT add_updated_at_trigger('linked_folders');
ALTER TABLE linked_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "linked_folders_project_member"
  ON linked_folders FOR ALL TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- ─── Extend documents with external provider fields ─────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_provider     TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_file_id      TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_file_url     TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_drive_id     TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_site_id      TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_last_modified TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_synced_at    TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS linked_folder_id      UUID REFERENCES linked_folders(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS import_source         TEXT CHECK (import_source IN ('upload','email','sharepoint','onedrive','google_drive','dropbox'));

CREATE INDEX IF NOT EXISTS documents_linked_folder_idx ON documents(linked_folder_id) WHERE linked_folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_external_provider_idx ON documents(external_provider) WHERE external_provider IS NOT NULL;

-- ─── Document Import Queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_import_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  linked_folder_id  UUID REFERENCES linked_folders(id) ON DELETE SET NULL,
  provider          TEXT NOT NULL,
  external_file_id  TEXT NOT NULL,
  external_file_url TEXT,
  file_name         TEXT NOT NULL,
  file_size         BIGINT,
  mime_type         TEXT,
  external_last_modified TIMESTAMPTZ,
  import_status     TEXT NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending','approved','rejected','imported','skipped')),
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  target_folder_id  UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  created_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS doc_import_queue_project_idx ON document_import_queue(project_id, import_status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS doc_import_queue_folder_idx ON document_import_queue(linked_folder_id) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS doc_import_queue_dedup ON document_import_queue(project_id, external_file_id, provider) WHERE is_deleted = false AND import_status NOT IN ('rejected','skipped');
SELECT add_updated_at_trigger('document_import_queue');
ALTER TABLE document_import_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_import_queue_project_member"
  ON document_import_queue FOR ALL TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));
