-- ─── Bluebeam Max Integration ────────────────────────────────────────────────
-- Adds OAuth connection storage, session-project mapping, and session
-- document tracking for the Bluebeam Max (Studio) API integration.
--
-- Architecture mirrors the SharePoint/OneDrive integration (migration 083):
-- tokens stored server-side, Edge Function proxies all API calls, RLS
-- enforces project membership on session records.

-- ─── Bluebeam Connections ───────────────────────────────────────────────────
-- One row per authenticated user. OAuth2 user-context tokens — Bluebeam
-- does not support service accounts, so each user who wants to interact
-- with Bluebeam sessions must connect their own account.
CREATE TABLE IF NOT EXISTS bluebeam_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  bluebeam_user_id  TEXT,
  bluebeam_email    TEXT,
  display_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','expired','revoked','error')),
  last_used_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ
);

-- One active connection per user
CREATE UNIQUE INDEX IF NOT EXISTS bluebeam_conn_user_active
  ON bluebeam_connections(user_id)
  WHERE is_deleted = false AND status = 'active';

CREATE INDEX IF NOT EXISTS bluebeam_conn_user_idx
  ON bluebeam_connections(user_id) WHERE is_deleted = false;

SELECT add_updated_at_trigger('bluebeam_connections');
ALTER TABLE bluebeam_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own connection
CREATE POLICY "bluebeam_connections_own_user"
  ON bluebeam_connections FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Bluebeam Sessions ─────────────────────────────────────────────────────
-- Maps a Bluebeam Max session to a SteelBuild project, optionally linked
-- to a specific drawing set or submittal for traceability.
CREATE TABLE IF NOT EXISTS bluebeam_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL,
  session_name      TEXT NOT NULL,
  session_status    TEXT NOT NULL DEFAULT 'active'
                      CHECK (session_status IN ('active','ended','archived','error')),
  session_type      TEXT DEFAULT 'review'
                      CHECK (session_type IN ('review','markup','coordination','punchlist')),
  drawing_set_id    UUID REFERENCES drawing_sets(id) ON DELETE SET NULL,
  submittal_id      UUID REFERENCES submittals(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES auth.users(id),
  bluebeam_url      TEXT,
  invitation_url    TEXT,
  notification_sub_id TEXT,
  file_count        INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at      TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bb_sessions_project_idx
  ON bluebeam_sessions(project_id, session_status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS bb_sessions_drawing_set_idx
  ON bluebeam_sessions(drawing_set_id) WHERE drawing_set_id IS NOT NULL AND is_deleted = false;
CREATE INDEX IF NOT EXISTS bb_sessions_submittal_idx
  ON bluebeam_sessions(submittal_id) WHERE submittal_id IS NOT NULL AND is_deleted = false;

SELECT add_updated_at_trigger('bluebeam_sessions');
ALTER TABLE bluebeam_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bb_sessions_project_member"
  ON bluebeam_sessions FOR ALL TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- ─── Bluebeam Session Documents ────────────────────────────────────────────
-- Tracks individual files pushed to / pulled from a Bluebeam session.
-- Links back to the SteelBuild document or drawing when applicable.
CREATE TABLE IF NOT EXISTS bluebeam_session_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES bluebeam_sessions(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bluebeam_file_id  TEXT,
  file_name         TEXT NOT NULL,
  file_size         BIGINT,
  direction         TEXT NOT NULL DEFAULT 'push'
                      CHECK (direction IN ('push','pull')),
  sync_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (sync_status IN ('pending','uploading','complete','failed','snapshot')),
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_drawing_id  UUID,
  snapshot_url      TEXT,
  error_message     TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bb_session_docs_session_idx
  ON bluebeam_session_documents(session_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS bb_session_docs_project_idx
  ON bluebeam_session_documents(project_id) WHERE is_deleted = false;

SELECT add_updated_at_trigger('bluebeam_session_documents');
ALTER TABLE bluebeam_session_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bb_session_docs_project_member"
  ON bluebeam_session_documents FOR ALL TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- ─── Update linked_folders provider check to include bluebeam ──────────────
ALTER TABLE linked_folders DROP CONSTRAINT IF EXISTS linked_folders_provider_check;
ALTER TABLE linked_folders ADD CONSTRAINT linked_folders_provider_check
  CHECK (provider IN ('sharepoint','onedrive','google_drive','dropbox','bluebeam'));

-- ─── Update documents import_source to include bluebeam ────────────────────
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_import_source_check;
ALTER TABLE documents ADD CONSTRAINT documents_import_source_check
  CHECK (import_source IN ('upload','email','sharepoint','onedrive','google_drive','dropbox','bluebeam'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
