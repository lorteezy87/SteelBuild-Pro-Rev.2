-- H1 (2026-07-01 enterprise-readiness audit): the read-only 'viewer' project role
-- could INSERT/UPDATE/DELETE ~34 business tables (their write policies were gated
-- only by user_has_project_access, with NO role floor). Applied live via Supabase
-- MCP (recorded version 20260702034009); this file is the lockstep repo copy.
--
-- Fix: ADDITIVE RESTRICTIVE write policies that AND a `role >= field` floor onto the
-- existing permissive policies. Non-destructive — existing permissive SELECT + any
-- hidden guards are untouched, viewers keep READ, only viewer WRITES are blocked.
-- Role levels (user_has_project_role_at_least): viewer=0 < field=1 < pm=2 <= admin/
-- owner=3, with an org owner/admin bypass. service_role + SECURITY DEFINER RPCs
-- bypass RLS, so system/definer writes (e.g. get_next_sequence_number, email-ingest
-- service-role inserts) are unaffected.
--
-- Verified live (2026-07-01) by RLS-impersonating a real viewer (9a196a07…): READ
-- still returns rows; a documents INSERT now fails with
-- `42501: new row violates row-level security policy "documents_ins_role_floor"`.
--
-- Follow-up (owner): optional pm-floor hardening on the 4 authority tables
-- (drawing_revisions, change_requests, project_closeout, email_integration_settings)
-- if field users should also be blocked — deferred to avoid a field-workflow regression.

do $$
declare
  t text;
  tables text[] := array[
    'alerts','documents','uploaded_files','warranties','scope_items','resources',
    'quality_control_records','pma_decisions','pma_assumptions','number_sequences',
    'mitigation_actions','mitigation_logs','meetings','look_ahead','email_intake_queue',
    'email_integration_settings','drawing_transmittals','drawing_transmittal_items',
    'drawing_reviews','drawing_impacts','drawing_activity','change_requests',
    'project_closeout','project_handoff_items','document_folders','document_import_queue',
    'drawing_revision_comparisons','drawing_revisions','drawing_zone_activity',
    'drawing_zone_proposals','model_registry','model_element_links','linked_folders',
    'external_file_refs'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t||'_ins_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated '
      || 'with check (public.user_has_project_role_at_least(project_id, ''field''))',
      t||'_ins_role_floor', t);

    execute format('drop policy if exists %I on public.%I', t||'_upd_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated '
      || 'using (public.user_has_project_role_at_least(project_id, ''field'')) '
      || 'with check (public.user_has_project_role_at_least(project_id, ''field''))',
      t||'_upd_role_floor', t);

    execute format('drop policy if exists %I on public.%I', t||'_del_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated '
      || 'using (public.user_has_project_role_at_least(project_id, ''field''))',
      t||'_del_role_floor', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
