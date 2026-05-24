-- The activities table stores the entity's id (entity_id) and type
-- (entity_type) but had no column for the human-readable name the Activity
-- feed displays (e.g. "RFI-001"). auditLogger was emitting a camelCase
-- `entityName` that cleanRecord() silently stripped before insert, so the
-- name never persisted. Add the column so audit rows carry it.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_name TEXT;

NOTIFY pgrst, 'reload schema';
