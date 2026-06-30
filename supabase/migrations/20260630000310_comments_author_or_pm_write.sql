-- #21: tighten comments write authz to the drawing_markups author-or-PM model.
-- Prior live state (migration 20260620231716 / "i2"): a single comments_write
-- [ALL] policy gated only by user_has_project_role_at_least(project_id,'field') —
-- so ANY field+ project member could UPDATE/DELETE *another user's* comment.
-- This splits the write policy to mirror public.drawing_markups: field+ may
-- INSERT (own authorship only); UPDATE/DELETE require the comment's author OR a
-- project pm+. SELECT (comments_read, member-level) is unchanged.
--
-- Applied live via Supabase MCP (apply_migration) as version 20260630000310;
-- policy structure verified against pg_policy (read=member / insert=field+own /
-- update,delete=field+ AND (author OR pm+)). UI gating added in
-- src/components/collaboration/CommentThread.jsx (author-or-PM shows the
-- delete + status-cycle affordances; everyone else sees status read-only).

drop policy if exists comments_write on public.comments;

create policy comments_insert on public.comments for insert to public
  with check (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id is null or author_id = (select auth.uid()))
  );

create policy comments_update on public.comments for update to public
  using (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id = (select auth.uid()) or user_has_project_role_at_least(project_id, 'pm'))
  )
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy comments_delete on public.comments for delete to public
  using (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id = (select auth.uid()) or user_has_project_role_at_least(project_id, 'pm'))
  );

notify pgrst, 'reload schema';
