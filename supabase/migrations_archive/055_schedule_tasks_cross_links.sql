-- 055_schedule_tasks_cross_links.sql
-- Adds three optional id-array columns to schedule_tasks for cross-module
-- linking — mirrors the pattern used by daily_logs.related_action_item_ids /
-- related_rfi_ids (migration 053). Drives bidirectional surfacing of issues
-- that affect a schedule task: RFIs, Change Orders, Action Items.
--
-- Default '[]' so old rows are well-formed JSON arrays on read (no NULL
-- branches needed in the UI). RLS already enforces project-scoped access on
-- schedule_tasks via user_has_project_access(project_id) — no policy change.

ALTER TABLE schedule_tasks
  ADD COLUMN IF NOT EXISTS related_rfi_ids           JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_change_order_ids  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_action_item_ids   JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN schedule_tasks.related_rfi_ids IS
  'Optional array of rfis.id strings linked from this schedule task';
COMMENT ON COLUMN schedule_tasks.related_change_order_ids IS
  'Optional array of change_orders.id strings linked from this schedule task';
COMMENT ON COLUMN schedule_tasks.related_action_item_ids IS
  'Optional array of action_items.id strings linked from this schedule task';

NOTIFY pgrst, 'reload schema';
