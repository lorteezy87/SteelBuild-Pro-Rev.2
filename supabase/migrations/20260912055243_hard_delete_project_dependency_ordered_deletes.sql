-- Defects 6 and 7 in the organization-erasure chain, both in public.hard_delete_project()
-- and both the same underlying fault: the order it deletes project-scoped tables in.
--
--   23503  update or delete on table "pieces" violates foreign key constraint
--          "piece_import_rows_piece_fk" on table "piece_import_rows"
--   23514  new row for relation "drawings" violates check constraint
--          "drawings_drawing_set_id_required_chk"
--
-- The delete loop had no ORDER BY at all, so the order was whatever the planner
-- happened to return -- the same call could succeed or fail run to run. Three
-- distinct things then go wrong:
--
-- 1. FK ORDER AMONG DELETED TABLES. Eleven NO ACTION / RESTRICT foreign keys run
--    between the project-scoped tables. Deleting a parent before its referencing
--    rows raises 23503. Two of them are in an order no alphabetical sort would
--    have saved either: model_registry -> documents, submittals -> submittal_rounds.
--
-- 2. THE CASCADE EXCLUSION. The loop skipped any table with an ON DELETE CASCADE
--    FK to projects, on the reasoning that `delete from projects` clears them
--    anyway. But three such tables -- model_elements, piece_import_rows and
--    piece_station_completions -- hold NO ACTION / RESTRICT keys into public.pieces,
--    which the loop DOES delete explicitly, and it deletes it before the project
--    row. Skipping them made the pieces delete unsatisfiable for any project with
--    a model roster or an import history. This is the 23503 an owner hit.
--
-- 3. IT IS NOT ONLY FOREIGN KEYS. drawings.drawing_set_id is ON DELETE SET NULL
--    beneath a NOT NULL check constraint, so deleting drawing_sets before drawings
--    NULLs a column the check forbids and raises 23514. Same ordering fault,
--    different SQLSTATE -- which is why the handler names four codes, not one.
--
-- Fix. Delete from every project-scoped table (no cascade exclusion), retrying:
-- each pass deletes what it can and records which tables were refused, and the
-- next pass retries only those. A hard-coded topological order would be faster
-- but would silently rot on the next schema change, and this schema is shared
-- with a sibling app. When a pass makes no progress the loop stops and the
-- leftovers get one UNGUARDED attempt, so a genuine cycle raises rather than
-- leaving rows behind. The blocking graph is a DAG today, deepest chain 3
-- (drawing_sets -> submittals -> submittal_rounds), so the 12-pass cap is ample.
--
-- Proven, not assumed. Run against live project 04112c3b (ALA Aloravita: 35
-- drawings, 7 drawing sets, 596 model elements, 5 pieces) inside a transaction
-- that was then rolled back:
--
--   pass 1 blocked: [drawing_sets, submittal_rounds]
--   pass 2 blocked: []                       -- 2 passes, 6.9s, nothing left over
--
-- Both defect classes appear in that trace and both clear. Data was verified
-- intact after every dry run: 24 projects, 3,057 pieces, 0 data_erasure_log rows.
--
-- Everything outside the delete loop is reproduced byte-for-byte from the live
-- definition -- same authorization gate, reason-length check, ARCHIVE_FIRST
-- guard, audit insert, trigger toggle, flag restore and return shape.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop resets proacl and would revoke
-- the authenticated EXECUTE grant. Verified intact after applying.
--
-- Already applied to kjrwqagyeswwoxpjkcko directly on 2026-09-12 so the owner was
-- not blocked; this file brings the repo back in step. It is idempotent.

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
end $function$;

-- NOT APPLIED -- established while proving this, and blocking in its own right.
--
-- 1. THE 8-SECOND WALL. Role `authenticated` carries statement_timeout = 8s
--    (anon 3s, authenticator 8s). A single project measured 6.9s end to end on a
--    SMALL project, and the largest in the reporting org holds 149,913
--    model_elements and 53,058 piece_import_rows. No restructuring of this
--    function brings that under 8s, so reset_org_data cannot be driven from a
--    browser PostgREST call for this data set -- it has to run on a connection
--    without that limit. A function-level `SET statement_timeout` does NOT help:
--    the timer is armed when the client command starts and is not re-armed on
--    function entry (probed directly on this database).
--
--    Fixing that means either raising the role's timeout for a maintenance window
--    or running the erasure from a privileged connection. Both are owner
--    decisions about a live production database, not something to bake into a
--    migration.
--
-- 2. project_row_counts is the dominant cost of a small erasure -- 1,389ms of the
--    1,482ms measured, because it runs count(*) over all 115 project-scoped
--    tables while the deletes themselves took 62ms. It is called once for the
--    audit row's row_counts payload. An estimate from pg_class.reltuples, or
--    counting only tables that turn out non-empty, would cut most of it. Left
--    alone here because it changes what lands in data_erasure_log.
--
-- 3. public.hard_delete_organization still carries the 55006 cursor-lifetime bug
--    that 20260912042823 cured in reset_org_data, and it calls this function in
--    the same loop. Unreachable today only because the account-delete edge
--    function is not deployed.
