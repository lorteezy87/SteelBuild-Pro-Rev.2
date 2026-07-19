-- Normalize the email_* tables' non-canonical RLS to the canonical user_has_project_access
-- helper, matching the other ~70 project-scoped tables. They used a single FOR ALL policy
-- gated by EXISTS(SELECT 1 FROM projects p WHERE p.id=project_id AND NOT p.is_deleted),
-- which only checks the project row exists and relies on projects' OWN RLS to scope.
-- Same effective access (any project member, read+write -- consistent with the app's
-- inbox UI), but tenant isolation no longer depends on the nested projects RLS.
drop policy if exists "Users can manage email accounts for their projects" on public.email_accounts;
create policy email_accounts_project_access on public.email_accounts
  for all to authenticated
  using (user_has_project_access(project_id))
  with check (user_has_project_access(project_id));

drop policy if exists "Users can view and manage email messages for their projects" on public.email_messages;
create policy email_messages_project_access on public.email_messages
  for all to authenticated
  using (user_has_project_access(project_id))
  with check (user_has_project_access(project_id));

drop policy if exists "Users can view and manage email attachments for their projects" on public.email_attachments;
create policy email_attachments_project_access on public.email_attachments
  for all to authenticated
  using (user_has_project_access(project_id))
  with check (user_has_project_access(project_id));
