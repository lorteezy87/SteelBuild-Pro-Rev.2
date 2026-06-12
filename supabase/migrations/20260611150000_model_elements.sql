-- ============================================================================
-- 20260611150000_model_elements.sql — member-level mapping:
-- IFC GUID <-> piece mark <-> app entities
-- (applied live via Supabase MCP on 2026-06-11, captured here for repo parity)
-- ============================================================================
-- Phase 0 of the Detailing Control Center 3D/BIM integration (APS viewer).
-- Every planned capability (status color-mapping, model-to-sheet linking,
-- sequence playback, spatial RFI pins) is a rendering of this one join:
--   model element (IFC GlobalId) <-> piece_mark <-> drawing / submittal /
--   work package / RFI.
-- Rows are ingested from Tekla/SDS2 CSV reports (staged + human-reviewed per
-- CLAUDE.md §30) now, IFC property extraction later; element_guid stays null
-- until a translated model is linked (model_registry is the model anchor).

create table if not exists public.model_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid references public.model_registry(id) on delete set null,
  element_guid text,
  piece_mark text not null,
  assembly_mark text,
  profile text,
  material_grade text,
  quantity numeric not null default 1,
  weight_kg numeric,
  sequence_number text,
  erection_area text,
  drawing_no text,
  drawing_id uuid references public.drawings(id) on delete set null,
  drawing_set_id uuid references public.drawing_sets(id) on delete set null,
  work_package_id uuid references public.work_packages(id) on delete set null,
  source text not null default 'csv' check (source in ('csv','ifc','manual')),
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per element GUID per model (guid is null for CSV rows until a model links).
create unique index if not exists model_elements_model_guid_uq
  on public.model_elements (model_id, element_guid)
  where element_guid is not null and model_id is not null;

-- Natural-key lookups + FK covering indexes (convention: 20260531002000).
create index if not exists model_elements_project_piece_idx on public.model_elements (project_id, piece_mark);
create index if not exists model_elements_project_seq_idx   on public.model_elements (project_id, sequence_number);
create index if not exists model_elements_model_id_idx      on public.model_elements (model_id);
create index if not exists model_elements_drawing_id_idx    on public.model_elements (drawing_id);
create index if not exists model_elements_set_id_idx        on public.model_elements (drawing_set_id);
create index if not exists model_elements_wp_id_idx         on public.model_elements (work_package_id);

alter table public.model_elements enable row level security;

-- RLS: reads for every project member; writes >= field (operational-table
-- standard, mirrors 20260610010000_rls_role_floors_on_writes).
create policy project_select on public.model_elements
  for select to authenticated using (user_has_project_access(project_id));
create policy project_insert on public.model_elements
  for insert to authenticated with check (user_has_project_role_at_least(project_id, 'field'));
create policy project_update on public.model_elements
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));
create policy project_delete on public.model_elements
  for delete to authenticated using (user_has_project_role_at_least(project_id, 'field'));

-- updated_at maintenance (pattern: 064_risks.sql).
create or replace function public.set_updated_at_model_elements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at_model_elements() from public, anon, authenticated;

drop trigger if exists set_updated_at_model_elements on public.model_elements;
create trigger set_updated_at_model_elements
  before update on public.model_elements
  for each row execute function public.set_updated_at_model_elements();

notify pgrst, 'reload schema';
