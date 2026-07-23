-- Transmittals are contractual distribution records. The UI requires the PM
-- role for create/edit/delete, but the earlier generic write-floor migration
-- only blocked viewers. These additive RESTRICTIVE policies make that same PM
-- floor authoritative for both headers and their attached revision rows while
-- preserving viewer/field SELECT access through the existing policies.

drop policy if exists drawing_transmittals_ins_pm_floor on public.drawing_transmittals;
create policy drawing_transmittals_ins_pm_floor
  on public.drawing_transmittals
  as restrictive
  for insert
  to authenticated
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_transmittals_upd_pm_floor on public.drawing_transmittals;
create policy drawing_transmittals_upd_pm_floor
  on public.drawing_transmittals
  as restrictive
  for update
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'))
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_transmittals_del_pm_floor on public.drawing_transmittals;
create policy drawing_transmittals_del_pm_floor
  on public.drawing_transmittals
  as restrictive
  for delete
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_transmittal_items_ins_pm_floor on public.drawing_transmittal_items;
create policy drawing_transmittal_items_ins_pm_floor
  on public.drawing_transmittal_items
  as restrictive
  for insert
  to authenticated
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_transmittal_items_upd_pm_floor on public.drawing_transmittal_items;
create policy drawing_transmittal_items_upd_pm_floor
  on public.drawing_transmittal_items
  as restrictive
  for update
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'))
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_transmittal_items_del_pm_floor on public.drawing_transmittal_items;
create policy drawing_transmittal_items_del_pm_floor
  on public.drawing_transmittal_items
  as restrictive
  for delete
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'));
