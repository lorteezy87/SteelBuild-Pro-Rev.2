-- Replace project_handoff_items' non-canonical EXISTS(SELECT 1 FROM projects WHERE id=project_id)
-- predicate — which merely checks the project row exists and relies on projects' OWN
-- RLS to scope the subquery — with the canonical user_has_project_access(project_id)
-- helper used by the other ~70 project-scoped tables. Same effective access (any
-- project member), but tenant isolation no longer depends on the nested projects RLS.
--
-- Applied live to prod (kjrwqagyeswwoxpjkcko) via apply_migration on 2026-06-30.
drop policy if exists project_handoff_items_select on public.project_handoff_items;
drop policy if exists project_handoff_items_insert on public.project_handoff_items;
drop policy if exists project_handoff_items_update on public.project_handoff_items;
drop policy if exists project_handoff_items_delete on public.project_handoff_items;

create policy project_handoff_items_select on public.project_handoff_items
  for select to authenticated using (user_has_project_access(project_id));
create policy project_handoff_items_insert on public.project_handoff_items
  for insert to authenticated with check (user_has_project_access(project_id));
create policy project_handoff_items_update on public.project_handoff_items
  for update to authenticated using (user_has_project_access(project_id)) with check (user_has_project_access(project_id));
create policy project_handoff_items_delete on public.project_handoff_items
  for delete to authenticated using (user_has_project_access(project_id));
