-- ============================================================================
-- Schedule summary-task rollup: maintain is_summary + derive parent dates in DB
-- ============================================================================
--
-- Problem this solves
-- -------------------
-- A parent (summary) schedule_task's start/end should span its children
-- (start = MIN(child start), end = MAX(child end)), and `is_summary` should be
-- true exactly when a task has >=1 child. Until now that rollup happened only
-- in the Gantt display layer (scheduleTree.rollupSummary) and `is_summary` was
-- set only at creation time — reparenting (reparentTasks.js) never updated it.
-- So `is_summary` was unreliable and every non-Gantt surface (dashboards,
-- reports, command center) saw stale parent dates.
--
-- This migration moves the rollup into the database as an AFTER-row trigger so
-- the stored values are always correct, on every write path, for every reader.
--
-- Design notes
-- ------------
--  * Only start_date, end_date, is_summary are derived here. percent_complete
--    and duration are intentionally NOT rolled up: the table has a
--    `schedule_status_pct_consistency` CHECK coupling status<->percent_complete
--    that a naive average would violate, and duration/pct rollups remain a
--    display-layer concern (scheduleTree). Dates + is_summary are the contract.
--  * Termination: recompute_schedule_summary only writes when a derived value
--    IS DISTINCT FROM the stored value. When nothing changes, no UPDATE fires,
--    so the AFTER-UPDATE cascade stops. Upward propagation to grandparents is
--    automatic: updating a parent row re-fires this trigger on that row, which
--    recomputes ITS parent, and so on up the chain.
--  * Reparent (UPDATE of parent_task_id): recompute BOTH the old and the new
--    parent. Each recompute cascades up its own chain.
--  * Delete: the FK is ON DELETE SET NULL, so a deleted parent's children are
--    UPDATEd to parent_task_id = NULL (which re-fires this trigger for each and
--    recomputes the null-side, i.e. nothing). We additionally recompute the
--    deleted row's OWN parent (the grandparent), whose child set just shrank.
--  * Project containment: recompute reads only children WHERE
--    parent_task_id = target AND project_id = target.project_id, and writes only
--    the target row. Cross-project rows can never be touched.
--  * SECURITY DEFINER + `set search_path = public`: mirrors the existing
--    prevent_schedule_task_cycle trigger. The rollup must succeed for any user
--    permitted to edit the child (project field+). Running as definer writes the
--    three derived columns on same-project ancestors without depending on the
--    editing user independently satisfying every ancestor's UPDATE WITH CHECK.
--    It writes ONLY start_date/end_date/is_summary and ONLY within one project.
-- ============================================================================

-- ── Per-task recompute ──────────────────────────────────────────────────────
-- Recompute is_summary + rolled dates for ONE task from its DIRECT children.
-- Writes (and thus re-fires the AFTER trigger to propagate upward) only when a
-- derived value actually differs from what's stored. No-op for a null id or a
-- row that no longer exists.
create or replace function public.recompute_schedule_summary(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- Anchor to the target's project so we only ever read/write within it.
  select project_id into v_project_id
  from public.schedule_tasks
  where id = p_task_id;

  if v_project_id is null then
    -- Row was deleted (or never existed) — nothing to roll up.
    return;
  end if;

  -- Aggregate the DIRECT children (same project).
  select count(*), min(start_date), max(end_date)
    into v_child_count, v_min_start, v_max_end
  from public.schedule_tasks
  where parent_task_id = p_task_id
    and project_id = v_project_id;

  v_is_summary := (v_child_count > 0);

  if v_is_summary then
    -- A summary task's stored dates become the children's span. If children
    -- have no dates yet (all TBD), MIN/MAX are NULL and we leave the parent's
    -- own dates in place rather than clobbering them to NULL.
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
    -- No children: clear the summary flag. Leave the (now-leaf) task's own
    -- dates untouched — they are user-owned again.
    update public.schedule_tasks t
       set is_summary = false
     where t.id = p_task_id
       and t.is_summary is distinct from false;
  end if;
end;
$$;

-- Lock down EXECUTE. The baseline runs `ALTER DEFAULT PRIVILEGES ... GRANT ALL
-- ON FUNCTIONS TO anon, authenticated`, which would otherwise auto-grant this
-- definer function to every caller — letting anyone force a derived write onto
-- any schedule_tasks row in a project they can't access. Match the convention
-- used for the user_has_project_* helpers (REVOKE FROM PUBLIC). The trigger
-- runs as the function owner regardless of these grants, so revoking here does
-- not affect normal rollup; it only closes the direct-invocation surface.
revoke all on function public.recompute_schedule_summary(uuid) from public;
revoke all on function public.recompute_schedule_summary(uuid) from anon, authenticated;

comment on function public.recompute_schedule_summary(uuid) is
  'Recompute is_summary + rolled start/end (MIN child start, MAX child end) for one schedule_task from its direct children. Writes only on a real change so the AFTER-trigger cascade terminates; propagates upward because the write re-fires the trigger.';

-- ── AFTER-row trigger dispatcher ────────────────────────────────────────────
-- Recomputes whichever parent chains were affected by the row change, then lets
-- the resulting ancestor writes propagate further up on their own re-fires.
create or replace function public.schedule_task_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Depth guard (defense in depth). Upward propagation happens because a parent
  -- write re-fires this AFTER trigger on the parent row, so on a chain of depth
  -- N this trigger nests N levels. prevent_schedule_task_cycle already rejects
  -- true cycles, so this can only be reached by an absurdly deep (but acyclic)
  -- WBS. Cap nesting at a level far beyond any real schedule (100) so a
  -- pathological chain can't recurse without bound. Past the cap we simply stop
  -- propagating further up rather than raising — the lower levels are already
  -- correct; only the very top of an implausibly deep tree would lag.
  if pg_trigger_depth() > 100 then
    if tg_op = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    -- New leaf may turn its parent into a summary and widen its span.
    perform public.recompute_schedule_summary(NEW.parent_task_id);
    return NEW;

  elsif tg_op = 'UPDATE' then
    -- Reparent: both the old and new parent's child sets changed.
    if NEW.parent_task_id is distinct from OLD.parent_task_id then
      perform public.recompute_schedule_summary(OLD.parent_task_id);
      perform public.recompute_schedule_summary(NEW.parent_task_id);
    -- Same parent but the child's own dates moved: reroll the current parent.
    elsif (NEW.start_date is distinct from OLD.start_date)
       or (NEW.end_date   is distinct from OLD.end_date) then
      perform public.recompute_schedule_summary(NEW.parent_task_id);
    end if;
    return NEW;

  elsif tg_op = 'DELETE' then
    -- The deleted row's parent lost a child (and the deleted row's children,
    -- if any, are being SET NULL by the FK, which re-fires per child).
    perform public.recompute_schedule_summary(OLD.parent_task_id);
    return OLD;
  end if;

  return null;
