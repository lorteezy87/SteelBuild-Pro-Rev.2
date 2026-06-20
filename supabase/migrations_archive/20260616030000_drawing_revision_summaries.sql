-- Revision Summary persistence: a point-in-time digest, one row per set per
-- revision upload. Captures what was downstream AT THE TIME of the revision
-- (the audit value — sheets move further downstream later). Applied live
-- 2026-06-16 via Supabase MCP; captured here so repo and live stay in sync.
create table if not exists public.drawing_revision_summaries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  drawing_set_id  uuid references public.drawing_sets(id) on delete cascade,
  set_name        text,
  sheets_changed  int  not null default 0,
  high_risk_count int  not null default 0,
  likely_rfi      boolean not null default false,
  impact_level    text not null default 'low' check (impact_level in ('none','low','medium','high')),
  summary         jsonb not null default '{}'::jsonb,
  generated_at    timestamptz not null default now(),
  generated_by    uuid references auth.users(id),
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists drawing_revision_summaries_set_idx
  on public.drawing_revision_summaries (project_id, drawing_set_id, generated_at desc);

alter table public.drawing_revision_summaries enable row level security;

-- SELECT: any project member.
drop policy if exists drawing_revision_summaries_select on public.drawing_revision_summaries;
create policy drawing_revision_summaries_select on public.drawing_revision_summaries
  for select to authenticated
  using (public.user_has_project_access(project_id));

-- INSERT: field+ (whoever can upload a revision), scoped to their project.
drop policy if exists drawing_revision_summaries_insert on public.drawing_revision_summaries;
create policy drawing_revision_summaries_insert on public.drawing_revision_summaries
  for insert to authenticated
  with check (public.user_has_project_role_at_least(project_id, 'field'));

-- DELETE: pm+ (cleanup). No UPDATE — summaries are immutable snapshots.
drop policy if exists drawing_revision_summaries_delete on public.drawing_revision_summaries;
create policy drawing_revision_summaries_delete on public.drawing_revision_summaries
  for delete to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'));

notify pgrst, 'reload schema';
