-- H1 follow-up: raise the write floor from `field` → `pm` on the four
-- authority tables deferred by 20260702034009_viewer_write_role_floor_restrictive.
--
-- Why: those tables already block viewers (field floor), but doc-control /
-- financial authority should also block field users:
--   • drawing_revisions — authoritative current-revision register
--   • change_requests   — PCO / money path
--   • project_closeout  — contractual closeout package
--   • email_integration_settings — inbound email / webhook wiring
--
-- Pattern: REPLACE the existing restrictive *_ins/upd/del_role_floor
-- policies with pm-floor equivalents. SELECT stays on the existing
-- permissive member-access policies (unchanged). service_role and
-- SECURITY DEFINER RPCs bypass RLS.
--
-- Transmittals already received this treatment in
-- 20260721060621_enforce_pm_transmittal_writes.sql.

do $$
declare
  t text;
  tables text[] := array[
    'drawing_revisions',
    'change_requests',
    'project_closeout',
    'email_integration_settings'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t||'_ins_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated '
      || 'with check (public.user_has_project_role_at_least(project_id, ''pm''))',
      t||'_ins_role_floor', t);

    execute format('drop policy if exists %I on public.%I', t||'_upd_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated '
      || 'using (public.user_has_project_role_at_least(project_id, ''pm'')) '
      || 'with check (public.user_has_project_role_at_least(project_id, ''pm''))',
      t||'_upd_role_floor', t);

    execute format('drop policy if exists %I on public.%I', t||'_del_role_floor', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated '
      || 'using (public.user_has_project_role_at_least(project_id, ''pm''))',
      t||'_del_role_floor', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
