-- 081_photos_rbac_policies.sql
-- Enforce app RBAC model for photos at the database layer.
-- view/select: project member
-- create/insert: field+
-- edit/update: field+
-- delete: admin

DROP POLICY IF EXISTS project_member_access ON public.photos;
DROP POLICY IF EXISTS photos_select ON public.photos;
DROP POLICY IF EXISTS photos_insert ON public.photos;
DROP POLICY IF EXISTS photos_update ON public.photos;
DROP POLICY IF EXISTS photos_delete ON public.photos;

CREATE POLICY photos_select
  ON public.photos FOR SELECT
  USING (public.user_has_project_access(project_id));

CREATE POLICY photos_insert
  ON public.photos FOR INSERT
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY photos_update
  ON public.photos FOR UPDATE
  USING (public.user_has_project_role_at_least(project_id, 'field'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'field'));

CREATE POLICY photos_delete
  ON public.photos FOR DELETE
  USING (public.user_has_project_role_at_least(project_id, 'admin'));
