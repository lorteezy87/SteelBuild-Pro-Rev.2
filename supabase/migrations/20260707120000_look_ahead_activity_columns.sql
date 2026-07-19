-- 20260707120000
--
-- Look-Ahead planner - per-activity columns.
--
-- The look_ahead table shipped in the baseline with a weekly-bucket shape
-- (week_start / week_end / tasks / notes / metadata). Its only consumer,
-- src/pages/LookAheadSchedule.jsx, is a PER-ACTIVITY planner: one row per
-- field activity, each with its own crew, phase, planned-vs-forecast dates
-- and percent-complete. Those fields were never columns, so every create
-- failed with PostgREST "Could not find the 'activity' column of 'look_ahead'
-- in the schema cache".
--
-- This adds the missing per-activity columns so the page persists. Additive
-- only - the existing weekly columns are left in place (unused by the app
-- today). All new columns are nullable (activity is required client-side);
-- percent_complete defaults 0. The page coerces empty date inputs to NULL
-- before writing, so these stay real `date` columns.

alter table public.look_ahead
  add column if not exists activity         text,
  add column if not exists phase            text,
  add column if not exists crew             text,
  add column if not exists planned_start    date,
  add column if not exists planned_end      date,
  add column if not exists forecast_start   date,
  add column if not exists forecast_end     date,
  add column if not exists percent_complete numeric not null default 0;

notify pgrst, 'reload schema';
