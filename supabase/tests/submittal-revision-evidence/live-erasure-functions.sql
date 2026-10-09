-- Read-only production function definitions captured 2026-10-09; no user records.
CREATE OR REPLACE FUNCTION public.erasure_toggle_user_triggers(p_tables text[], p_disable boolean, p_list text[] DEFAULT '{}'::text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec record; v_out text[] := '{}'; x text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'erasure_toggle_user_triggers is internal to the erasure RPCs' using errcode = '42501';
  end if;
  -- ALTER TABLE refuses while deferred trigger events are pending in this transaction: flush them first.
  set constraints all immediate;
  if p_disable then
    for rec in
      select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and c.relname = any(p_tables) and not t.tgisinternal and t.tgenabled = 'O'
       order by c.relname, t.tgname
    loop
      execute format('alter table public.%I disable trigger %I', rec.relname, rec.tgname);
      v_out := v_out || (rec.relname || '|' || rec.tgname);
    end loop;
    return v_out;
  end if;
  foreach x in array p_list loop
    execute format('alter table public.%I enable trigger %I', split_part(x, '|', 1), split_part(x, '|', 2));
  end loop;
  return p_list;
end $function$
;
CREATE OR REPLACE FUNCTION public.hard_delete_project(p_project_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project record; v_counts jsonb; v_table text; v_prev text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
  v_uid uuid := (select auth.uid()); v_email text := (select auth.jwt() ->> 'email');
  v_tables text[]; v_disabled text[];
  v_pending text[]; v_blocked text[] := '{}'::text[]; v_pass integer;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'admin') then
    raise exception 'Only a project admin can erase project %', p_project_id using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 12 then raise exception 'A written reason (12+ characters) is required to erase a project' using errcode = '23514'; end if;
  select id, org_id, name, project_number, coalesce(is_deleted, false) as is_deleted into v_project from public.projects where id = p_project_id;
  if v_project.id is null then raise exception 'Project % not found', p_project_id using errcode = 'P0002'; end if;
  if not v_project.is_deleted then raise exception 'ARCHIVE_FIRST: archive the project before erasing it' using errcode = 'P0001'; end if;

  v_counts := public.project_row_counts(p_project_id);
  perform set_config('steelbuild.erasure_rpc', 'on', true);
  insert into public.data_erasure_log (kind, org_id, org_name, project_id, project_name, project_number, requested_by, requested_by_email, reason, row_counts, storage_prefix)
    values ('project', v_project.org_id, (select name from public.organizations where id = v_project.org_id), p_project_id, v_project.name, v_project.project_number, v_uid, v_email, btrim(p_reason), v_counts,
            v_project.org_id::text || '/uploads/*/' || p_project_id::text);

  -- Module guards refuse DELETE for everyone; this audited RPC is the one path that may pass them.
  v_tables := array(select jsonb_object_keys(v_counts)) || array['projects'];
  v_disabled := public.erasure_toggle_user_triggers(v_tables, true);

  -- Clear every project-scoped table before the project row itself. Three things
  -- this has to survive, each of which broke a live erasure:
  --
  -- 1. ORDER. Eleven NO ACTION / RESTRICT foreign keys run between these tables
  --    (model_registry -> documents, submittals -> submittal_rounds, pieces ->
  --    work_packages, model_elements -> pieces, ...). The old loop had no ORDER BY
  --    at all, so the order was whatever the planner returned, and any order that
  --    reached a parent before its referencing rows aborted with 23503.
  -- 2. THE CASCADE EXCLUSION. Tables that cascade from projects used to be skipped
  --    here on the grounds that "delete from projects" would clear them. But three
  --    -- model_elements, piece_import_rows, piece_station_completions -- hold
  --    NO ACTION / RESTRICT keys into public.pieces, which IS deleted here, so
  --    skipping them made the pieces delete unsatisfiable. They are included now;
  --    deleting explicitly what would otherwise cascade is harmless.
  -- 3. IT IS NOT ONLY 23503. drawings.drawing_set_id is ON DELETE SET NULL under a
  --    NOT NULL check constraint (drawings_drawing_set_id_required_chk), so
  --    deleting drawing_sets before drawings raises 23514, not a FK error. Same
  --    ordering problem, different SQLSTATE -- hence all four codes below.
  --
  -- Rather than hard-code a topological order that the next schema change breaks,
  -- retry: each pass deletes what it can and records which tables were refused,
  -- and the next pass retries only those. Verified against a live project: pass 1
  -- blocked on [drawing_sets, submittal_rounds], pass 2 cleared both. When a pass
  -- makes no progress the loop stops and the leftovers get one UNGUARDED attempt,
  -- so a genuine cycle raises instead of silently leaving rows behind.
  v_pending := array(
    select c.table_name::text from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'project_id'
       and c.table_name not in ('projects', 'data_erasure_log')
       and c.table_name in (select tablename from pg_tables where schemaname = 'public')
     order by c.table_name);

  for v_pass in 1..12 loop
    v_blocked := '{}'::text[];
    foreach v_table in array v_pending loop
      begin
        execute format('delete from public.%I where project_id = $1', v_table) using p_project_id;
      exception
        when foreign_key_violation or restrict_violation or check_violation or not_null_violation then
          v_blocked := v_blocked || v_table;
      end;
    end loop;
    exit when coalesce(array_length(v_blocked, 1), 0) = 0;
    exit when v_blocked = v_pending;
    v_pending := v_blocked;
  end loop;

  foreach v_table in array coalesce(v_blocked, '{}'::text[]) loop
    execute format('delete from public.%I where project_id = $1', v_table) using p_project_id;
  end loop;

  delete from public.projects where id = p_project_id;

  perform public.erasure_toggle_user_triggers(v_tables, false, v_disabled);
  perform set_config('steelbuild.erasure_rpc', v_prev, true);
  return jsonb_build_object('project_id', p_project_id, 'row_counts', v_counts);
end $function$
;
CREATE OR REPLACE FUNCTION public.project_row_counts(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table text; v_n bigint; v_out jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is not null
     and not public.user_has_project_access(p_project_id)
     and not (
       public.user_has_project_role_at_least(p_project_id, 'admin')
       and exists (
         select 1 from public.projects p
         join public.organization_members m on m.org_id = p.org_id
         where p.id = p_project_id and m.user_id = (select auth.uid())
       )
     ) then
    raise exception 'Not authorized to read this project' using errcode = '42501';
  end if;
  for v_table in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'project_id' and c.table_name not in ('projects', 'data_erasure_log')
       and c.table_name in (select tablename from pg_tables where schemaname = 'public')
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where project_id = $1', v_table) into v_n using p_project_id;
    if v_n > 0 then v_out := v_out || jsonb_build_object(v_table, v_n); end if;
  end loop;
  return v_out;
end $function$
;
REVOKE ALL ON FUNCTION public.erasure_toggle_user_triggers(text[],boolean,text[]) FROM PUBLIC,anon,authenticated,service_role;
