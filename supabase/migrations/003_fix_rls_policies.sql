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

-- Fix 5: Replace unreliable AFTER trigger with an atomic RPC function.
-- The trigger approach had auth.uid() reliability issues in SECURITY DEFINER context.
-- The RPC (create_project) runs as postgres via SECURITY DEFINER, inserts both
-- the project row and the owner membership in one call, and returns the project.
DROP TRIGGER IF EXISTS trg_auto_add_project_owner ON projects;

CREATE OR REPLACE FUNCTION public.create_project(project_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_project_id uuid; v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO projects (name,project_number,client,general_contractor,engineer_of_record,project_manager,superintendent,contract_type,original_contract_value,start_date,target_completion_date,forecast_completion_date,phase,health_status,retainage_percent,contingency_amount,address,notes,metadata)
  SELECT (project_data->>'name'),(project_data->>'project_number'),(project_data->>'client'),(project_data->>'general_contractor'),(project_data->>'engineer_of_record'),(project_data->>'project_manager'),(project_data->>'superintendent'),(project_data->>'contract_type'),(project_data->>'original_contract_value')::numeric,(project_data->>'start_date')::date,(project_data->>'target_completion_date')::date,(project_data->>'forecast_completion_date')::date,COALESCE(project_data->>'phase','Pre-Construction'),COALESCE(project_data->>'health_status','On Track'),COALESCE((project_data->>'retainage_percent')::numeric,10),(project_data->>'contingency_amount')::numeric,(project_data->>'address'),(project_data->>'notes'),COALESCE((project_data->'metadata')::jsonb,'{}'::jsonb)
  RETURNING id INTO v_project_id;
  INSERT INTO user_projects (user_id,project_id,role) VALUES (v_user_id,v_project_id,'owner');
  SELECT to_jsonb(p) INTO v_result FROM projects p WHERE p.id = v_project_id;
  RETURN v_result;
END;$$;
GRANT EXECUTE ON FUNCTION public.create_project(jsonb) TO authenticated;
