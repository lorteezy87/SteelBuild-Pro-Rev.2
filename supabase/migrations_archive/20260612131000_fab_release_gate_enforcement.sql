-- Phase 0 (P0) — server-side fab-release gate ENFORCEMENT.
--
-- Today the RFI fab-gate is purely client-side (ExportFabReleaseModal disables a
-- button). This makes the SERVER the single arbiter: releasing a drawing package
-- to fab is now a recorded event (public.fab_release_log) whose creation is gated
-- by a BEFORE INSERT trigger reusing the authoritative fab_release_blocking_rfis()
-- check. A release with OPEN RFIs against its sheets is REFUSED unless an explicit
-- override_reason is supplied (and the server snapshots which RFIs were open).
--
-- This is a BRAND-NEW table, so the trigger cannot touch the submittal auto-lock /
-- manual-release flows (the killer workflow) — the exact risk that deferred a
-- trigger on the submittal/drawing release transition.
--
-- Supersedes public.fab_release_overrides (override-only, 0 rows) — fab_release_log
-- records EVERY release (override_reason IS NULL = clean release). The old table is
-- left in place (empty) for now; a later cleanup can drop it.

create table if not exists public.fab_release_log (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  released_by          uuid references auth.users(id) default auth.uid(),
  package_kind         text not null default 'fab_release'
                         check (package_kind in ('fab_release', 'turnover')),
  package_name         text,
  drawing_ids          uuid[] not null default '{}',
  drawing_count        integer not null default 0,
  -- SERVER-computed snapshot of the OPEN RFIs that referenced this package's
  -- sheets at release time (set by the trigger — the client's copy is ignored).
  blocking_rfi_numbers text[] not null default '{}',
  -- NULL = clean release (gate passed); non-NULL = released despite open RFIs.
  override_reason      text,
  released_at          timestamptz not null default now()
);

-- ── The gate: refuse a release with open blocking RFIs unless overridden ─────
create or replace function public.enforce_fab_release_gate()
returns trigger
language plpgsql
-- SECURITY INVOKER (default): the inserting user must already be a project member
-- (RLS), and fab_release_blocking_rfis is itself SECURITY DEFINER + membership-
-- gated, so this only needs EXECUTE on it (granted to authenticated).
set search_path = public
as $$
declare
  v_blocking text[];
begin
  select coalesce(array_agg(distinct b.rfi_number) filter (where b.rfi_number is not null), '{}')
    into v_blocking
  from public.fab_release_blocking_rfis(coalesce(new.drawing_ids, '{}')) b;

  -- Authoritative snapshot — never trust a client-supplied blocking list.
  new.blocking_rfi_numbers := v_blocking;

  if array_length(v_blocking, 1) is not null
     and coalesce(btrim(new.override_reason), '') = '' then
    raise exception
      'FAB_RELEASE_BLOCKED: % open RFI(s) reference sheets in this package (%). Resolve them or release with an override reason.',
      array_length(v_blocking, 1), array_to_string(v_blocking, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_fab_release_gate on public.fab_release_log;
create trigger trg_enforce_fab_release_gate
  before insert on public.fab_release_log
  for each row execute function public.enforce_fab_release_gate();

-- ── RLS: members read; PM+ record their own release; append-only ────────────
alter table public.fab_release_log enable row level security;
create index if not exists idx_fab_release_log_project on public.fab_release_log (project_id);
create index if not exists idx_fab_release_log_released_by on public.fab_release_log (released_by);

grant select, insert on table public.fab_release_log to authenticated;
revoke all on table public.fab_release_log from anon;

drop policy if exists fab_release_log_select on public.fab_release_log;
create policy fab_release_log_select on public.fab_release_log
  for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists fab_release_log_insert on public.fab_release_log;
create policy fab_release_log_insert on public.fab_release_log
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm') and released_by = auth.uid());
-- No update/delete policy → append-only audit.

notify pgrst, 'reload schema';
