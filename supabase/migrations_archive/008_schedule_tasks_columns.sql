-- ─── Add missing columns to schedule_tasks for MS Project parity ──────────
-- These columns enable: hierarchical tasks, WBS codes, dependency tracking,
-- duration tracking, resource assignments, and outline-level indentation.

ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES schedule_tasks(id) ON DELETE SET NULL;
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS wbs_code       TEXT;
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS outline_level  INTEGER DEFAULT 0;
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS duration       INTEGER; -- days
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS resource_names TEXT;

-- Ensure `dependencies` column is usable — it exists as TEXT from 001.
-- We store JSON arrays: ["task-uuid-1","task-uuid-2"] for predecessor IDs.
-- No schema change needed, just documenting the convention.

-- Index for efficient parent lookups (tree traversal)
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_parent ON schedule_tasks(parent_task_id);
