-- Blueline / SteelBuildSheets browser backend on Supabase.
-- Additive only: does not modify existing SteelBuild Pro application tables.

create schema if not exists blueline_private;
revoke all on schema blueline_private from public, anon;
grant usage on schema blueline_private to authenticated;

create table if not exists public.blueline_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, path),
  constraint blueline_documents_path_check check (
    length(path) between 3 and 1000
    and array_length(string_to_array(path, '/'), 1) between 2 and 16
    and path ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$'
    and path !~ '(^|/)(\\.|\\.\\.|__proto__|constructor|prototype)(/|$)'
  )
);

create table if not exists public.blueline_revisions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  value bigint not null default 1,
  primary key (owner_id, path)
);

create table if not exists public.blueline_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  path text not null,
  before jsonb,
  after jsonb,
  action text not null check (action in ('insert','update','delete','recover'))
);

create index if not exists blueline_audit_owner_id_id_idx
  on public.blueline_audit (owner_id, id desc);
create index if not exists blueline_audit_owner_path_id_idx
  on public.blueline_audit (owner_id, path, id desc);

alter table public.blueline_documents enable row level security;
alter table public.blueline_revisions enable row level security;
alter table public.blueline_audit enable row level security;

drop policy if exists "blueline_documents_select_own" on public.blueline_documents;
create policy "blueline_documents_select_own"
on public.blueline_documents for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "blueline_revisions_select_own" on public.blueline_revisions;
create policy "blueline_revisions_select_own"
on public.blueline_revisions for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "blueline_audit_select_own" on public.blueline_audit;
create policy "blueline_audit_select_own"
on public.blueline_audit for select
to authenticated
using ((select auth.uid()) = owner_id);

revoke all on public.blueline_documents, public.blueline_revisions, public.blueline_audit from anon;
revoke insert, update, delete on public.blueline_documents, public.blueline_revisions, public.blueline_audit from authenticated;
grant select on public.blueline_documents, public.blueline_revisions, public.blueline_audit to authenticated;

create or replace function blueline_private.document_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.path <> old.path then
    raise exception 'Blueline document identity cannot change';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists blueline_documents_before_update on public.blueline_documents;
create trigger blueline_documents_before_update
before update on public.blueline_documents
for each row execute function blueline_private.document_before_update();

create or replace function blueline_private.document_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_path text;
  v_parent text;
  v_before jsonb;
  v_after jsonb;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_id;
    v_path := old.path;
    v_before := old.data;
    v_after := null;
    v_action := 'delete';
  elsif tg_op = 'INSERT' then
    v_owner := new.owner_id;
    v_path := new.path;
    v_before := null;
    v_after := new.data;
    v_action := 'insert';
  else
    v_owner := new.owner_id;
    v_path := new.path;
    v_before := old.data;
    v_after := new.data;
    v_action := 'update';
  end if;

  v_parent := regexp_replace(v_path, '/[^/]+$', '');

  insert into public.blueline_audit(owner_id, path, before, after, action)
  values (v_owner, v_path, v_before, v_after, v_action);

  insert into public.blueline_revisions(owner_id, path, value)
  values (v_owner, v_parent, 1)
  on conflict (owner_id, path)
  do update set value = public.blueline_revisions.value + 1;

  return coalesce(new, old);
end;
$$;

drop trigger if exists blueline_documents_after_change on public.blueline_documents;
create trigger blueline_documents_after_change
after insert or update or delete on public.blueline_documents
for each row execute function blueline_private.document_after_change();

