-- ============================================================================
-- 054_schedule_dependencies_link_objects.sql
--
-- Predecessor cascade epic — extend the legacy `schedule_tasks.dependencies`
-- TEXT column from a flat array of task-ID strings to an array of link
-- objects with type + lag, so SS / FF / SF and configurable lag are
-- representable. Existing FS+1 behaviour is preserved exactly.
--
-- Why this column shape (instead of the relational `task_dependencies`
-- table introduced in migration 048):
--   - Every reader and writer (ScheduleGantt cascade, TaskDetailDrawer
--     editor, MS-Project import, scheduleUtils.computeAutoScheduledDates)
--     reads `schedule_tasks.dependencies` directly. The relational table
--     was added but no code path uses it yet — backfilling it while UI
--     still reads the JSON column would create dual-truth.
--   - Keeping the column and just upgrading the element shape lets us
--     ship the cascade upgrade in one migration without forcing a
--     parallel rewrite of every reader.
--
-- Element shape change:
--    OLD : ["uuid-a", "uuid-b"]
--    NEW : [{"id":"uuid-a","type":"FS","lag_days":1},
--           {"id":"uuid-b","type":"FS","lag_days":1}]
--
-- The default of FS + 1 day matches the hardcoded behaviour the previous
-- cascade applied (every link in ScheduleGantt's effectiveDates memo
-- added 1 day to the predecessor's finish), so this is a behaviour-
-- preserving migration for current data.
-- ============================================================================

-- Backfill: convert each string element to a link-object element. Any row
-- whose JSON is already in object form is left untouched (idempotent).
-- Empty / null / non-array values are left alone.
UPDATE schedule_tasks
SET dependencies = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem) = 'string' THEN
        jsonb_build_object('id', elem #>> '{}', 'type', 'FS', 'lag_days', 1)
      ELSE elem
    END
  )::text
  FROM jsonb_array_elements(dependencies::jsonb) AS elem
)
WHERE dependencies IS NOT NULL
  AND dependencies <> ''
  AND dependencies <> 'null'
  AND jsonb_typeof(dependencies::jsonb) = 'array'
  AND jsonb_array_length(dependencies::jsonb) > 0
  -- Only rewrite rows that still hold at least one string element. Rows
  -- already migrated to all-object form are skipped, making this migration
  -- idempotent if it ever runs twice.
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(dependencies::jsonb) AS e
    WHERE jsonb_typeof(e) = 'string'
  );

-- No schema change to RLS — the column is on schedule_tasks, which already
-- has user_has_project_access(project_id) policies in place.
NOTIFY pgrst, 'reload schema';
