-- Per-record hard delete — one audited, allowlisted path through every module's delete guard.
--
-- WHY. Every module guard raises 42501 on DELETE and DELETE is revoked from authenticated on essentially every
-- table, so until now the only hard deletes were the M22 erasure RPCs: a whole project (archive first, 12-char
-- reason), a whole organization, or the caller's own account. There was no way for an owner to permanently remove
-- a single RFI, submittal, drawing, piece, change order… — only to archive it. The owner asked for exactly that
-- ("full, unhindered access to delete any data") with the audit row kept.
--
-- WHAT "UNHINDERED" MEANS HERE: no archive-first precondition, no mandatory written reason, no multi-step gate, and
-- no dead end on a dependency — rows that cannot exist without the record go with it (a sheet's holds, a lot's
-- station completions), rows that can are detached (a package's lots become unassigned, a set's current submittal
-- link is cleared), exactly what ON DELETE CASCADE / SET NULL would have done had the schema declared them.
-- WHAT IT DOES NOT MEAN: no authorization and no trail. Deletion is project-admin+ PER ROW (the project is resolved
-- from the row, never trusted from the caller), only from an explicit allowlist of business registers, and every
-- deleted record leaves a data_erasure_log entry (kind 'record') carrying the counts of everything that went with it.
--
-- HOW THE GUARDS ARE PASSED. Every delete guard in this schema is a BEFORE trigger; every bookkeeping trigger
-- (drawing-set sheet counts, cost-code expense actuals, pay-app totals, schedule roll-ups, the legacy audit log) is
-- an AFTER trigger. So the RPC disables only the BEFORE triggers on the record's FK family for the duration of the
-- call and leaves the AFTER triggers running — the derived numbers stay right and the legacy audit trail still gets
-- its DELETE rows. Should an AFTER trigger nonetheless refuse (an unknown module), the call retries once with every
-- user trigger on the family off, the M22 way. DDL is transactional: if anything raises, the disable rolls back with
-- everything else, so no trigger is ever left off.
--
-- REUSES THE M22 MACHINERY (20260909093448): the transaction-local steelbuild.erasure_rpc flag and the append-only
-- data_erasure_log. Storage objects are never deleted (guardrail #15).

-- ---------------------------------------------------------------- audit log: a fourth kind ---------
-- 'record' rows describe one deleted row each. The >= 12-character reason stays mandatory for the three original
-- kinds (project / organization / account) and is OPTIONAL for 'record' — the constraint is written so a NULL
-- reason can never slip through on the original kinds (length(btrim(NULL)) is NULL, which a bare CHECK would pass).
alter table public.data_erasure_log add column if not exists table_name text;
alter table public.data_erasure_log add column if not exists record_id uuid;
alter table public.data_erasure_log add column if not exists record_label text;
alter table public.data_erasure_log alter column reason drop not null;
alter table public.data_erasure_log drop constraint if exists data_erasure_log_kind_check;
alter table public.data_erasure_log add constraint data_erasure_log_kind_check
  check (kind in ('project', 'organization', 'account', 'record'));
alter table public.data_erasure_log drop constraint if exists data_erasure_log_reason_check;
alter table public.data_erasure_log add constraint data_erasure_log_reason_check
  check (kind = 'record' or (reason is not null and length(btrim(reason)) >= 12));
create index if not exists idx_data_erasure_log_record on public.data_erasure_log (table_name, record_id) where kind = 'record';

-- ---------------------------------------------------------------- the allowlist ---------------------
-- Exact table names an owner/admin may hard-delete rows from. Anything not listed is refused, including —
-- deliberately and permanently — organizations, organization_members, organization_invitations, billing_config,
-- billing_events, feature_flags, runtime_config, data_erasure_log, user_profiles, user_projects, plan_limits,
-- number_sequences (deleting a sequence row would let official record numbers repeat — guardrail #1),
-- schema_migrations, and everything outside the public schema. Every name below was verified to exist with a
-- uuid id and a uuid project_id (delivery_items reach their project through the delivery).
create or replace function public.hard_delete_allowlist()
returns text[] language sql immutable set search_path to '' as $$
  select array[
    'rfis', 'submittals', 'submittal_rounds',
    'drawings', 'drawing_sets', 'gc_drawings', 'gc_drawing_sets', 'drawing_transmittals',
    'change_orders', 'change_requests',
    'work_packages', 'pieces', 'deliveries', 'delivery_items', 'schedule_tasks', 'task_dependencies', 'look_ahead',
    'expenses', 'sov_items', 'cost_codes', 'pay_applications', 'backcharges', 'budget_hour_items',
    'inspections', 'quality_control_records', 'safety_incidents', 'punchlist_items', 'daily_logs', 'photos',
    'risks', 'mitigation_logs', 'pma_decisions', 'pma_assumptions',
    'warranties', 'project_handoff_items',
    'model_registry', 'model_elements',
    'documents', 'comments'
  ]::text[];
$$;
revoke execute on function public.hard_delete_allowlist() from public;
grant execute on function public.hard_delete_allowlist() to authenticated;

-- ---------------------------------------------------------------- internals -------------------------
-- Σ two {key: count} maps.
create or replace function public.hard_delete_merge_counts(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path to '' as $$
  select coalesce(
    (select jsonb_object_agg(k, s) from (
       select k, sum(v) as s from (
         select key as k, value::bigint as v from jsonb_each_text(coalesce(a, '{}'::jsonb))
         union all
         select key, value::bigint from jsonb_each_text(coalesce(b, '{}'::jsonb))
       ) u group by k) g),
    '{}'::jsonb);
$$;
revoke execute on function public.hard_delete_merge_counts(jsonb, jsonb) from public;

-- Mirrors M22's erasure_toggle_user_triggers with one extra knob: p_before_only limits the disable to BEFORE
-- triggers (the guards), leaving the AFTER bookkeeping triggers running. Returns the "table|trigger" list that was
-- switched off so the very same set can be switched back on; enabling ignores p_tables and uses p_list.
create or replace function public.hard_delete_toggle_triggers(p_tables text[], p_disable boolean, p_before_only boolean default true, p_list text[] default '{}')
returns text[] language plpgsql security definer set search_path to '' as $$
declare rec record; v_out text[] := '{}'; x text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'hard_delete_toggle_triggers is internal to hard_delete_records' using errcode = '42501';
  end if;
  -- ALTER TABLE refuses while deferred trigger events are pending in this transaction: flush them first.
  set constraints all immediate;
  if p_disable then
    for rec in
      select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and c.relname = any(p_tables) and not t.tgisinternal and t.tgenabled = 'O'
         and (not p_before_only or (t.tgtype & 2) <> 0)
       order by c.relname, t.tgname
    loop
      execute format('alter table public.%I disable trigger %I', rec.relname, rec.tgname);
      v_out := v_out || (rec.relname || '|' || rec.tgname);
    end loop;
    return v_out;
  end if;
  foreach x in array coalesce(p_list, '{}'::text[]) loop
    execute format('alter table public.%I enable trigger %I', split_part(x, '|', 1), split_part(x, '|', 2));
  end loop;
  return coalesce(p_list, '{}'::text[]);
end $$;
revoke execute on function public.hard_delete_toggle_triggers(text[], boolean, boolean, text[]) from public;

-- The dependents a plain DELETE would refuse on (ON DELETE NO ACTION / RESTRICT single-column FKs pointing at the
-- rows): a NULLABLE referencing column is cleared (the child survives, detached — pieces.work_package_id,
-- drawing_sets.current_submittal_id, model_elements.piece_id, fab_releases.risk_id …); a NOT NULL one means the child
-- cannot exist without the parent, so it is removed with it (drawing_holds.drawing_id,
-- piece_station_completions.piece_id …), its own such dependents first. CASCADE and SET NULL FKs are left to
-- Postgres. Returns {"detached:<child>.<col>": n, "deleted:<child>": n} for the audit row. Guards on the child
-- tables are already off (they are in the family the caller disabled); depth is capped so a cyclic schema can never
-- recurse forever.
create or replace function public.hard_delete_release_dependents(p_table text, p_ids uuid[], p_depth int default 0)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare fk record; v_n int; v_counts jsonb := '{}'::jsonb; v_child_ids uuid[]; v_key text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'hard_delete_release_dependents is internal to hard_delete_records' using errcode = '42501';
  end if;
  if p_depth > 5 then
    raise exception 'DELETE_BLOCKED: % has a dependency chain deeper than 5 levels', p_table using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_ids, '{}'::uuid[])) = 0 then return v_counts; end if;
  for fk in
    select ch.relname::text as child, a.attname::text as col, a.attnotnull as required,
           exists (select 1 from pg_attribute i where i.attrelid = ch.oid and i.attname = 'id' and i.attnum > 0 and not i.attisdropped) as has_id
      from pg_constraint con
      join pg_class pr on pr.oid = con.confrelid and pr.relnamespace = 'public'::regnamespace and pr.relname = p_table
      join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = ch.oid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confdeltype in ('a', 'r') and cardinality(con.conkey) = 1
     order by 1, 2
  loop
    if not fk.required then
      execute format('update public.%I set %I = null where %I = any($1)', fk.child, fk.col, fk.col) using p_ids;
      get diagnostics v_n = row_count;
      v_key := 'detached:' || fk.child || '.' || fk.col;
    else
      if fk.has_id then
        execute format('select array(select id from public.%I where %I = any($1))', fk.child, fk.col) into v_child_ids using p_ids;
        if cardinality(v_child_ids) > 0 then
          v_counts := public.hard_delete_merge_counts(v_counts, public.hard_delete_release_dependents(fk.child, v_child_ids, p_depth + 1));
        end if;
      end if;
      execute format('delete from public.%I where %I = any($1)', fk.child, fk.col) using p_ids;
      get diagnostics v_n = row_count;
      v_key := 'deleted:' || fk.child;
    end if;
    if v_n > 0 then v_counts := public.hard_delete_merge_counts(v_counts, jsonb_build_object(v_key, v_n)); end if;
  end loop;
  return v_counts;
end $$;
revoke execute on function public.hard_delete_release_dependents(text, uuid[], int) from public;

-- ---------------------------------------------------------------- the RPCs --------------------------
-- hard_delete_records(table, ids[], reason?) is the implementation; hard_delete_record(table, id, reason?) is the
-- single-row convenience over it. SECURITY DEFINER is required to pass the guards and the revoked DELETE grants,
-- which is exactly why the authorization check is done PER ROW below and never trusts anything the caller says
-- about which project a row belongs to. All-or-nothing: one refused row rolls back the whole call.
create or replace function public.hard_delete_records(p_table text, p_ids uuid[], p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_uid uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
  v_prev text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null);
  v_i int; v_row jsonb; v_project uuid;
  v_labels text[] := '{}'; v_projects uuid[] := '{}'; v_counts jsonb[] := '{}';
  v_family text[]; v_disabled text[] := '{}'; v_disabled_all text[] := '{}';
  v_dep jsonb; v_total jsonb := '{}'::jsonb; v_fallback boolean := false; v_first_error text;
  v_detail text; v_blocking text;
begin
  -- 1. Identity and input hygiene. The table name is matched EXACTLY against the fixed allowlist before it is ever
  --    interpolated; format(%I) is used everywhere after that. A name with anything but [a-z_] is refused outright.
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_table !~ '^[a-z_]+$' or not (v_table = any(public.hard_delete_allowlist())) then
    raise exception 'Rows in "%" cannot be hard-deleted through this path', coalesce(p_table, '') using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0 then raise exception 'Nothing to delete' using errcode = '22023'; end if;
  if cardinality(v_ids) > 500 then raise exception 'Delete at most 500 rows per call (asked for %)', cardinality(v_ids) using errcode = '22023'; end if;

  -- 2. Per-row authorization. Resolve the owning project FROM THE ROW (delivery_items reach it through their
  --    delivery), then require project admin. A row we cannot place in a project is refused, never assumed.
  for v_i in 1 .. cardinality(v_ids) loop
    if v_table = 'delivery_items' then
      select to_jsonb(di), d.project_id into v_row, v_project
        from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where di.id = v_ids[v_i];
    else
      execute format('select to_jsonb(t), t.project_id from public.%I t where t.id = $1', v_table) into v_row, v_project using v_ids[v_i];
    end if;
    if v_row is null then raise exception 'No % row with id %', v_table, v_ids[v_i] using errcode = 'P0002'; end if;
    if v_project is null then raise exception 'Row % in % has no project and cannot be authorized for deletion', v_ids[v_i], v_table using errcode = '42501'; end if;
    if not public.user_has_project_role_at_least(v_project, 'admin') then
      raise exception 'Only a project admin can permanently delete from %', v_table using errcode = '42501';
    end if;
    v_projects[v_i] := v_project;
    -- A human handle for the audit row: the record's official number / mark / name, whichever it carries.
    v_labels[v_i] := coalesce(
      v_row ->> 'rfi_number', v_row ->> 'submittal_number', v_row ->> 'co_number', v_row ->> 'cr_number', v_row ->> 'wp_number',
      v_row ->> 'delivery_number', v_row ->> 'transmittal_number', v_row ->> 'application_number', v_row ->> 'backcharge_number',
      v_row ->> 'risk_number', v_row ->> 'mitigation_number', v_row ->> 'decision_number', v_row ->> 'inspection_number',
      v_row ->> 'qc_number', v_row ->> 'incident_number', v_row ->> 'expense_number', v_row ->> 'line_item_number',
      v_row ->> 'sheet_number', v_row ->> 'drawing_number', v_row ->> 'set_name', v_row ->> 'piece_mark', v_row ->> 'assembly_mark',
      v_row ->> 'element_guid', v_row ->> 'task_name', v_row ->> 'file_name', v_row ->> 'code', v_row ->> 'warranty_type',
      v_row ->> 'name', v_row ->> 'title', left(v_row ->> 'description', 80), left(v_row ->> 'content', 80), left(v_row ->> 'question', 80),
      v_ids[v_i]::text);
  end loop;

  -- 3. The FK family: the table plus every table that references it, transitively (cascade, set-null and no-action
  --    alike), so a child's own BEFORE guard can never refuse the cascade / detach / dependent delete.
  with recursive fam(relname) as (
    select v_table collate "C"
    union
    select ch.relname::text from fam f
      join pg_class pr on pr.relname = f.relname and pr.relnamespace = 'public'::regnamespace
      join pg_constraint con on con.confrelid = pr.oid and con.contype = 'f'
      join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
  ) select array_agg(distinct relname) into v_family from fam;

  perform set_config('steelbuild.erasure_rpc', 'on', true);
  v_disabled := public.hard_delete_toggle_triggers(v_family, true, true);

  -- 4. Delete, dependents first, one record at a time so the audit row carries that record's own counts. A remaining
  --    multi-column / unforeseen reference is a readable sentence naming the blocking table, never a raw 23503. Any
  --    other refusal (an AFTER trigger of a module this path does not know) is retried once with every user trigger
  --    on the family off; the savepoint semantics of the block undo the first attempt completely.
  begin
    for v_i in 1 .. cardinality(v_ids) loop
      v_dep := public.hard_delete_release_dependents(v_table, array[v_ids[v_i]]);
      execute format('delete from public.%I where id = $1', v_table) using v_ids[v_i];
      v_counts[v_i] := jsonb_build_object(v_table, 1) || v_dep;
      v_total := public.hard_delete_merge_counts(v_total, v_dep);
    end loop;
  exception
    when foreign_key_violation then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_blocking := coalesce(substring(v_detail from 'referenced from table "([^"]+)"'), 'another table');
      raise exception 'DELETE_BLOCKED: % is still referenced from % — remove or reassign those rows first', v_table, v_blocking using errcode = 'P0001';
    when others then
      if sqlerrm like 'DELETE_BLOCKED:%' then raise; end if;
      v_fallback := true; v_first_error := sqlerrm;
  end;
  if v_fallback then
    v_counts := '{}'; v_total := '{}'::jsonb;
    v_disabled_all := public.hard_delete_toggle_triggers(v_family, true, false);
    begin
      for v_i in 1 .. cardinality(v_ids) loop
        v_dep := public.hard_delete_release_dependents(v_table, array[v_ids[v_i]]);
        execute format('delete from public.%I where id = $1', v_table) using v_ids[v_i];
        v_counts[v_i] := jsonb_build_object(v_table, 1) || v_dep;
        v_total := public.hard_delete_merge_counts(v_total, v_dep);
      end loop;
    exception
      when foreign_key_violation then
        get stacked diagnostics v_detail = pg_exception_detail;
        v_blocking := coalesce(substring(v_detail from 'referenced from table "([^"]+)"'), 'another table');
        raise exception 'DELETE_BLOCKED: % is still referenced from % — remove or reassign those rows first', v_table, v_blocking using errcode = 'P0001';
      when others then
        raise exception 'Delete from % failed: % (first attempt: %)', v_table, sqlerrm, v_first_error using errcode = 'P0001';
    end;
  end if;

  -- 5. Audit, one row per record, with everything that went with it. The log's own guard requires the flag.
  for v_i in 1 .. cardinality(v_ids) loop
    insert into public.data_erasure_log
      (kind, org_id, org_name, project_id, project_name, project_number, requested_by, requested_by_email, reason, row_counts, table_name, record_id, record_label)
    select 'record', p.org_id, o.name, p.id, p.name, p.project_number, v_uid, v_email, nullif(btrim(coalesce(p_reason, '')), ''),
           v_counts[v_i], v_table, v_ids[v_i], v_labels[v_i]
      from public.projects p left join public.organizations o on o.id = p.org_id where p.id = v_projects[v_i];
  end loop;

  -- 6. Every trigger back on, flag restored.
  perform public.hard_delete_toggle_triggers(v_family, false, true, v_disabled_all || v_disabled);
  perform set_config('steelbuild.erasure_rpc', v_prev, true);
  return jsonb_build_object('table', v_table, 'deleted', cardinality(v_ids), 'labels', to_jsonb(v_labels), 'project_ids', to_jsonb(v_projects),
                            'dependents', v_total, 'fallback', v_fallback);
end $$;
revoke execute on function public.hard_delete_records(text, uuid[], text) from public;
grant execute on function public.hard_delete_records(text, uuid[], text) to authenticated;

create or replace function public.hard_delete_record(p_table text, p_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  return public.hard_delete_records(p_table, array[p_id], p_reason);
end $$;
revoke execute on function public.hard_delete_record(text, uuid, text) from public;
grant execute on function public.hard_delete_record(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';