-- Phase 1 — Backcharge / CO Defense: domain spine.
--
-- Three project-scoped tables:
--   backcharges          — the backcharge log (who/what/why/$ + notice-date capture)
--   backcharge_tm_tickets — T&M cost build-up tickets attached to a backcharge
--   backcharge_events     — APPEND-ONLY timestamped audit trail (status moves,
--                           notice sent, etc.) — the defense package's backbone
--
-- RLS: members read; PM+ write (backcharges are financial/contractual, matching
-- the change_orders write floor). Append-only on events.

create or replace function public.backcharge_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── backcharges ─────────────────────────────────────────────────────────────
create table if not exists public.backcharges (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  project_id             uuid not null references public.projects(id) on delete cascade,
  backcharge_number      text,
  title                  text not null,
  description            text,
  responsible_party      text,
  responsible_party_type text default 'subcontractor'
                           check (responsible_party_type in ('subcontractor','vendor','supplier','gc','other')),
  reason_code            text default 'rework'
                           check (reason_code in ('rework','cleanup','delay','damage','defective_material','schedule','other')),
  status                 text not null default 'draft'
                           check (status in ('draft','notice_sent','pending','disputed','approved','rejected','collected','void')),
  amount                 numeric(14,2) not null default 0,
  incident_date          date,
  notice_date            date,
  linked_co_id           uuid references public.change_orders(id) on delete set null,
  source_rfi_id          uuid references public.rfis(id) on delete set null,
  cost_code_id           uuid references public.cost_codes(id) on delete set null,
  attachments            jsonb not null default '[]'::jsonb,
  notes                  text,
  metadata               jsonb not null default '{}'::jsonb,
  created_by             uuid references auth.users(id) default auth.uid(),
  is_deleted             boolean not null default false,
  deleted_at             timestamptz
);
create index if not exists idx_backcharges_project on public.backcharges (project_id);
create index if not exists idx_backcharges_co on public.backcharges (linked_co_id);
create index if not exists idx_backcharges_rfi on public.backcharges (source_rfi_id);

drop trigger if exists trg_backcharges_updated_at on public.backcharges;
create trigger trg_backcharges_updated_at before update on public.backcharges
  for each row execute function public.backcharge_touch_updated_at();

alter table public.backcharges enable row level security;
grant select, insert, update, delete on public.backcharges to authenticated;
revoke all on public.backcharges from anon;
create policy backcharges_select on public.backcharges for select to authenticated
  using (user_has_project_access(project_id));
create policy backcharges_insert on public.backcharges for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy backcharges_update on public.backcharges for update to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy backcharges_delete on public.backcharges for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'admin'));

-- ── backcharge_tm_tickets ───────────────────────────────────────────────────
create table if not exists public.backcharge_tm_tickets (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  backcharge_id  uuid not null references public.backcharges(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  ticket_number  text,
  ticket_date    date,
  description    text,
  labor_hours    numeric(10,2) not null default 0,
  labor_rate     numeric(10,2) not null default 0,
  equipment_cost numeric(12,2) not null default 0,
  material_cost  numeric(12,2) not null default 0,
  markup_percent numeric(6,2)  not null default 0,
  amount         numeric(14,2) not null default 0,
  signed_by      text,
  attachments    jsonb not null default '[]'::jsonb,
  created_by     uuid references auth.users(id) default auth.uid(),
  is_deleted     boolean not null default false,
  deleted_at     timestamptz
);
create index if not exists idx_bc_tm_backcharge on public.backcharge_tm_tickets (backcharge_id);
create index if not exists idx_bc_tm_project on public.backcharge_tm_tickets (project_id);

drop trigger if exists trg_bc_tm_updated_at on public.backcharge_tm_tickets;
create trigger trg_bc_tm_updated_at before update on public.backcharge_tm_tickets
  for each row execute function public.backcharge_touch_updated_at();

alter table public.backcharge_tm_tickets enable row level security;
grant select, insert, update, delete on public.backcharge_tm_tickets to authenticated;
revoke all on public.backcharge_tm_tickets from anon;
create policy bc_tm_select on public.backcharge_tm_tickets for select to authenticated
  using (user_has_project_access(project_id));
create policy bc_tm_insert on public.backcharge_tm_tickets for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy bc_tm_update on public.backcharge_tm_tickets for update to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
create policy bc_tm_delete on public.backcharge_tm_tickets for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'admin'));

-- ── backcharge_events (append-only audit trail) ─────────────────────────────
create table if not exists public.backcharge_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  backcharge_id uuid not null references public.backcharges(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  event_type    text not null,           -- created | status_changed | notice_sent | tm_added | note | amount_changed
  from_status   text,
  to_status     text,
  detail        text,
  actor         uuid references auth.users(id) default auth.uid()
);
create index if not exists idx_bc_events_backcharge on public.backcharge_events (backcharge_id, created_at);
create index if not exists idx_bc_events_project on public.backcharge_events (project_id);

alter table public.backcharge_events enable row level security;
grant select, insert on public.backcharge_events to authenticated;
revoke all on public.backcharge_events from anon;
create policy bc_events_select on public.backcharge_events for select to authenticated
  using (user_has_project_access(project_id));
create policy bc_events_insert on public.backcharge_events for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm') and actor = auth.uid());
-- No update/delete policy → append-only.

notify pgrst, 'reload schema';
