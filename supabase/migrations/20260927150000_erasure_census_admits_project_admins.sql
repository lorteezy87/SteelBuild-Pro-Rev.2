-- Let project erasure read its own row-count census again.
--
-- 20260914010000 (7) closed a cross-tenant leak in project_row_counts by
-- requiring user_has_project_access for any end-user JWT. Its note that the
-- internal callers are SECURITY DEFINER did not help them: auth.uid() still
-- reads the caller's JWT inside a definer function, so the check applies to
-- them too. And user_has_project_access is false for every archived project,
-- while hard_delete_project runs only on archived ones (ARCHIVE_FIRST) and
-- calls project_row_counts first. So since that migration, every end-user
-- call of hard_delete_project fails with "Not authorized to read this
-- project", and with it hard_delete_organization for any workspace that has
-- a project, which is what the account-delete Edge Function uses to erase a
-- workspace and to erase a deleted account's sole-member workspaces
-- (reproduced on the drift-replay database with main's migrations).
--
-- The check now also admits the authority hard_delete_project itself
-- requires: user_has_project_role_at_least(project, 'admin'), together with
-- current workspace membership. The role helper alone accepts stale
-- user_projects rows after a member is removed, so it cannot establish the
-- organization boundary. This covers owners, workspace admins and current
-- project admins, archived or not. The body is otherwise unchanged, and
-- CREATE OR REPLACE keeps the
-- existing EXECUTE grants.
create or replace function public.project_row_counts(p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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
end $function$;
