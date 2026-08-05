-- ============================================================================
-- 042_work_packages_scheduling_window.sql
--
-- Unblocks the Resource Scheduling page. The UI reads wp.startDate / wp.endDate
-- when placing work-package bars on the timeline, but those columns never
-- existed on work_packages — only `released_date`. Result: every WP fell into
-- the "Unscheduled" bucket and the board rendered empty. Drag-to-reschedule
-- couldn't persist either because there was nowhere to write to.
--
-- Adds the canonical scheduling window:
--   - scheduled_start_date  DATE — when the WP is planned to start
--   - scheduled_end_date    DATE — when it's planned to finish
--
-- Distinct from released_date (the date the package was released to the
-- shop). released_date is still useful as an "actual start" fallback when
-- the user hasn't set scheduled_start_date yet.
--
-- Nullable; no defaults. Existing WPs continue to show "Unscheduled" until
-- a user drags them onto a resource row (or edits them) which sets both.
-- ============================================================================

ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS scheduled_start_date DATE;
ALTER TABLE work_packages ADD COLUMN IF NOT EXISTS scheduled_end_date   DATE;

-- Partial index for the Resource Scheduling board's "scheduled WPs in this
-- project" query — keeps the list fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_work_packages_schedule_window
  ON work_packages(project_id, scheduled_start_date)
  WHERE scheduled_start_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
