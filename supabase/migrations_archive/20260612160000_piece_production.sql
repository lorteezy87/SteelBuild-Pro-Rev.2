-- Phase 4, slice 1: per-piece fabrication/production status imported from a
-- Tekla EPM / FabSuite production-control CSV (file-based — no live API).
--
-- A distinct concern from model_elements (the detailing-model snapshot): this is
-- the SHOP's reported production state, keyed by piece mark, and a project may
-- have one without the other. The 3D viewer can later JOIN the two by
-- (project_id, piece_mark) to paint the model by real fab status.
--
-- One current row per piece per project (re-import UPSERTs on the partial-unique
-- key). stage_data jsonb keeps the raw per-station values from whatever the
-- customer's EPM export emits, so we don't hard-code a rigid station schema.

create table if not exists public.piece_production (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  piece_mark       text not null,
  assembly_mark    text,
  status           text,                       -- canonical stage (Not Started/Cut/Fit/Weld/Clean/Paint/Shipped)
  percent_complete integer check (percent_complete between 0 and 100),
  quantity         numeric,
  weight           numeric,
  sequence_number  text,
  erection_area    text,
  ship_date        date,                        -- the operationally critical date ("ready to ship/erect")
  stage_data       jsonb,                       -- raw per-station values from the export (flexible)
  source           text not null default 'tekla_epm',
  external_ref     text,                        -- EPM lot/job/row reference for traceability
  notes            text,
  imported_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_deleted       boolean not null default false
);

create unique index if not exists uq_piece_production_project_mark
  on public.piece_production (project_id, piece_mark)
  where is_deleted = false;

create index if not exists idx_piece_production_project
  on public.piece_production (project_id);

comment on table public.piece_production is
  'Per-piece fabrication/production status imported from a Tekla EPM / FabSuite production-control CSV (Phase 4). Keyed by (project_id, piece_mark).';

-- updated_at maintenance
create or replace function public.piece_production_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_piece_production_updated_at on public.piece_production;
create trigger trg_piece_production_updated_at
  before update on public.piece_production
  for each row execute function public.piece_production_touch_updated_at();

-- ── RLS: members read; field+ write (production is shop/field-reported); pm+ delete ──
alter table public.piece_production enable row level security;

drop policy if exists piece_production_select on public.piece_production;
create policy piece_production_select on public.piece_production
  for select using (public.user_has_project_access(project_id));

drop policy if exists piece_production_insert on public.piece_production;
create policy piece_production_insert on public.piece_production
  for insert with check (public.user_has_project_role_at_least(project_id, 'field'));

drop policy if exists piece_production_update on public.piece_production;
create policy piece_production_update on public.piece_production
  for update using (public.user_has_project_role_at_least(project_id, 'field'))
  with check (public.user_has_project_role_at_least(project_id, 'field'));

drop policy if exists piece_production_delete on public.piece_production;
create policy piece_production_delete on public.piece_production
  for delete using (public.user_has_project_role_at_least(project_id, 'pm'));

notify pgrst, 'reload schema';
