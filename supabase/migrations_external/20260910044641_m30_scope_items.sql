-- M30 — Scope & Exclusions register. Reconciles the legacy `scope_items` (383 rows across 15 projects, 181 already
-- soft-deleted by hand: the Scope / Exclusion / Clarification breakdown of a project's scope letter, 54 rows still
-- pointing at the uploaded letter PDF and 165 carrying a spec / drawing reference). Scope inferred from the table,
-- its `scope_items` entry in soft_delete_project()'s cascade and the legacy audit trigger; brief not supplied.
--   1. `scope_number` SCP-### minted by the BEFORE INSERT trigger through get_next_sequence_number(project,
--      'scope_item'); legacy rows backfilled in creation order, sequences seeded past them; a typed number is 42501.
--   2. ONE derived status over the two legacy booleans. `is_completed` and `in_progress` can never both be true
--      (the guard clears the other), completing stamps `completed_at` / `completed_by`, starting stamps
--      `in_progress_at` / `in_progress_by`, and reopening clears both pairs. The client derives Open / In Progress /
--      Complete from the same two columns, so the register and the KPIs cannot disagree.
--   3. New links, both validated against the same project (23503): `document_id` → the M29 `documents` row holding
--      the scope letter (a numbered document instead of a loose storage path), and `change_order_id` → the M16
--      `change_orders` row an EXCLUSION turned into. A non-exclusion may not carry a change order (23514) — that
--      link is the whole point of tracking exclusions.
--   4. **The DELETE policy was at access level**: any project viewer could hard-delete a scope item. That policy, the
--      other blanket `project_*` policies (also access-level INSERT / UPDATE) and the `*_role_floor` policies are
--      dropped. Now read = access, insert / update = field+, delete revoked, archive pm+, hard deletes raise.

