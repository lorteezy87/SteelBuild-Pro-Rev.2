-- Phase 2 — Pay App (G702/G703): the per-period pay-application ledger.
--
--   pay_applications      — the G702 header per billing period (app #, period,
--                           status, retainage %, and the certified G702 figures).
--   pay_application_lines — the G703 continuation-sheet snapshot: one row per SOV
--                           line per application (scheduled value, work completed
--                           previous/this-period, stored materials, % complete,
--                           retainage). Denormalized so a certified app is immutable
--                           even if the underlying SOV changes later.
--
-- Built OVER the existing sov_items (the schedule of values); lines reference
-- sov_item_id but carry their own snapshot. The shared SOV/progress spine also
-- feeds backcharge quantification + field % complete (per the roadmap).
--
-- RLS: members read; PM+ write (financial, matching change_orders); admin delete.

create or replace function public.payapp_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.pay_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  application_number integer not null default 1,
  period_from date,
  period_to date,
  status text not null default 'draft' check (status in ('draft','submitted','approved','paid','void')),
  retainage_percent numeric(6,3) not null default 0,
  -- Certified G702 figures (snapshot at finalization; computed from lines + contract):
  original_contract_sum numeric(14,2) not null default 0,
  net_change_orders numeric(14,2) not null default 0,
  total_completed_stored numeric(14,2) not null default 0,
  total_retainage numeric(14,2) not null default 0,
  less_previous_certificates numeric(14,2) not null default 0,
  current_payment_due numeric(14,2) not null default 0,
  submitted_date date,
  certified_date date,
  paid_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  is_deleted boolean not null default false,
  deleted_at timestamptz
);
create index if not exists idx_pay_apps_project on public.pay_applications (project_id);
create unique index if not exists uq_pay_app_number on public.pay_applications (project_id, application_number) where is_deleted = false;

drop trigger if exists trg_pay_apps_updated_at on public.pay_applications;
create trigger trg_pay_apps_updated_at before update on public.pay_applications
  for each row execute function public.payapp_touch_updated_at();

alter table public.pay_applications enable row level security;
grant select, insert, update, delete on public.pay_applications to authenticated;
revoke all on public.pay_applications from anon;
create policy pay_apps_select on public.pay_applications for select to authenticated
  using (user_has_project_access(project_id));
create policy pay_apps_insert on public.pay_applications for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy pay_apps_update on public.pay_applications for update to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy pay_apps_delete on public.pay_applications for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'admin'));

create table if not exists public.pay_application_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pay_application_id uuid not null references public.pay_applications(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  sov_item_id uuid references public.sov_items(id) on delete set null,
  line_item_number text,
  description text,
  scheduled_value numeric(14,2) not null default 0,
  work_completed_previous numeric(14,2) not null default 0,
  work_completed_this_period numeric(14,2) not null default 0,
  materials_stored numeric(14,2) not null default 0,
  percent_complete numeric(6,3) not null default 0,
  retainage numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_payapp_lines_app on public.pay_application_lines (pay_application_id);
create index if not exists idx_payapp_lines_project on public.pay_application_lines (project_id);
create index if not exists idx_payapp_lines_sov on public.pay_application_lines (sov_item_id);

alter table public.pay_application_lines enable row level security;
grant select, insert, update, delete on public.pay_application_lines to authenticated;
revoke all on public.pay_application_lines from anon;
create policy payapp_lines_select on public.pay_application_lines for select to authenticated
  using (user_has_project_access(project_id));
create policy payapp_lines_insert on public.pay_application_lines for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy payapp_lines_update on public.pay_application_lines for update to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy payapp_lines_delete on public.pay_application_lines for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'));

notify pgrst, 'reload schema';
