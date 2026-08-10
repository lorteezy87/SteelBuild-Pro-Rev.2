-- Piece Intelligence drawing-impact writes are PM decisions. Replace the
-- existing field-floor restrictive policies in place so permissive project
-- membership policies and all SELECT authority remain unchanged.

drop policy if exists drawing_impacts_ins_role_floor on public.drawing_impacts;
create policy drawing_impacts_ins_role_floor
  on public.drawing_impacts
  as restrictive
  for insert
  to authenticated
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_impacts_upd_role_floor on public.drawing_impacts;
create policy drawing_impacts_upd_role_floor
  on public.drawing_impacts
  as restrictive
  for update
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'))
  with check (public.user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists drawing_impacts_del_role_floor on public.drawing_impacts;
create policy drawing_impacts_del_role_floor
  on public.drawing_impacts
  as restrictive
  for delete
  to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'));

notify pgrst, 'reload schema';