end;
$$;

comment on function public.schedule_task_rollup() is
  'AFTER INSERT/UPDATE/DELETE dispatcher on schedule_tasks: recomputes the affected parent chain(s) via recompute_schedule_summary. Handles reparent (old+new parent) and delete (old parent). Upward propagation is automatic via re-fire.';

-- Same lockdown as recompute_schedule_summary: a trigger function can't be
-- called with the trigger-record context outside a trigger, but revoke anyway
-- to stay consistent with the definer-function convention and avoid an
-- unnecessary EXECUTE grant to anon/authenticated from the baseline default.
revoke all on function public.schedule_task_rollup() from public;
revoke all on function public.schedule_task_rollup() from anon, authenticated;

-- Guard rows: fire only when something rollup-relevant changed. On UPDATE we
-- care about parent_task_id / start_date / end_date moving. INSERT/DELETE always
-- fire (a leaf appeared/disappeared under some parent).
drop trigger if exists trg_schedule_task_rollup on public.schedule_tasks;

create trigger trg_schedule_task_rollup
  after insert or delete on public.schedule_tasks
  for each row
  execute function public.schedule_task_rollup();

drop trigger if exists trg_schedule_task_rollup_upd on public.schedule_tasks;

create trigger trg_schedule_task_rollup_upd
  after update of parent_task_id, start_date, end_date on public.schedule_tasks
  for each row
  when (
    NEW.parent_task_id is distinct from OLD.parent_task_id
    or NEW.start_date is distinct from OLD.start_date
    or NEW.end_date   is distinct from OLD.end_date
  )
  execute function public.schedule_task_rollup();

-- ── One-time backfill (bottom-up) ───────────────────────────────────────────
-- Existing rows have stale is_summary and un-rolled parent dates. Recompute
-- every current parent from the deepest level upward so each parent already
-- sees its children's freshly-rolled values by the time we process it.
--
-- "Height" = distance to the farthest leaf below a node (leaf = 0, a parent
-- directly above leaves = 1, its grandparent = 2, ...). Processing parents in
-- ASCENDING height order (1, then 2, ...) guarantees a parent is rolled only
-- AFTER all of its descendant-parents already were — so by the time we roll a
-- grandparent, the parents beneath it already hold settled child spans.
do $$
declare
  r record;
begin
  for r in
    with recursive
    -- Every task with its direct-child count; parents are child_count > 0.
    child_counts as (
      select t.id,
             t.project_id,
             (select count(*) from public.schedule_tasks c
               where c.parent_task_id = t.id
                 and c.project_id = t.project_id) as child_count
      from public.schedule_tasks t
    ),
    -- Height of each node = 0 for a leaf, else 1 + max child height.
    -- Walk up from leaves accumulating height so we can order deepest-first.
    heights as (
      -- Base: leaves have height 0.
      select t.id, t.parent_task_id, t.project_id, 0 as height
      from public.schedule_tasks t
      where not exists (
        select 1 from public.schedule_tasks c
        where c.parent_task_id = t.id and c.project_id = t.project_id
      )
      union all
      -- Step: a parent's height is one more than a child's; the greatest such
      -- value wins after the GROUP BY below. Recurse upward via parent_task_id.
      select p.id, p.parent_task_id, p.project_id, h.height + 1
      from heights h
      join public.schedule_tasks p
        on p.id = h.parent_task_id
       and p.project_id = h.project_id
    ),
    node_height as (
      select id, max(height) as height
      from heights
      group by id
    )
    select cc.id, nh.height
    from child_counts cc
    join node_height nh on nh.id = cc.id
    where cc.child_count > 0            -- only parents need rolling up
    order by nh.height asc              -- height 1 (above leaves) before 2, 3...
  loop
    -- Ascending height => a parent is rolled before its own parent, so each
    -- grandparent sees already-settled child spans. Bottom-up, exactly once.
    perform public.recompute_schedule_summary(r.id);
  end loop;

  -- Belt-and-suspenders: any lingering is_summary=true on a row that has no
  -- children (e.g. a former parent whose children were all removed before this
  -- trigger existed) gets cleared.
  update public.schedule_tasks t
     set is_summary = false
   where t.is_summary = true
     and not exists (
       select 1 from public.schedule_tasks c
       where c.parent_task_id = t.id and c.project_id = t.project_id
     );
end $$;
