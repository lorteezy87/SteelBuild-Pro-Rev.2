-- Fix 1: Break infinite recursion in user_projects RLS policy.
-- admins_manage_memberships was self-referential (queried user_projects from
-- within a policy on user_projects). Replace with a SECURITY DEFINER function
-- that reads user_projects bypassing RLS.
CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_projects
  WHERE user_id = auth.uid()
    AND project_id = p_project_id
  LIMIT 1;
$$;

DROP POLICY IF EXISTS admins_manage_memberships ON user_projects;

CREATE POLICY admins_manage_memberships ON user_projects
  FOR ALL
  USING (
    public.get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    public.get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin'])
  );

-- Fix 2: Bootstrap deadlock — new project INSERT was blocked because
-- admins_manage_memberships WITH CHECK required an existing membership row,
-- but none exists yet when the project is first created.
-- Solution: dedicated INSERT policy for self-membership + SECURITY INVOKER trigger.
CREATE POLICY users_insert_own_membership ON user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND get_my_project_role(project_id) IS NULL
  );

CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_projects (user_id, project_id, role)
  VALUES (auth.uid(), NEW.id, 'owner');
  RETURN NEW;
END;
$$;

-- Fix 3: admins_manage_memberships FOR ALL covered INSERT, causing its
-- WITH CHECK to conflict with bootstrap inserts on new projects.
-- Replaced with explicit UPDATE + DELETE policies only.
-- INSERT is now handled solely by users_insert_own_membership.
DROP POLICY IF EXISTS admins_manage_memberships ON user_projects;
DROP POLICY IF EXISTS users_insert_own_membership ON user_projects;

CREATE POLICY admins_update_memberships ON user_projects
  FOR UPDATE
  USING (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']))
  WITH CHECK (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']));

CREATE POLICY admins_delete_memberships ON user_projects
  FOR DELETE
  USING (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']));

CREATE POLICY users_insert_own_membership ON user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fix 4: SECURITY INVOKER trigger couldn't reliably call auth.uid() inside
-- the trigger context. Reverted to SECURITY DEFINER and added an explicit
-- postgres-role bypass policy so the trigger INSERT is never blocked by RLS.
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_projects (user_id, project_id, role)
  VALUES (auth.uid(), NEW.id, 'owner');
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS postgres_full_access ON user_projects;
CREATE POLICY postgres_full_access ON user_projects
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);
