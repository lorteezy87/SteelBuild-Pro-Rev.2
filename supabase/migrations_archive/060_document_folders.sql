-- ╭────────────────────────────────────────────────────────────────────────────╮
-- │ 060 — User-created folders for the document repository                     │
-- │                                                                              │
-- │ Today the Documents page groups by `category` (a fixed tag like "Specs" /  │
-- │ "Drawings"). Users want true hierarchical folders — Dropbox-style — that   │
-- │ they can create themselves and nest. This migration adds the storage:      │
-- │                                                                              │
-- │   - `document_folders` table: one row per folder, parent_folder_id allows  │
-- │     nesting. Soft-deletes via is_deleted (matches the rest of the schema). │
-- │   - `documents.folder_id`: nullable FK; NULL means "root of the project's  │
-- │     repository," same rendering as before for legacy rows.                 │
-- │                                                                              │
-- │ RLS: project members can CRUD their project's folders. Same shape as the  │
-- │ existing documents policy (migration 011).                                 │
-- │                                                                              │
-- │ Uniqueness: folder names are unique per (project_id, parent_folder_id) so  │
-- │ "Specs / Architectural" can coexist with "Drawings / Architectural" but    │
-- │ a single parent can't have two folders with the same name.                 │
-- ╰────────────────────────────────────────────────────────────────────────────╯

CREATE TABLE IF NOT EXISTS document_folders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_folder_id  uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(trim(name)) > 0),
  created_by        text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  is_deleted        boolean NOT NULL DEFAULT false,
  deleted_at        timestamptz
);

COMMENT ON TABLE  document_folders IS 'Hierarchical folders that organise the Documents repo per project. NULL parent_folder_id = root folder.';
COMMENT ON COLUMN document_folders.parent_folder_id IS 'Self-FK for nesting. NULL = top-level folder. ON DELETE CASCADE removes child folders when a parent is hard-deleted, but the soft-delete path (is_deleted=true) is the normal one.';

-- Lookup index for the typical "list folders in this parent" query.
CREATE INDEX IF NOT EXISTS document_folders_project_parent_idx
  ON document_folders (project_id, parent_folder_id)
  WHERE is_deleted = false;

-- Per-parent name uniqueness. Partial so deleted folders don't block the
-- name; the unique-on-active pattern matches drawing_sets / submittals.
CREATE UNIQUE INDEX IF NOT EXISTS document_folders_unique_name_per_parent
  ON document_folders (project_id, COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)))
  WHERE is_deleted = false;

-- Touch updated_at on rename / move.
CREATE TRIGGER trg_document_folders_updated_at
  BEFORE UPDATE ON document_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── documents.folder_id ──────────────────────────────────────────────────
-- NULL = sits at the root of the project's repo, same as today.
-- ON DELETE SET NULL is intentional: deleting (hard or via cascade from a
-- parent) a folder must not orphan-delete the documents inside it.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES document_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_folder_id_idx
  ON documents (folder_id)
  WHERE is_deleted = false;

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_member_access" ON document_folders;
CREATE POLICY "project_member_access" ON document_folders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = document_folders.project_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = document_folders.project_id
    )
  );

NOTIFY pgrst, 'reload schema';
