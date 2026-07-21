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
  v_org_id uuid := public.founding_org_id();
  v_source_objects bigint;
  v_destination_objects bigint;
  v_missing_or_mismatched bigint;
  v_verification jsonb;
  v_ambiguous_attachments bigint;
  v_ref record;
begin
  if v_org_id is null then
    raise exception 'app-files reference rewrite blocked: founding organization is missing';
  end if;

  select count(*)
    into v_source_objects
    from storage.objects source_object
   where source_object.bucket_id = 'app-files'
     and source_object.name like 'uploads/%';

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

  for v_ref in
    select *
      from (values
        ('drawings', 'file_url'),
        ('drawings', 'thumbnail_url'),
        ('drawing_sets', 'file_url'),
        ('drawing_revisions', 'file_url'),
        ('drawing_analyses', 'file_url'),
        ('drawing_analyses', 'storage_path'),
        ('drawing_signoffs', 'signature_url'),
        ('submittals', 'file_url'),
        ('submittal_rounds', 'file_url'),
        ('submittal_rounds', 'markup_file_url'),
        ('submittal_sheet_responses', 'markup_file_url'),
        ('documents', 'file_url'),
        ('photos', 'file_url'),
        ('expenses', 'receipt_url'),
        ('model_registry', 'file_url'),
        ('model_registry', 'cloud_url'),
        ('scope_items', 'file_url'),
        ('scope_items', 'storage_path'),
        ('mitigation_actions', 'proof_url'),
        ('deliveries', 'shipping_ticket_path'),
        ('deliveries', 'shipping_ticket_url'),
        ('uploaded_files', 'file_url'),
        ('user_profiles', 'avatar_url')
      ) as reference_columns(table_name, column_name)
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
