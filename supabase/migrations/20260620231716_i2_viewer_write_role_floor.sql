-- I2: add a write role-floor to 5 legacy tables that were viewer-writable.
-- Each carried a single legacy `project_member_access [ALL]` policy gated only by
-- user_has_project_access(...) — true for ANY project member, INCLUDING viewers
-- (read-only stakeholders). So a viewer could INSERT/UPDATE/DELETE comments,
-- submittal_activity, task_dependencies, delivery_items, and drawing_sheets.
-- In-org only (not cross-tenant), but it lets a read-only role mutate project data.
-- Fix: split each ALL policy into a member-SELECT (read unchanged) + a write-ALL
-- gated by user_has_project_role_at_least(..., 'field') — field/pm/admin/owner and
-- org owners/admins may write; viewers may only read. SELECT stays permissive via
-- the read policy (policies OR), so viewers keep read access.
-- (drawing_sheets/drawing_analyses are the dead DrawingAnalysis tables; floored for
-- consistency since the policy still exists.)
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20 as version
-- 20260620231716; structurally verified (read=member / write=FLOOR on all 5) and
-- behavior-verified against a real viewer (can_read=true, can_write=false).

-- comments
drop policy if exists project_member_access on public.comments;
create policy comments_read  on public.comments for select to public
  using (user_has_project_access(project_id));
create policy comments_write on public.comments for all to public
  using      (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

-- submittal_activity
drop policy if exists project_member_access on public.submittal_activity;
create policy submittal_activity_read  on public.submittal_activity for select to public
  using (user_has_project_access(project_id));
create policy submittal_activity_write on public.submittal_activity for all to public
  using      (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

-- task_dependencies
drop policy if exists project_member_access on public.task_dependencies;
create policy task_dependencies_read  on public.task_dependencies for select to public
  using (user_has_project_access(project_id));
create policy task_dependencies_write on public.task_dependencies for all to public
  using      (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

-- delivery_items (project resolved via the parent delivery)
drop policy if exists project_member_access on public.delivery_items;
create policy delivery_items_read  on public.delivery_items for select to public
  using (delivery_id in (select d.id from public.deliveries d where user_has_project_access(d.project_id)));
create policy delivery_items_write on public.delivery_items for all to public
  using      (delivery_id in (select d.id from public.deliveries d where user_has_project_role_at_least(d.project_id, 'field')))
  with check (delivery_id in (select d.id from public.deliveries d where user_has_project_role_at_least(d.project_id, 'field')));

-- drawing_sheets (project resolved via the parent drawing_analyses; dead tables)
drop policy if exists project_member_access on public.drawing_sheets;
create policy drawing_sheets_read  on public.drawing_sheets for select to public
  using (analysis_id in (select a.id from public.drawing_analyses a where user_has_project_access(a.project_id)));
create policy drawing_sheets_write on public.drawing_sheets for all to public
  using      (analysis_id in (select a.id from public.drawing_analyses a where user_has_project_role_at_least(a.project_id, 'field')))
  with check (analysis_id in (select a.id from public.drawing_analyses a where user_has_project_role_at_least(a.project_id, 'field')));

notify pgrst, 'reload schema';
