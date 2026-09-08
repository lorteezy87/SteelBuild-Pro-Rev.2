-- Sheet-level Holds & Blockers.
--
-- A structured "why is this sheet blocked" record: reason required, full
-- placed/released audit trail. Distinct from drawing_sets.is_locked (a
-- whole-SET admin write-barrier) — a hold is per-SHEET and workflow-
-- meaningful, not an edit lock.
--
-- Wiring to the existing register status: drawing_revisions.release_status
-- already has an 'on_hold' value in its CHECK constraint and the register
-- grid already renders it (STATUS_FILTERS / statusTone in
-- DrawingRegisterGridPanel.tsx), but nothing in the app currently WRITES
-- it (usePublishRevision's RPC only accepts the 4 "release" values) — it
-- was a dead status. This table becomes the source of truth for that
-- status going forward: placing a hold snapshots the current revision's
-- release_status into prior_release_status and the client flips it to
-- 'on_hold'; releasing restores prior_release_status. Done client-side
-- (not a trigger) to avoid adding another coupling point to a
-- heavily-depended-on table; drawing_holds itself remains the durable
-- source of truth even if that sync step is ever skipped.
--
-- Applied live via Supabase MCP (apply_migration) 2026-09-08 as version
-- 20260908045525.

create table if not exists public.drawing_holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  drawing_id uuid not null references public.drawings(id),
  reason text not null,
  prior_release_status text,
  placed_by_id uuid,
  placed_by_name text,
  placed_at timestamptz not null default now(),
  is_active boolean not null default true,
  released_by_id uuid,
  released_by_name text,
  released_at timestamptz,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drawing_holds_reason_not_blank check (length(btrim(reason)) > 0)
);

create index if not exists idx_drawing_holds_project on public.drawing_holds (project_id);
create index if not exists idx_drawing_holds_drawing_active on public.drawing_holds (drawing_id) where is_active;

-- At most one ACTIVE hold per sheet — release the existing one before placing
-- a new one, matching the SteelBuild Sheets precedent this feature is modeled on.
create unique index if not exists ux_drawing_holds_one_active_per_drawing
  on public.drawing_holds (drawing_id) where is_active;

create or replace trigger trg_drawing_holds_updated_at
  before update on public.drawing_holds
  for each row execute function public.update_updated_at();

alter table public.drawing_holds enable row level security;

create policy drawing_holds_select on public.drawing_holds
  for select to authenticated
  using (user_has_project_access(project_id));

-- Placing/releasing a hold is a field-floor action (same floor as RFI
-- create/edit) — a field crew finding a blocked sheet, or clearing one,
-- shouldn't need a PM in the loop.
create policy drawing_holds_insert on public.drawing_holds
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy drawing_holds_update on public.drawing_holds
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

-- No delete policy: RLS default-denies. Holds are an append/audit-style
-- table (release, don't delete) — same convention as drawing_signoffs.

-- Surface hold state on the existing register view so the Doc Control
-- register (and anything else reading drawing_register_view) gets it for
-- free. security_invoker means the caller's own RLS on drawing_holds still
-- applies here.
create or replace view public.drawing_register_view with (security_invoker=true) as
 select d.id as drawing_id,
    d.project_id,
    d.sheet_number,
    d.title as sheet_title,
    d.discipline,
    d.drawing_set_name,
    d.stage,
    cur.id as current_revision_id,
    cur.revision_code as current_revision,
    cur.release_status as current_status,
    cur.issued_at as current_issued_at,
    (select count(*) from public.drawing_impacts i
       where i.drawing_revision_id = cur.id and i.status <> all (array['resolved','closed'])) as open_impact_count,
    (select count(*) from public.drawing_reviews r
       where r.drawing_revision_id = cur.id and r.decision = 'pending') as pending_review_count,
    (select count(*) from public.drawing_links l
       where l.drawing_id = d.id and l.linked_record_type = 'rfi' and l.removed_at is null) as rfi_count,
    (select count(*) from public.drawing_links l
       where l.drawing_id = d.id and l.linked_record_type = 'work_package' and l.removed_at is null) as work_package_count,
    greatest(d.updated_at, cur.updated_at) as last_activity,
    h.id as active_hold_id,
    h.reason as active_hold_reason,
    h.placed_at as active_hold_placed_at
   from public.drawings d
     left join lateral (
       select r.id, r.project_id, r.drawing_id, r.revision_code, r.revision_name,
              r.sheet_number, r.sheet_title, r.file_id, r.version_number,
              r.is_current, r.issued_at, r.received_at, r.supersedes_revision_id,
              r.viewer_width, r.viewer_height, r.created_by, r.created_at,
              r.updated_by, r.updated_at, r.archived_at, r.release_status
         from public.drawing_revisions r
        where r.drawing_id = d.id and r.is_current = true
        limit 1
     ) cur on true
     left join public.drawing_holds h on h.drawing_id = d.id and h.is_active
  where d.is_deleted = false;

notify pgrst, 'reload schema';
