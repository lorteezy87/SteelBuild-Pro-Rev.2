-- ============================================================================
-- SQL-level test for the schedule summary-rollup trigger
-- (migration 20260707061933_schedule_summary_rollup.sql)
-- ============================================================================
--
-- Run against a NON-PROD branch database (never prod). Wrapped in a single
-- transaction that ROLLs BACK at the end, so it leaves no data behind:
--
--   psql "$BRANCH_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/schedule_summary_rollup_test.sql
--
-- Proves the three behaviors the migration must guarantee:
--   1. inserting a child rolls the parent's dates up (MIN start / MAX end)
--   2. reparenting a child moves the rollup from the old parent to the new one
--   3. deleting a task's last child clears its is_summary flag
-- Plus: upward propagation to a grandparent.
--
-- Uses a throwaway project so RLS/policies aren't in the way (runs as the
-- migration/admin role). Every assertion raises EXCEPTION on failure, which
-- ON_ERROR_STOP turns into a non-zero exit.

begin;

do $$
declare
  v_project uuid;
  v_gp uuid;
  v_p uuid;
  v_p2 uuid;
  v_c1 uuid;
  v_c2 uuid;
  r record;
begin
  -- Throwaway project.
  insert into public.projects (name, project_number)
  values ('__rollup_test__', 'ROLLUP-TEST')
  returning id into v_project;

  -- ── Scenario 1: child insert rolls the parent's dates ────────────────────
  insert into public.schedule_tasks (project_id, task_name, status)
  values (v_project, 'Parent', 'Not Started')
  returning id into v_p;

  -- Parent starts as a non-summary with no dates.
  select is_summary, start_date, end_date into r from public.schedule_tasks where id = v_p;
  if r.is_summary is not false then
    raise exception 'S1a: fresh parent should not be a summary, got is_summary=%', r.is_summary;
  end if;

  insert into public.schedule_tasks (project_id, task_name, parent_task_id, start_date, end_date, status)
  values (v_project, 'Child 1', v_p, date '2026-03-10', date '2026-03-20', 'Not Started')
  returning id into v_c1;

  select is_summary, start_date, end_date into r from public.schedule_tasks where id = v_p;
  if r.is_summary is not true then
    raise exception 'S1b: parent should be a summary after first child, got %', r.is_summary;
  end if;
  if r.start_date <> date '2026-03-10' or r.end_date <> date '2026-03-20' then
    raise exception 'S1c: parent dates should span child, got % .. %', r.start_date, r.end_date;
  end if;

  -- A wider second child widens the parent's span.
  insert into public.schedule_tasks (project_id, task_name, parent_task_id, start_date, end_date, status)
  values (v_project, 'Child 2', v_p, date '2026-03-05', date '2026-04-01', 'Not Started')
  returning id into v_c2;

  select start_date, end_date into r from public.schedule_tasks where id = v_p;
  if r.start_date <> date '2026-03-05' or r.end_date <> date '2026-04-01' then
    raise exception 'S1d: parent should widen to %/%, got % .. %',
      date '2026-03-05', date '2026-04-01', r.start_date, r.end_date;
  end if;

  -- ── Scenario 4: upward propagation to a grandparent ──────────────────────
  insert into public.schedule_tasks (project_id, task_name, status)
  values (v_project, 'Grandparent', 'Not Started')
  returning id into v_gp;

  update public.schedule_tasks set parent_task_id = v_gp where id = v_p;

  select is_summary, start_date, end_date into r from public.schedule_tasks where id = v_gp;
  if r.is_summary is not true or r.start_date <> date '2026-03-05' or r.end_date <> date '2026-04-01' then
    raise exception 'S4: grandparent should span parent span, got is_summary=% % .. %',
      r.is_summary, r.start_date, r.end_date;
  end if;

  -- ── Scenario 2: reparent moves the rollup between parents ────────────────
  insert into public.schedule_tasks (project_id, task_name, status)
  values (v_project, 'Parent 2', 'Not Started')
  returning id into v_p2;

  -- Move Child 2 from Parent → Parent 2.
  update public.schedule_tasks set parent_task_id = v_p2 where id = v_c2;

  -- Parent 2 now spans Child 2.
  select is_summary, start_date, end_date into r from public.schedule_tasks where id = v_p2;
  if r.is_summary is not true or r.start_date <> date '2026-03-05' or r.end_date <> date '2026-04-01' then
    raise exception 'S2a: new parent should span moved child, got is_summary=% % .. %',
      r.is_summary, r.start_date, r.end_date;
  end if;

  -- Original parent shrank back to just Child 1's span.
  select start_date, end_date into r from public.schedule_tasks where id = v_p;
  if r.start_date <> date '2026-03-10' or r.end_date <> date '2026-03-20' then
    raise exception 'S2b: old parent should shrink to remaining child, got % .. %',
      r.start_date, r.end_date;
  end if;

  -- ── Scenario 3: deleting the last child clears is_summary ────────────────
  delete from public.schedule_tasks where id = v_c1;   -- Parent's only remaining child

  select is_summary into r from public.schedule_tasks where id = v_p;
  if r.is_summary is not false then
    raise exception 'S3: parent should no longer be a summary after last child deleted, got %', r.is_summary;
  end if;

  raise notice 'schedule_summary_rollup_test: ALL ASSERTIONS PASSED';
end $$;

rollback;
