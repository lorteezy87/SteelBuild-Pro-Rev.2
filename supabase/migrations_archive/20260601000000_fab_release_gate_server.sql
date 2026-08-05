-- Server-side Fab Release gate foundation (roadmap P0.2 + P1.2 audit).
--
-- (1) fab_release_blocking_rfis(drawing_ids) — the AUTHORITATIVE, RLS-safe
--     check: the OPEN RFIs that reference any of the given sheets. Mirrors the
--     client engine (src/lib/fabReleaseGate.js) exactly — drawings.linked_rfi_ids
--     is a COMMA-SEPARATED STRING of RFI *numbers*, matched to rfis.rfi_number on
--     a normalized key (UPPER, non-alphanumerics stripped). "Open" = status NOT
--     in (Answered, Closed, Void). SECURITY DEFINER + per-project membership gate.
--
-- (2) fab_release_overrides — audit trail of PM overrides (who released a package
--     despite open RFIs, and which RFIs were outstanding).
--
-- NOTE: this is the authoritative CHECK + AUDIT. A hard-blocking trigger on the
-- drawing release/lock transition is intentionally NOT added here — it must not
-- risk the submittal auto-lock / anchor-bolt release flows (the killer workflow)
-- and needs its own override-flag design. Tracked as the follow-up.

create or replace function public.fab_release_blocking_rfis(p_drawing_ids uuid[])
returns table (id uuid, rfi_number text, title text, status text, project_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with sheet_links as (
    select d.project_id,
           regexp_replace(upper(trim(x.num)), '[^A-Z0-9]', '', 'g') as norm_num
    from public.drawings d
    cross join lateral unnest(string_to_array(coalesce(d.linked_rfi_ids, ''), ',')) as x(num)
    where d.id = any(p_drawing_ids)
      and public.user_has_project_access(d.project_id)
  )
  select distinct r.id, r.rfi_number, r.title, r.status, r.project_id
  from public.rfis r
  join sheet_links s
    on s.project_id = r.project_id
   and regexp_replace(upper(coalesce(r.rfi_number, '')), '[^A-Z0-9]', '', 'g') = s.norm_num
  where coalesce(r.is_deleted, false) = false
    and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
    and s.norm_num <> '';
$$;

revoke all on function public.fab_release_blocking_rfis(uuid[]) from public, anon;
grant execute on function public.fab_release_blocking_rfis(uuid[]) to authenticated;

create table if not exists public.fab_release_overrides (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  overridden_by        uuid references auth.users(id) default auth.uid(),
  package_kind         text,
  package_name         text,
  drawing_count        integer,
  blocking_rfi_numbers text[] not null default '{}',
  reason               text,
  created_at           timestamptz not null default now()
);

alter table public.fab_release_overrides enable row level security;
create index if not exists idx_fab_release_overrides_project on public.fab_release_overrides (project_id);
create index if not exists idx_fab_release_overrides_by on public.fab_release_overrides (overridden_by);

-- Members read the audit; field-and-above record their own override (excludes
-- read-only viewers). Append-only — no update/delete policy.
create policy fab_release_overrides_select on public.fab_release_overrides
  for select to authenticated
  using (user_has_project_access(project_id));
create policy fab_release_overrides_insert on public.fab_release_overrides
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'field') and overridden_by = auth.uid());

notify pgrst, 'reload schema';
