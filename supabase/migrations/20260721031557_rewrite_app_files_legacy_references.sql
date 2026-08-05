-- Repoint every reviewed app-files database reference from the legacy flat
-- uploads/ namespace to the founding organization's scoped namespace.
--
-- Apply only after legacy-app-files-copy has copied every source object. This
-- migration is fail-closed: it verifies destination object metadata before any
-- reference changes, rejects ambiguous change-order attachment text, and is
-- fully transactional. Source objects remain untouched for rollback.

begin;

do $$
declare
  v_org_id uuid;
  v_reference_columns constant jsonb := $references$[
    {"table_name":"drawings","column_name":"file_url"},
    {"table_name":"drawings","column_name":"thumbnail_url"},
    {"table_name":"drawing_sets","column_name":"file_url"},
    {"table_name":"drawing_revisions","column_name":"file_url"},
    {"table_name":"drawing_analyses","column_name":"file_url"},
    {"table_name":"drawing_analyses","column_name":"storage_path"},
    {"table_name":"drawing_signoffs","column_name":"signature_url"},
    {"table_name":"submittals","column_name":"file_url"},
    {"table_name":"submittal_rounds","column_name":"file_url"},
    {"table_name":"submittal_rounds","column_name":"markup_file_url"},
    {"table_name":"submittal_sheet_responses","column_name":"markup_file_url"},
    {"table_name":"documents","column_name":"file_url"},
    {"table_name":"photos","column_name":"file_url"},
    {"table_name":"expenses","column_name":"receipt_url"},
    {"table_name":"model_registry","column_name":"file_url"},
    {"table_name":"model_registry","column_name":"cloud_url"},
    {"table_name":"scope_items","column_name":"file_url"},
    {"table_name":"scope_items","column_name":"storage_path"},
    {"table_name":"mitigation_actions","column_name":"proof_url"},
    {"table_name":"deliveries","column_name":"shipping_ticket_path"},
    {"table_name":"deliveries","column_name":"shipping_ticket_url"},
    {"table_name":"uploaded_files","column_name":"file_url"},
    {"table_name":"user_profiles","column_name":"avatar_url"}
  ]$references$::jsonb;
  v_source_objects bigint;
  v_destination_objects bigint;
  v_missing_or_mismatched bigint;
  v_verification jsonb;
  v_ambiguous_attachments bigint;
  v_legacy_references bigint := 0;
  v_count bigint;
  v_ref record;