create or replace function blueline_private.put_doc(
  p_path text,
  p_data jsonb,
  p_merge boolean,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current jsonb;
  v_version bigint;
  v_new_version bigint;
begin
  if v_uid is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'INVALID_DOCUMENT' using errcode = '22023';
  end if;

  select d.data, d.version
    into v_current, v_version
  from public.blueline_documents d
  where d.owner_id = v_uid and d.path = p_path
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_version then
      raise exception 'STALE_WRITE' using errcode = '40001';
    end if;
    update public.blueline_documents
      set data = case when p_merge then v_current || p_data else p_data end
    where owner_id = v_uid and path = p_path
    returning version into v_new_version;
    return v_new_version;
  end if;

  if p_merge then
    raise exception 'RECORD_GONE' using errcode = 'P0002';
  end if;
  if p_expected_version is not null then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;

  insert into public.blueline_documents(owner_id, path, data)
  values (v_uid, p_path, p_data)
  returning version into v_new_version;
  return v_new_version;
end;
$$;

create or replace function blueline_private.delete_tree(
  p_path text,
  p_expected_version bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_version bigint;
  v_deleted integer;
begin
  if v_uid is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  select d.version into v_version
  from public.blueline_documents d
  where d.owner_id = v_uid and d.path = p_path
  for update;

  if not found then
    if p_expected_version is null then return 0; end if;
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;

  if p_expected_version is null or p_expected_version <> v_version then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;

  delete from public.blueline_documents d
  where d.owner_id = v_uid
    and (d.path = p_path or d.path like p_path || '/%');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function blueline_private.recover_tree(p_path text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_restored integer := 0;
begin
  if v_uid is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  for r in
    select x.path, x.before
    from (
      select distinct on (a.path) a.path, a.before, a.id
      from public.blueline_audit a
      where a.owner_id = v_uid
        and a.action = 'delete'
        and (a.path = p_path or a.path like p_path || '/%')
        and a.before is not null
      order by a.path, a.id desc
    ) x
    order by length(x.path), x.path
  loop
    if not exists (
      select 1 from public.blueline_documents d
      where d.owner_id = v_uid and d.path = r.path
    ) then
      insert into public.blueline_documents(owner_id, path, data)
      values (v_uid, r.path, r.before);
      v_restored := v_restored + 1;
    end if;
  end loop;

  return v_restored;
end;
$$;

grant execute on function blueline_private.put_doc(text,jsonb,boolean,bigint) to authenticated;
grant execute on function blueline_private.delete_tree(text,bigint) to authenticated;
grant execute on function blueline_private.recover_tree(text) to authenticated;

create or replace function public.blueline_put_doc(
  p_path text,
  p_data jsonb,
  p_merge boolean default false,
  p_expected_version bigint default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select blueline_private.put_doc(p_path, p_data, p_merge, p_expected_version)
$$;

create or replace function public.blueline_delete_tree(
  p_path text,
  p_expected_version bigint
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select blueline_private.delete_tree(p_path, p_expected_version)
$$;

create or replace function public.blueline_recover_tree(p_path text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select blueline_private.recover_tree(p_path)
$$;

create or replace function public.blueline_collection(p_path text)
returns table(path text, data jsonb, version bigint)
language sql
security invoker
set search_path = ''
as $$
  select d.path, d.data, d.version
  from public.blueline_documents d
  where d.owner_id = (select auth.uid())
    and d.path like p_path || '/%'
    and position('/' in substring(d.path from length(p_path) + 2)) = 0
  order by d.created_at, d.path
$$;

revoke all on function public.blueline_put_doc(text,jsonb,boolean,bigint) from public, anon;
revoke all on function public.blueline_delete_tree(text,bigint) from public, anon;
revoke all on function public.blueline_recover_tree(text) from public, anon;
revoke all on function public.blueline_collection(text) from public, anon;
grant execute on function public.blueline_put_doc(text,jsonb,boolean,bigint) to authenticated;
grant execute on function public.blueline_delete_tree(text,bigint) to authenticated;
grant execute on function public.blueline_recover_tree(text) to authenticated;
grant execute on function public.blueline_collection(text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('blueline-files', 'blueline-files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "blueline_storage_select_own" on storage.objects;
create policy "blueline_storage_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'blueline-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "blueline_storage_insert_own" on storage.objects;
create policy "blueline_storage_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'blueline-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "blueline_storage_update_own" on storage.objects;
create policy "blueline_storage_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'blueline-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'blueline-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "blueline_storage_delete_own" on storage.objects;
create policy "blueline_storage_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'blueline-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
