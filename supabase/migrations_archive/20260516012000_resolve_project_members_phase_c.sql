-- Resolve RBAC Phase C project-member management debt:
-- - system-admin membership RLS that matches the UI contract
-- - project-admin access to the Project Members surface
-- - durable member_activity audit rows for membership changes

BEGIN;

CREATE OR REPLACE FUNCTION public.user_is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_system_admin() TO authenticated;

-- System admins need read access to the project picker even when they are
-- not members of every project. Existing project-member policies remain.
DROP POLICY IF EXISTS project_select_system_admin ON public.projects;
CREATE POLICY project_select_system_admin
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (public.user_is_system_admin());

-- Let project admins see the full roster for projects they administer, while
-- preserving the existing "users see their own membership row" policy.
DROP POLICY IF EXISTS admins_select_memberships ON public.user_projects;
CREATE POLICY admins_select_memberships
  ON public.user_projects
  FOR SELECT
  TO authenticated
  USING (
    public.user_is_system_admin()
    OR public.user_has_project_role_at_least(project_id, 'admin')
  );

DROP POLICY IF EXISTS admins_insert_memberships ON public.user_projects;
CREATE POLICY admins_insert_memberships
  ON public.user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.user_is_system_admin()
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
    AND role IN ('owner', 'admin', 'pm', 'field', 'viewer')
  );

DROP POLICY IF EXISTS admins_update_memberships ON public.user_projects;
CREATE POLICY admins_update_memberships
  ON public.user_projects
  FOR UPDATE
  TO authenticated
  USING (
    public.user_is_system_admin()
    OR public.user_has_project_role_at_least(project_id, 'admin')
  )
  WITH CHECK (
    (
      public.user_is_system_admin()
      OR public.user_has_project_role_at_least(project_id, 'admin')
    )
    AND role IN ('owner', 'admin', 'pm', 'field', 'viewer')
  );

DROP POLICY IF EXISTS admins_delete_memberships ON public.user_projects;
CREATE POLICY admins_delete_memberships
  ON public.user_projects
  FOR DELETE
  TO authenticated
  USING (
    public.user_is_system_admin()
    OR public.user_has_project_role_at_least(project_id, 'admin')
  );

-- Membership rows should be retargeted by deleting/recreating them, not by
-- mutating their user/project identity under an existing id.
CREATE OR REPLACE FUNCTION public.enforce_user_projects_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Membership user_id and project_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_projects_membership_identity_check ON public.user_projects;
CREATE TRIGGER user_projects_membership_identity_check
  BEFORE UPDATE OF user_id, project_id ON public.user_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_projects_membership_identity();

CREATE TABLE IF NOT EXISTS public.member_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  event_type text NOT NULL CHECK (
    event_type IN ('member_added', 'role_changed', 'member_removed')
  ),
  old_role text,
  new_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_member_activity_project_created
  ON public.member_activity(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_activity_target_user
  ON public.member_activity(target_user_id);

ALTER TABLE public.member_activity ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.member_activity TO authenticated;

DROP POLICY IF EXISTS member_activity_select_project_members ON public.member_activity;
CREATE POLICY member_activity_select_project_members
  ON public.member_activity
  FOR SELECT
  TO authenticated
  USING (
    public.user_is_system_admin()
    OR public.user_has_project_access(project_id)
  );

DROP POLICY IF EXISTS member_activity_insert_admins ON public.member_activity;
CREATE POLICY member_activity_insert_admins
  ON public.member_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_system_admin()
    OR public.user_has_project_role_at_least(project_id, 'admin')
  );

CREATE OR REPLACE FUNCTION public.log_user_project_member_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_email text;
  v_target_user_id uuid;
  v_target_email text;
  v_project_id uuid;
  v_event_type text;
  v_old_role text;
  v_new_role text;
  v_membership_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_project_id := NEW.project_id;
    v_target_user_id := NEW.user_id;
    v_event_type := 'member_added';
    v_new_role := NEW.role;
    v_membership_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
      RETURN NEW;
    END IF;
    v_project_id := NEW.project_id;
    v_target_user_id := NEW.user_id;
    v_event_type := 'role_changed';
    v_old_role := OLD.role;
    v_new_role := NEW.role;
    v_membership_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
    v_target_user_id := OLD.user_id;
    v_event_type := 'member_removed';
    v_old_role := OLD.role;
    v_membership_id := OLD.id;
  END IF;

  SELECT email INTO v_actor_email
  FROM public.user_profiles
  WHERE id = v_actor_user_id;

  SELECT email INTO v_target_email
  FROM public.user_profiles
  WHERE id = v_target_user_id;

  INSERT INTO public.member_activity (
    project_id,
    actor_user_id,
    actor_email,
    target_user_id,
    target_email,
    event_type,
    old_role,
    new_role,
    metadata
  )
  VALUES (
    v_project_id,
    v_actor_user_id,
    v_actor_email,
    v_target_user_id,
    v_target_email,
    v_event_type,
    v_old_role,
    v_new_role,
    jsonb_build_object(
      'source', 'user_projects_trigger',
      'user_project_id', v_membership_id
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_projects_member_activity_log ON public.user_projects;
CREATE TRIGGER user_projects_member_activity_log
  AFTER INSERT OR UPDATE OF role OR DELETE ON public.user_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_project_member_activity();

NOTIFY pgrst, 'reload schema';

COMMIT;
