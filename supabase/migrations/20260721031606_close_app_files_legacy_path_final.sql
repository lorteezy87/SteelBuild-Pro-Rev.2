-- Final app-files legacy-path cutover. This intentionally follows the
-- separately reviewable reference-rewrite migration.
--
-- This migration is deliberately fail-closed. Run the copy/rewrite/verify
-- phases in scripts/storage-backfill-legacy-uploads.mjs first. It refuses to
-- close the grandfathered uploads/ RLS branch if any destination copy is
-- missing or any database reference still points at a legacy flat path.
-- Original uploads/ objects are retained for rollback; only their authenticated
-- read/upload exception is removed.

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
  v_missing_copies bigint;
  v_unverified_copies bigint;
  v_verification jsonb;
  v_legacy_references bigint := 0;
  v_broken_references bigint := 0;
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
        'app-files cutover blocked: % legacy database reference(s) exist without source objects',
        v_legacy_references;
    end if;
    return;
  end if;

  v_org_id := public.founding_org_id();
  if v_org_id is null then
    raise exception 'app-files cutover blocked: founding organization is missing';
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
    raise exception 'app-files cutover blocked: maintenance marker missing';
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
      'app-files cutover blocked: aggregate content verification is incomplete for % source object(s)',
      v_source_objects;
  end if;

  if v_destination_objects <> v_source_objects then
    raise exception
      'app-files cutover blocked: expected % destination object(s), found %',
      v_source_objects,
      v_destination_objects;
  end if;

  select count(*)
    into v_missing_copies
    from storage.objects source_object
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%'
     and not exists (
       select 1
         from storage.objects destination_object
        where destination_object.bucket_id = source_object.bucket_id
          and destination_object.name = v_org_id::text || '/' || source_object.name
     );

  if v_missing_copies > 0 then
    raise exception
      'app-files cutover blocked: % legacy object(s) do not have org-scoped copies',
      v_missing_copies;
  end if;

  select count(*)
    into v_unverified_copies
    from storage.objects source_object
    join storage.objects destination_object
      on destination_object.bucket_id = source_object.bucket_id
     and destination_object.name = v_org_id::text || '/' || source_object.name
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%'
     and (
       coalesce(source_object.metadata ->> 'size', source_object.metadata ->> 'contentLength') is null
       or coalesce(destination_object.metadata ->> 'size', destination_object.metadata ->> 'contentLength') is null
       or coalesce(source_object.metadata ->> 'size', source_object.metadata ->> 'contentLength')
          is distinct from
          coalesce(destination_object.metadata ->> 'size', destination_object.metadata ->> 'contentLength')
     );

  if v_unverified_copies > 0 then
    raise exception
      'app-files cutover blocked: % destination copy size record(s) do not match their source',
      v_unverified_copies;
  end if;

  for v_ref in
    select reference_column.table_name, reference_column.column_name
      from pg_catalog.jsonb_to_recordset(v_reference_columns)
        as reference_column(table_name text, column_name text)
  loop
    execute format(
      'select count(*) from public.%I reference_row
        where reference_row.%I like $1
          and not exists (
            select 1 from storage.objects object_row
             where object_row.bucket_id = ''app-files''
               and object_row.name = reference_row.%I
          )',
      v_ref.table_name,
      v_ref.column_name,
      v_ref.column_name
    ) into v_count using v_org_id::text || '/uploads/%';
    v_broken_references := v_broken_references + v_count;
  end loop;

  if v_legacy_references > 0 then
    raise exception
      'app-files cutover blocked: % database reference(s) still use uploads/ paths',
      v_legacy_references;
  end if;

  if v_broken_references > 0 then
    raise exception
      'app-files cutover blocked: % org-scoped database reference(s) have no object',
      v_broken_references;
  end if;

  -- A service-role copy has no JWT subject, so Supabase leaves the destination
  -- owner unset. Preserve both the current owner_id and deprecated owner fields
  -- from each source object so the existing owner-scoped UPDATE/DELETE policies
  -- keep working after references move to the copies.
  update storage.objects destination_object
     set owner_id = source_object.owner_id,
         owner = source_object.owner
    from storage.objects source_object
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%'
     and destination_object.bucket_id = source_object.bucket_id
     and destination_object.name = v_org_id::text || '/' || source_object.name;
end
$$;

alter policy auth_read on storage.objects
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.user_is_org_member(((storage.foldername(name))[1])::uuid)
  );

alter policy auth_upload on storage.objects
  with check (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.user_is_org_member(((storage.foldername(name))[1])::uuid)
  );

do $$
begin
  update private.maintenance_jobs
     set completed_at = coalesce(completed_at, now()),
         token_sha256 = null,
         completion_details = completion_details || jsonb_build_object(
           'legacy_objects_retained', (
             select count(*)
             from storage.objects
             where bucket_id = 'app-files' and name like 'uploads/%'
           ),
           'legacy_database_references', 0,
           'grandfather_policy_closed', true
         )
   where job_key = 'legacy_app_files_copy';

  if not found then
    raise exception 'app-files cutover blocked: maintenance marker missing';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
