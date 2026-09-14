-- schedule_tasks became soft-delete (is_deleted / deleted_at + the BEFORE DELETE
-- guard trg_enforce_schedule_task_guards), but the summary rollup was never told.
-- Two independent faults, both of which leave a parent summary task describing a
-- task the user has already deleted:
--
-- 1. recompute_schedule_summary() counts and date-ranges children with only
--      where parent_task_id = p_task_id and project_id = v_project_id
--    and no is_deleted filter. A tombstoned child still contributes to
--    count(*), min(start_date) and max(end_date). Soft-delete the earliest
--    child of a phase and the phase keeps starting on the deleted task's date;
--    soft-delete the ONLY child and the parent stays is_summary = true forever.
--
-- 2. trg_schedule_task_rollup_upd fires AFTER UPDATE OF
--      (parent_task_id, start_date, end_date)
--    which does not include is_deleted, so a soft delete never reaches the
--    rollup at all. Before soft-delete existed this was correct — a hard DELETE
--    went through trg_schedule_task_rollup (AFTER INSERT OR DELETE). That path
--    is now unreachable, so without this change nothing recomputes on delete.
--
-- Fault 1 alone would be latent; fault 2 alone would be latent. Together the
-- parent's dates are simply never corrected. Both are fixed here.
--
-- Scope: rewrites one function body and re-creates one trigger. No table,
-- column, policy, grant or row is touched. Idempotent and safe to re-run.
-- The recursion guard in schedule_task_rollup (pg_trigger_depth() > 100) is
-- unchanged and still applies: recompute never writes is_deleted, so widening
-- the trigger's column list cannot deepen the existing cascade.

CREATE OR REPLACE FUNCTION public.recompute_schedule_summary(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_project_id uuid;
  v_child_count int;
  v_min_start date;
  v_max_end date;
  v_is_summary boolean;
begin
  if p_task_id is null then
    return;
  end if;

  select project_id into v_project_id
  from public.schedule_tasks
  where id = p_task_id;

  if v_project_id is null then
    return;
  end if;

  -- LIVE children only. A tombstoned child is not work anybody is doing, so it
  -- must not set the parent's span or keep it flagged as a summary.
  select count(*), min(start_date), max(end_date)
    into v_child_count, v_min_start, v_max_end
  from public.schedule_tasks
  where parent_task_id = p_task_id
    and project_id = v_project_id
    and is_deleted = false;

  v_is_summary := (v_child_count > 0);

  if v_is_summary then
    update public.schedule_tasks t
       set is_summary = v_is_summary,
           start_date = coalesce(v_min_start, t.start_date),
           end_date   = coalesce(v_max_end,   t.end_date)
     where t.id = p_task_id
       and (
         t.is_summary is distinct from v_is_summary
         or t.start_date is distinct from coalesce(v_min_start, t.start_date)
         or t.end_date   is distinct from coalesce(v_max_end,   t.end_date)
       );
  else
    update public.schedule_tasks t
       set is_summary = false
     where t.id = p_task_id
       and t.is_summary is distinct from false;
  end if;
end;
$function$;

-- Add is_deleted to the watched columns so a soft delete (and an undelete)
-- recomputes the parent. The WHEN clause keeps the trigger from firing on
-- unrelated no-op updates, exactly as before.
DROP TRIGGER IF EXISTS trg_schedule_task_rollup_upd ON public.schedule_tasks;
CREATE TRIGGER trg_schedule_task_rollup_upd
AFTER UPDATE OF parent_task_id, start_date, end_date, is_deleted
ON public.schedule_tasks
FOR EACH ROW
WHEN (
  new.parent_task_id IS DISTINCT FROM old.parent_task_id
  OR new.start_date IS DISTINCT FROM old.start_date
  OR new.end_date IS DISTINCT FROM old.end_date
  OR new.is_deleted IS DISTINCT FROM old.is_deleted
)
EXECUTE FUNCTION public.schedule_task_rollup();

-- schedule_task_rollup() already routes UPDATE through the parent_task_id /
-- start_date / end_date comparisons; an is_deleted-only change falls through
-- them and would recompute nothing. Recompute the parent explicitly for that
-- case, on both sides of a re-parent.
CREATE OR REPLACE FUNCTION public.schedule_task_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 100 then
    if tg_op = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_schedule_summary(NEW.parent_task_id);
    return NEW;

  elsif tg_op = 'UPDATE' then
    if NEW.parent_task_id is distinct from OLD.parent_task_id then
      perform public.recompute_schedule_summary(OLD.parent_task_id);
      perform public.recompute_schedule_summary(NEW.parent_task_id);
    elsif (NEW.start_date is distinct from OLD.start_date)
       or (NEW.end_date   is distinct from OLD.end_date)
       or (NEW.is_deleted is distinct from OLD.is_deleted) then
      perform public.recompute_schedule_summary(NEW.parent_task_id);
    end if;
    return NEW;

  elsif tg_op = 'DELETE' then
    perform public.recompute_schedule_summary(OLD.parent_task_id);
    return OLD;
  end if;

  return null;
end;
$function$;

NOTIFY pgrst, 'reload schema';
