-- Schedule actuals — record what actually happened, separately from the plan
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §1.4, §7.1).
--
-- `schedule_tasks` carried start_date / end_date / duration / percent_complete /
-- status and nothing else, so there was nowhere to record when work actually
-- started or finished. Consequences observed in production:
--
--   * 178 tasks are status = Complete. 40 of them have neither a start nor a
--     finish date — marking a task Complete stamped percent_complete = 100 and
--     recorded no date at all.
--   * Planned-vs-actual variance could not be computed, so the schedule could
--     not answer the question a delay claim turns on: did we finish when we
--     said we would?
--
-- These columns are deliberately NOT backfilled. `end_date` is the PLANNED
-- finish; copying it into actual_finish_date would manufacture evidence that a
-- task finished on plan when nobody recorded that it did. A NULL here means
-- "nobody recorded it", which is the truth, and the UI renders it as unknown
-- rather than as an affirmative on-time finish.

BEGIN;

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS actual_start_date  date,
  ADD COLUMN IF NOT EXISTS actual_finish_date date;

COMMENT ON COLUMN public.schedule_tasks.actual_start_date IS
  'Date work actually started. NULL = not recorded (never inferred from start_date, which is the plan). Stamped from the local-time today when status first moves to In Progress; always editable.';

COMMENT ON COLUMN public.schedule_tasks.actual_finish_date IS
  'Date work actually finished. NULL = not recorded (never inferred from end_date, which is the plan). Stamped from the local-time today when status first moves to Complete; always editable.';

-- Mirror the app-side assertScheduleDateRange so the invariant holds for every
-- client, including the MCP server and direct SQL. NOT VALID so the constraint
-- applies to new and updated rows without a full-table rewrite; nothing in
-- production can violate it today (both columns are new and entirely NULL), and
-- it is validated immediately below.
ALTER TABLE public.schedule_tasks
  DROP CONSTRAINT IF EXISTS schedule_tasks_actual_range_chk;

ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_actual_range_chk
  CHECK (
    actual_start_date IS NULL
    OR actual_finish_date IS NULL
    OR actual_finish_date >= actual_start_date
  ) NOT VALID;

ALTER TABLE public.schedule_tasks
  VALIDATE CONSTRAINT schedule_tasks_actual_range_chk;

COMMENT ON CONSTRAINT schedule_tasks_actual_range_chk ON public.schedule_tasks IS
  'An actual finish cannot precede an actual start. Either may be NULL — a task can be started and not yet finished, and neither is required.';

-- Partial index: the variance report and the "started but never closed out"
-- sweep both filter on recorded actuals, which will stay a small subset of the
-- table for as long as actuals are being adopted.
CREATE INDEX IF NOT EXISTS schedule_tasks_actuals_idx
  ON public.schedule_tasks (project_id, actual_finish_date)
  WHERE actual_start_date IS NOT NULL OR actual_finish_date IS NOT NULL;

COMMIT;
