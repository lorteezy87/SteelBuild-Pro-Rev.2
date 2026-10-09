-- LOCAL CANDIDATE: manual, reviewed application only; never db push/repair.
-- Project memberships can outlive workspace membership. Every role resolver
-- must require current membership before trusting an explicit user_projects
-- role, including SECURITY DEFINER callers that bypass ordinary project RLS.
-- Keep archived projects eligible: current admins need their role for erasure.
-- Preserve existing role precedence and EXECUTE grants (CREATE OR REPLACE).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.user_has_project_role(p_project_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_projects up
      JOIN public.projects p ON p.id = up.project_id
      JOIN public.organization_members om
        ON om.org_id = p.org_id AND om.user_id = up.user_id
     WHERE up.user_id = (SELECT auth.uid())
       AND up.project_id = p_project_id
       AND up.role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT up.role
       FROM public.user_projects up
       JOIN public.projects p ON p.id = up.project_id
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = up.user_id
      WHERE up.user_id = (SELECT auth.uid()) AND up.project_id = p_project_id
      LIMIT 1),
    (SELECT om.role FROM public.projects p
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      WHERE p.id = p_project_id AND om.role IN ('owner', 'admin')
      LIMIT 1),
    (SELECT o.member_default_project_role
       FROM public.projects p
       JOIN public.organizations o ON o.id = p.org_id
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      WHERE p.id = p_project_id
      LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH role_levels(name, level) AS (
    VALUES ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), explicit_role AS (
    SELECT rl.level
      FROM public.user_projects up
      JOIN public.projects p ON p.id = up.project_id
      JOIN public.organization_members om
        ON om.org_id = p.org_id AND om.user_id = up.user_id
      JOIN role_levels rl ON rl.name = up.role
     WHERE up.user_id = (SELECT auth.uid())
       AND up.project_id = p_project_id
  ), default_role AS (
    SELECT rl.level
      FROM public.projects p
      JOIN public.organizations o ON o.id = p.org_id
      JOIN public.organization_members om
        ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
      JOIN role_levels rl ON rl.name = o.member_default_project_role
     WHERE p.id = p_project_id
  ), required AS (
    SELECT level FROM role_levels WHERE name = p_min_role
  )
  SELECT EXISTS (
           SELECT 1
             FROM public.projects p
             JOIN public.organization_members om
               ON om.org_id = p.org_id AND om.user_id = (SELECT auth.uid())
            WHERE p.id = p_project_id
              AND om.role IN ('owner', 'admin')
         )
      OR EXISTS (
           SELECT 1 FROM explicit_role m, required r WHERE m.level >= r.level
         )
      OR (
           NOT EXISTS (SELECT 1 FROM explicit_role)
           AND EXISTS (SELECT 1 FROM default_role d, required r WHERE d.level >= r.level)
         );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
