-- Converge the legacy `project_member_access` policies (which checked user_projects
-- directly, ignoring the org boundary) onto user_has_project_access(), which is now
-- org-aware (see enforce_org_isolation_core). Finishes the legacy-policy cleanup AND
-- extends the org isolation boundary to these 12 tables. ALTER POLICY preserves each
-- policy's command (ALL) and roles; only the predicate changes.

-- Direct project_id column -> gate straight through the helper.
alter policy project_member_access on public.comments
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.drawing_analyses
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.drawing_revision_comparisons
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.submittal_activity
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.task_dependencies
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.document_folders
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.external_file_refs
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));
alter policy project_member_access on public.external_linked_folders
  using (public.user_has_project_access(project_id))
  with check (public.user_has_project_access(project_id));

-- Indirect (no project_id column): resolve project_id through the parent row, but
-- gate via the org-aware helper instead of a raw user_projects subquery.
alter policy project_member_access on public.delivery_items
  using (delivery_id in (select d.id from public.deliveries d where public.user_has_project_access(d.project_id)))
  with check (delivery_id in (select d.id from public.deliveries d where public.user_has_project_access(d.project_id)));
alter policy project_member_access on public.drawing_findings
  using (analysis_id in (select a.id from public.drawing_analyses a where public.user_has_project_access(a.project_id)))
  with check (analysis_id in (select a.id from public.drawing_analyses a where public.user_has_project_access(a.project_id)));
alter policy project_member_access on public.drawing_revision_deltas
  using (comparison_id in (select c.id from public.drawing_revision_comparisons c where public.user_has_project_access(c.project_id)))
  with check (comparison_id in (select c.id from public.drawing_revision_comparisons c where public.user_has_project_access(c.project_id)));
alter policy project_member_access on public.drawing_sheets
  using (analysis_id in (select a.id from public.drawing_analyses a where public.user_has_project_access(a.project_id)))
  with check (analysis_id in (select a.id from public.drawing_analyses a where public.user_has_project_access(a.project_id)));

notify pgrst, 'reload schema';