begin
  select count(*)
    into v_source_objects
    from storage.objects source_object
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%';

  for v_ref in
    select reference_column.table_name, reference_column.column_name
      from pg_catalog.jsonb_to_recordset(v_reference_columns)
        as reference_column(table_name text, column_name text)
  loop
    execute format(
      'select count(*) from public.%I where %I like $1',
      v_ref.table_name,
      v_ref.column_name
    ) into v_count using 'uploads/%';
    v_legacy_references := v_legacy_references + v_count;
  end loop;

  select v_legacy_references + count(*)
    into v_legacy_references
    from public.change_orders
   where attachments like '%uploads/%';

  if v_source_objects = 0 then
    if v_legacy_references > 0 then
      raise exception
        'app-files reference rewrite blocked: % legacy database reference(s) exist without source objects',
        v_legacy_references;
    end if;
    return;
  end if;

  v_org_id := public.founding_org_id();
  if v_org_id is null then
    raise exception 'app-files reference rewrite blocked: founding organization is missing';
  end if;

  select count(*)
    into v_destination_objects
    from storage.objects source_object
    join storage.objects destination_object
      on destination_object.bucket_id = source_object.bucket_id
     and destination_object.name = v_org_id::text || '/' || source_object.name
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%';

  select job.completion_details
    into v_verification
    from private.maintenance_jobs job
   where job.job_key = 'legacy_app_files_copy';

  if not found then
    raise exception 'app-files reference rewrite blocked: maintenance marker missing';
  end if;

  if coalesce(v_verification ->> 'source_objects', '') !~ '^[0-9]+$'
     or coalesce(v_verification ->> 'destination_objects', '') !~ '^[0-9]+$'
     or coalesce(v_verification ->> 'content_verified', '') !~ '^[0-9]+$'
     or coalesce(v_verification ->> 'verification_failed', '') !~ '^[0-9]+$'
     or (v_verification ->> 'source_objects')::bigint <> v_source_objects
     or (v_verification ->> 'destination_objects')::bigint <> v_source_objects
     or (v_verification ->> 'content_verified')::bigint <> v_source_objects
     or (v_verification ->> 'verification_failed')::bigint <> 0
     or nullif(v_verification ->> 'verified_at', '') is null then
    raise exception
      'app-files reference rewrite blocked: aggregate content verification is incomplete for % source object(s)',
      v_source_objects;
  end if;

  if v_destination_objects <> v_source_objects then
    raise exception
      'app-files reference rewrite blocked: expected % destination object(s), found %',
      v_source_objects,
      v_destination_objects;
  end if;

  select count(*)
    into v_missing_or_mismatched
    from storage.objects source_object
    left join storage.objects destination_object
      on destination_object.bucket_id = source_object.bucket_id
     and destination_object.name = v_org_id::text || '/' || source_object.name
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%'
     and (
       destination_object.id is null
       or coalesce(source_object.metadata ->> 'size', source_object.metadata ->> 'contentLength') is null
       or coalesce(destination_object.metadata ->> 'size', destination_object.metadata ->> 'contentLength') is null
       or coalesce(source_object.metadata ->> 'size', source_object.metadata ->> 'contentLength')
          is distinct from
          coalesce(destination_object.metadata ->> 'size', destination_object.metadata ->> 'contentLength')
     );

  if v_missing_or_mismatched > 0 then
    raise exception
      'app-files reference rewrite blocked: % destination object(s) are missing or size-mismatched',
      v_missing_or_mismatched;
  end if;

  select count(*)
    into v_ambiguous_attachments
    from public.change_orders
   where attachments like '%uploads/%'
     and attachments !~ '(^|,[[:space:]]*)uploads/';

  if v_ambiguous_attachments > 0 then
    raise exception
      'app-files reference rewrite blocked: % change-order attachment row(s) need manual parsing',
      v_ambiguous_attachments;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger trigger_row
     where trigger_row.tgrelid = 'public.drawings'::regclass
       and trigger_row.tgname = 'trg_drawings_set_lock_guard'
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled = 'O'
  ) then
    raise exception
      'app-files reference rewrite blocked: drawings lock guard is missing or not enabled';
  end if;

  -- Only the drawing-set lock guard rejects this path-only maintenance update.
  -- Every audit/activity/timestamp/set-count trigger remains enabled. If any
  -- later statement fails, the surrounding transaction rolls this ALTER back.
  alter table public.drawings disable trigger trg_drawings_set_lock_guard;

  for v_ref in
    select reference_column.table_name, reference_column.column_name
      from pg_catalog.jsonb_to_recordset(v_reference_columns)
        as reference_column(table_name text, column_name text)
  loop
    execute format(
      'update public.%I reference_row
          set %I = $1 || reference_row.%I
        where reference_row.%I like ''uploads/%%''
          and exists (
            select 1
              from storage.objects source_object
              join storage.objects destination_object
                on destination_object.bucket_id = source_object.bucket_id
               and destination_object.name = $1 || source_object.name
             where source_object.bucket_id = ''app-files''
               and source_object.name = reference_row.%I
          )',
      v_ref.table_name,
      v_ref.column_name,
      v_ref.column_name,
      v_ref.column_name,
      v_ref.column_name
    ) using v_org_id::text || '/';
  end loop;

  alter table public.drawings enable trigger trg_drawings_set_lock_guard;

  if not exists (
    select 1
      from pg_catalog.pg_trigger trigger_row
     where trigger_row.tgrelid = 'public.drawings'::regclass
       and trigger_row.tgname = 'trg_drawings_set_lock_guard'
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled = 'O'
  ) then
    raise exception
      'app-files reference rewrite blocked: drawings lock guard was not re-enabled';
  end if;

  update public.change_orders
     set attachments = regexp_replace(
       attachments,
       '(^|,[[:space:]]*)uploads/',
       E'\\1' || v_org_id::text || '/uploads/',
       'g'
     )
   where attachments ~ '(^|,[[:space:]]*)uploads/';
end
$$;

notify pgrst, 'reload schema';

commit;
