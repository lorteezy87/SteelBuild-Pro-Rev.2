-- Phase 0, Option C — gate the SUBMITTAL "Released for Fabrication" transition.
--
-- The submittal is the workflow authority (§20): status='Released for Fabrication'
-- is the canonical "released to fab shop". This blocks that transition server-side
-- when OPEN RFIs reference the sheets in the submittal's linked drawing sets,
-- unless a PM records an override reason on the row. Complements the Phase-0
-- drawing-package gate (fab_release_log); together the server arbitrates BOTH
-- notions of release.
--
-- Risk control (this is the moat write path the original deferral flagged):
--   * the trigger fires ONLY when status changes (WHEN clause) and acts ONLY on
--     the transition INTO 'Released for Fabrication' — every other update is an
--     immediate no-op, so normal submittal edits are untouched;
--   * it does NOT lock/auto-release anything — it only RAISEs or passes through,
--     so it cannot interfere with the client-side auto-lock or addSubmittalRound.

-- Per-row override audit ("released to fab despite open RFIs, because …").
alter table public.submittals add column if not exists fab_release_override_reason text;

-- The OPEN RFIs that reference any sheet in the submittal's drawing sets.
-- Resolves submittal.drawing_set_ids -> drawings (by drawing_set_id) ->
-- drawings.linked_rfi_ids (CSV of RFI *numbers*) -> rfis. Mirrors
-- fab_release_blocking_rfis but keyed on the submittal's package.
create or replace function public.submittal_blocking_rfis(p_submittal_id uuid)
returns table (id uuid, rfi_number text, title text, status text, project_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with sub as (
    select s.project_id, s.drawing_set_ids
    from public.submittals s
    where s.id = p_submittal_id
      and public.user_has_project_access(s.project_id)
  ),
  sheet_links as (
    select d.project_id,
           regexp_replace(upper(trim(x.num)), '[^A-Z0-9]', '', 'g') as norm_num
    from sub
    join public.drawings d
      on d.drawing_set_id = any(sub.drawing_set_ids)
     and coalesce(d.is_deleted, false) = false
    cross join lateral unnest(string_to_array(coalesce(d.linked_rfi_ids, ''), ',')) as x(num)
  )
  select distinct r.id, r.rfi_number, r.title, r.status, r.project_id
  from public.rfis r
  join sheet_links sl
    on sl.project_id = r.project_id
   and regexp_replace(upper(coalesce(r.rfi_number, '')), '[^A-Z0-9]', '', 'g') = sl.norm_num
  where coalesce(r.is_deleted, false) = false
    and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
    and sl.norm_num <> '';
$$;

revoke all on function public.submittal_blocking_rfis(uuid) from public, anon;
grant execute on function public.submittal_blocking_rfis(uuid) to authenticated;

-- The gate.
create or replace function public.enforce_submittal_fab_release_gate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_blocking text[];
begin
  -- Only the transition INTO 'Released for Fabrication' is gated.
  if new.status is distinct from 'Released for Fabrication'
     or old.status is not distinct from 'Released for Fabrication' then
    return new;
  end if;

  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.submittal_blocking_rfis(new.id) b;

  if array_length(v_blocking, 1) is not null
     and coalesce(btrim(new.fab_release_override_reason), '') = '' then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this submittal''s package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_submittal_fab_release_gate on public.submittals;
create trigger trg_enforce_submittal_fab_release_gate
  before update on public.submittals
  for each row
  when (new.status is distinct from old.status)
  execute function public.enforce_submittal_fab_release_gate();

notify pgrst, 'reload schema';
