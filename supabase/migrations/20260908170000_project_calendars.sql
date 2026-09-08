-- Per-project working calendar
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §2.1, §7.4).
--
-- All Gantt and cascade math was calendar days: `addDaysIso` adds raw days, so
-- FS+1 off a Friday finish started the successor on Saturday. 32 tasks in
-- production start on a weekend.
--
-- The repo already had two working-day libraries and the schedule used neither
-- — lib/workingDays.ts (Mon–Fri, Submittals) and lib/workweek.js (a
-- WORKDAYS_PER_WEEK knob, Crew Scheduling) — so Crew Scheduling and the Gantt
-- disagreed about how long a week is, in the same app, about the same crews.
-- Neither supports holidays or a per-project shift pattern.
--
-- A row here is OPTIONAL. A project without one is treated as Mon–Fri with no
-- holidays by src/lib/schedule/workingCalendar.ts, so every project gets the
-- weekend fix immediately and a shop running Saturdays or 4x10s configures the
-- exception. One row per project.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_calendars (
  project_id  uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Day-of-week numbers that are working days, matching JavaScript's
  -- Date#getUTCDay: 0 = Sunday … 6 = Saturday. Mon–Fri is {1,2,3,4,5}.
  work_days   smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  -- Non-working dates regardless of weekday: shop shutdowns, public holidays.
  holidays    date[]     NOT NULL DEFAULT ARRAY[]::date[],
  -- Free text, e.g. "5 × 8 (Mon–Fri)", "4 × 10", "6-day". Descriptive only —
  -- the arrays above are what the math reads, so a mislabelled row cannot
  -- silently reschedule a job.
  shift_label text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- An empty work_days would mean "this shop never works", under which no date
  -- can ever be scheduled. The client already treats empty as unconfigured;
  -- rejecting it here stops the row existing in the first place.
  CONSTRAINT project_calendars_work_days_not_empty
    CHECK (array_length(work_days, 1) >= 1),
  CONSTRAINT project_calendars_work_days_in_range
    CHECK (work_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);

COMMENT ON TABLE public.project_calendars IS
  'Optional per-project working calendar. Absent = Mon–Fri with no holidays (src/lib/schedule/workingCalendar.ts DEFAULT_CALENDAR), so every project gets weekend-aware scheduling without setup.';
COMMENT ON COLUMN public.project_calendars.work_days IS
  'Working weekdays as Date#getUTCDay values: 0 = Sunday … 6 = Saturday. Mon–Fri is {1,2,3,4,5}; a 6-day shop adds 6.';
COMMENT ON COLUMN public.project_calendars.shift_label IS
  'Descriptive only. work_days and holidays are what the scheduling math reads, so a wrong label cannot move a date.';

DROP TRIGGER IF EXISTS trg_project_calendars_updated_at ON public.project_calendars;
CREATE TRIGGER trg_project_calendars_updated_at
  BEFORE UPDATE ON public.project_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Same shape as schedule_tasks: explicit per-command policies, no blanket-true.
-- Changing the calendar reschedules the whole job, so writing is 'pm' rather
-- than 'field'; reading needs only project access.

ALTER TABLE public.project_calendars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_select ON public.project_calendars;
CREATE POLICY project_select ON public.project_calendars
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.project_calendars;
CREATE POLICY project_insert ON public.project_calendars
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS project_update ON public.project_calendars;
CREATE POLICY project_update ON public.project_calendars
  FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

DROP POLICY IF EXISTS project_delete ON public.project_calendars;
CREATE POLICY project_delete ON public.project_calendars
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));

-- No rows are seeded. An absent row is the Mon–Fri default, and inserting one
-- per project would turn an implicit default into 15 rows that then have to be
-- maintained.

COMMIT;
