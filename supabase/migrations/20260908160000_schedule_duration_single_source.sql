-- Duration: one source of truth, and it is the dates
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §2.4).
--
-- `schedule_tasks.duration` drifted from `end_date - start_date` on 199 of the
-- 338 dated rows. The application read it in one place (Bulk Duration) and
-- derived it everywhere else, so a bulk edit could rewrite a finish date from a
-- number the UI had never displayed.
--
-- ## The convention
--
-- INCLUSIVE calendar days: Mon → Fri is 5, a same-day task is 1. That is what
-- P6 and MS Project mean by duration, so an exported or imported schedule lines
-- up with the GC's, and it is what a PM means by "a five-day pour".
--
-- It is also what this table already mostly said. Of the 338 dated rows, 139
-- matched inclusive and only 76 matched exclusive — the drift was mostly rows
-- that had simply gone stale, not a competing convention.
--
-- ## Why a trigger and not a generated column
--
-- A GENERATED ALWAYS column cannot be written to at all, which would break
-- every importer (CSV, MS Project XML, bulkCreate) that legitimately sets
-- `duration` on insert — including rows that have a duration but no dates yet.
-- A BEFORE trigger accepts those writes and simply corrects them whenever both
-- dates are present, so the column can never contradict the dates while still
-- carrying information for a row that has not been fully scheduled.
--
-- Rows with a missing date keep whatever duration they were given. That is not
-- a gap: a duration with no window is the only thing such a row knows, and
-- overwriting it with NULL would destroy information.

BEGIN;

-- ─── 1) keep it in sync from here on ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_schedule_task_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL THEN
    -- Inclusive: both endpoints count. `(end - start)` in Postgres date math is
    -- the exclusive difference, so the +1 is the whole convention.
    IF NEW.end_date >= NEW.start_date THEN
      NEW.duration := (NEW.end_date - NEW.start_date) + 1;
    ELSE
      -- Inverted window (2 legacy rows exist). A negative duration would
      -- propagate into the roll-up weighting as a nonsense weight, so record
      -- unknown rather than a lie. The app-side validator rejects new ones.
      NEW.duration := NULL;
    END IF;
  END IF;
  -- Both dates not present: leave whatever the caller supplied. An importer
  -- setting a duration on a not-yet-dated row is the one case where the column
  -- carries information the dates do not.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_schedule_task_duration() IS
  'Keeps schedule_tasks.duration equal to (end_date - start_date) + 1 — INCLUSIVE days, matching P6/MS Project and src/lib/schedule/duration.ts. A trigger rather than a GENERATED column so importers can still set a duration on a row that has no dates yet.';

DROP TRIGGER IF EXISTS trg_schedule_task_duration_sync ON public.schedule_tasks;
CREATE TRIGGER trg_schedule_task_duration_sync
  BEFORE INSERT OR UPDATE OF start_date, end_date, duration ON public.schedule_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_schedule_task_duration();

-- ─── 2) reconcile the rows that already drifted ──────────────────────────────

DO $$
DECLARE
  v_stale integer;
BEGIN
  SELECT count(*) INTO v_stale
  FROM public.schedule_tasks
  WHERE start_date IS NOT NULL AND end_date IS NOT NULL
    AND end_date >= start_date
    AND duration IS DISTINCT FROM (end_date - start_date) + 1;

  RAISE NOTICE 'schedule duration reconcile: correcting % row(s)', v_stale;
END $$;

UPDATE public.schedule_tasks
SET duration = (end_date - start_date) + 1
WHERE start_date IS NOT NULL AND end_date IS NOT NULL
  AND end_date >= start_date
  AND duration IS DISTINCT FROM (end_date - start_date) + 1;

-- An inverted window has no meaningful duration; NULL is the honest value and
-- the app renders it as TBD rather than as a zero-length task.
UPDATE public.schedule_tasks
SET duration = NULL
WHERE start_date IS NOT NULL AND end_date IS NOT NULL
  AND end_date < start_date
  AND duration IS NOT NULL;

-- ─── 3) prove it, in the same transaction ────────────────────────────────────

DO $$
DECLARE
  v_remaining integer;
  v_undated   integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.schedule_tasks
  WHERE start_date IS NOT NULL AND end_date IS NOT NULL
    AND end_date >= start_date
    AND duration IS DISTINCT FROM (end_date - start_date) + 1;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'schedule duration reconcile left % row(s) disagreeing with their dates', v_remaining;
  END IF;

  SELECT count(*) INTO v_undated
  FROM public.schedule_tasks
  WHERE start_date IS NULL OR end_date IS NULL;

  RAISE NOTICE 'schedule duration reconcile: 0 dated rows disagree; % undated row(s) keep their stored duration',
    v_undated;
END $$;

COMMENT ON COLUMN public.schedule_tasks.duration IS
  'Duration in INCLUSIVE calendar days (Mon → Fri = 5, same-day = 1), matching P6/MS Project. Derived from the dates and kept in sync by trg_schedule_task_duration_sync — the DATES are the source of truth. Only meaningful on its own for a row that has no start or finish yet.';

COMMIT;
