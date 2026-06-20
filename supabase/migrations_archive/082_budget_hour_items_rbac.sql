-- 082_budget_hour_items_rbac.sql
-- Tighten budget_hour_items RLS so project members can read,
-- but only PM/Admin/Owner roles can write.

ALTER TABLE public.budget_hour_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_member_access" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_select" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_insert" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_update" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_delete" ON public.budget_hour_items;

CREATE POLICY "budget_hour_items_select" ON public.budget_hour_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = budget_hour_items.project_id
    )
  );

CREATE POLICY "budget_hour_items_insert" ON public.budget_hour_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

CREATE POLICY "budget_hour_items_update" ON public.budget_hour_items
  FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

CREATE POLICY "budget_hour_items_delete" ON public.budget_hour_items
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));