alter table public.scope_items add column if not exists scope_number text;
alter table public.scope_items add column if not exists created_by uuid;
alter table public.scope_items add column if not exists completed_by_id uuid;
alter table public.scope_items add column if not exists document_id uuid;
alter table public.scope_items add column if not exists change_order_id uuid;
alter table public.scope_items add column if not exists sort_order integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scope_items_document_id_fkey') then
    alter table public.scope_items add constraint scope_items_document_id_fkey foreign key (document_id) references public.documents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scope_items_change_order_id_fkey') then
    alter table public.scope_items add constraint scope_items_change_order_id_fkey foreign key (change_order_id) references public.change_orders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_scope_items_progress') then
    -- The two legacy booleans are a two-bit status; 1-1 is not a state.
    alter table public.scope_items add constraint chk_scope_items_progress check (not (is_completed and in_progress)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_scope_items_co_is_exclusion') then
    alter table public.scope_items add constraint chk_scope_items_co_is_exclusion check (change_order_id is null or item_type = 'Exclusion') not valid;
  end if;
end $$;

-- Any legacy row that somehow carries both flags loses the weaker one before the CHECK is relied on.
update public.scope_items set in_progress = false, in_progress_at = null, in_progress_by = null
 where is_completed and in_progress;

-- Backfill SCP-### in creation order per project (continuing past any number already present) and seed the sequences.
with base as (
  select project_id, coalesce(max(nullif(regexp_replace(coalesce(scope_number, ''), '\D', '', 'g'), '')::int), 0) as hi
  from public.scope_items group by project_id
), numbered as (
  select s.id, 'SCP-' || lpad((b.hi + row_number() over (partition by s.project_id order by s.created_at, s.id))::text, 3, '0') as num
  from public.scope_items s join base b using (project_id) where s.scope_number is null
)
update public.scope_items s set scope_number = numbered.num from numbered where numbered.id = s.id;

insert into public.number_sequences (project_id, record_type, next_value)
select project_id, 'scope_item', coalesce(max(nullif(regexp_replace(scope_number, '\D', '', 'g'), '')::int), 0) + 1
from public.scope_items group by project_id
on conflict (project_id, record_type) do update set next_value = greatest(number_sequences.next_value, excluded.next_value);

create unique index if not exists uq_scope_items_project_number on public.scope_items (project_id, scope_number);
create index if not exists idx_scope_items_project_live on public.scope_items (project_id, item_type, sort_order) where is_deleted = false;
create index if not exists idx_scope_items_change_order on public.scope_items (change_order_id) where change_order_id is not null;

-- Shared by the insert and update paths: validate the links and keep the two progress booleans consistent.
create or replace function public.scope_item_apply_progress(p_new public.scope_items, p_old public.scope_items)
returns public.scope_items language plpgsql stable set search_path to '' as $$
declare v_row public.scope_items := p_new; v_actor text := public.actor_display_name(); v_uid uuid := (select auth.uid());
begin
  if v_row.is_completed and v_row.in_progress then v_row.in_progress := false; end if;
  if v_row.is_completed and not coalesce(p_old.is_completed, false) then
    v_row.completed_at := coalesce(v_row.completed_at, now());
    v_row.completed_by := coalesce(nullif(btrim(coalesce(v_row.completed_by, '')), ''), v_actor);
    v_row.completed_by_id := coalesce(v_row.completed_by_id, v_uid);
    v_row.in_progress := false; v_row.in_progress_at := null; v_row.in_progress_by := null;
  elsif not v_row.is_completed and coalesce(p_old.is_completed, false) then
    v_row.completed_at := null; v_row.completed_by := null; v_row.completed_by_id := null;
  end if;
  if v_row.in_progress and not coalesce(p_old.in_progress, false) then
    v_row.in_progress_at := coalesce(v_row.in_progress_at, now());
    v_row.in_progress_by := coalesce(nullif(btrim(coalesce(v_row.in_progress_by, '')), ''), v_actor);
  elsif not v_row.in_progress and coalesce(p_old.in_progress, false) then
    v_row.in_progress_at := null; v_row.in_progress_by := null;
  end if;
  return v_row;
end $$;
revoke execute on function public.scope_item_apply_progress(public.scope_items, public.scope_items) from public;

create or replace function public.scope_item_check_links(p_row public.scope_items)
returns void language plpgsql stable set search_path to '' as $$
begin
  if p_row.document_id is not null and not exists (
    select 1 from public.documents d where d.id = p_row.document_id and d.project_id = p_row.project_id and d.is_deleted = false
  ) then
    raise exception 'The scope letter must be a live document of the same project' using errcode = '23503';
  end if;
  if p_row.change_order_id is not null then
    if p_row.item_type <> 'Exclusion' then
      raise exception 'Only an Exclusion carries a change order' using errcode = '23514';
    end if;
    if not exists (select 1 from public.change_orders c where c.id = p_row.change_order_id and c.project_id = p_row.project_id) then
      raise exception 'The change order belongs to another project' using errcode = '23503';
    end if;
  end if;
end $$;
revoke execute on function public.scope_item_check_links(public.scope_items) from public;

create or replace function public.prepare_scope_item_row()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.description is null or length(btrim(new.description)) = 0 then
    raise exception 'A scope item needs a description' using errcode = '23514';
  end if;
  new.description := btrim(new.description);
  if new.scope_number is null or btrim(new.scope_number) = '' then
    new.scope_number := 'SCP-' || lpad(public.get_next_sequence_number(new.project_id, 'scope_item')::text, 3, '0');
  elsif auth.role() = 'authenticated' then
    raise exception 'scope_number is minted by the database' using errcode = '42501';
  end if;
  new.item_type := coalesce(nullif(btrim(new.item_type), ''), 'Exclusion');
  new.category := coalesce(nullif(btrim(new.category), ''), 'Structural');
  if auth.role() = 'authenticated' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.added_by := coalesce(nullif(btrim(coalesce(new.added_by, '')), ''), public.actor_display_name());
  end if;
  perform public.scope_item_check_links(new);
  new := public.scope_item_apply_progress(new, null::public.scope_items);
  new.is_deleted := false; new.deleted_at := null;
  return new;
end $$;
revoke execute on function public.prepare_scope_item_row() from public;

create or replace function public.enforce_scope_item_guards()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'scope items are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.scope_number is not null and new.scope_number is distinct from old.scope_number then raise exception 'scope_number is immutable' using errcode = '42501'; end if;
  if new.description is null or length(btrim(new.description)) = 0 then
    raise exception 'A scope item needs a description' using errcode = '23514';
  end if;
  new.description := btrim(new.description);
  if new.document_id is distinct from old.document_id or new.change_order_id is distinct from old.change_order_id or new.item_type is distinct from old.item_type then
    perform public.scope_item_check_links(new);
  end if;
  new := public.scope_item_apply_progress(new, old);
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving a scope item needs pm access' using errcode = '42501';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.enforce_scope_item_guards() from public;

drop trigger if exists trg_a_scope_items_prepare on public.scope_items;
create trigger trg_a_scope_items_prepare before insert on public.scope_items for each row execute function public.prepare_scope_item_row();
drop trigger if exists trg_a_scope_items_guard on public.scope_items;
create trigger trg_a_scope_items_guard before update or delete on public.scope_items for each row execute function public.enforce_scope_item_guards();

alter table public.scope_items enable row level security;
drop policy if exists project_select on public.scope_items;
drop policy if exists project_insert on public.scope_items;
drop policy if exists project_update on public.scope_items;
drop policy if exists project_delete on public.scope_items;
drop policy if exists scope_items_ins_role_floor on public.scope_items;
drop policy if exists scope_items_upd_role_floor on public.scope_items;
drop policy if exists scope_items_del_role_floor on public.scope_items;
drop policy if exists scope_items_select on public.scope_items;
drop policy if exists scope_items_insert on public.scope_items;
drop policy if exists scope_items_update on public.scope_items;
create policy scope_items_select on public.scope_items for select to authenticated using (public.user_has_project_access(project_id));
create policy scope_items_insert on public.scope_items for insert to authenticated with check (public.user_has_project_role_at_least(project_id, 'field'));
create policy scope_items_update on public.scope_items for update to authenticated using (public.user_has_project_role_at_least(project_id, 'field')) with check (public.user_has_project_role_at_least(project_id, 'field'));
revoke delete, truncate, references, trigger on public.scope_items from authenticated, anon;

notify pgrst, 'reload schema';