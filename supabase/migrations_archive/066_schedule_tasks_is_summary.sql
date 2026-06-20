-- ============================================================================
-- 066_schedule_tasks_is_summary.sql
--
-- Adds the missing is_summary boolean column on schedule_tasks. The MPP
-- importer in Schedule.jsx:532 writes this field to mark MS-Project
-- summary rows (parent groupings) so the UI can render them as collapsible
-- bars rather than leaf tasks. Without the column, every MPP import
-- crashed with:
--
--   [schedule_tasks.create] Could not find the 'is_summary' column of
--   'schedule_tasks' in the schema cache
--
-- Default false so existing rows are unaffected. Indexed when true so
-- the gantt's "show summaries only" filter is fast.
-- ============================================================================

ALTER TABLE schedule_tasks
  ADD COLUMN is_summary boolean DEFAULT false NOT NULL;

CREATE INDEX schedule_tasks_is_summary_idx ON schedule_tasks(is_summary)
  WHERE is_summary = true;

NOTIFY pgrst, 'reload schema';
