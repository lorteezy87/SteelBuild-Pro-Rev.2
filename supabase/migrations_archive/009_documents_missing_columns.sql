-- ─── Add missing columns to documents for edit modal + version stacking ─────
-- The DocumentEditModal writes to these columns but they didn't exist in the DB.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS work_package_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rfi_id          UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS delivery_id     UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS change_order_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS submittal_id    UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_current      BOOLEAN DEFAULT TRUE;

-- Index for version stacking (find all revisions of a doc by number)
CREATE INDEX IF NOT EXISTS idx_documents_doc_number ON documents(document_number) WHERE document_number IS NOT NULL;

-- Index for linked-entity lookups
CREATE INDEX IF NOT EXISTS idx_documents_wp  ON documents(work_package_id) WHERE work_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_rfi ON documents(rfi_id)          WHERE rfi_id IS NOT NULL;
