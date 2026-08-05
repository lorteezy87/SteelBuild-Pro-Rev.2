-- 079_user_project_roles.sql
-- RBAC Phase B: Tighten user_projects.role and add role-aware helpers.
-- 'owner' is treated as a synonym for 'admin' (existing 15 rows are all 'owner').

-- 1. Defensive: verify no row violates the new whitelist
DO $$
DECLARE bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
    FROM public.user_projects
   WHERE role NOT IN ('owner','admin','pm','field','viewer');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'user_projects has % rows with role outside the new whitelist', bad_count;
  END IF;
END $$;

-- 2. Tighten the column
ALTER TABLE public.user_projects
  ALTER COLUMN role SET DEFAULT 'pm';

ALTER TABLE public.user_projects
  DROP CONSTRAINT IF EXISTS user_projects_role_check;

ALTER TABLE public.user_projects
  ADD CONSTRAINT user_projects_role_check
  CHECK (role IN ('owner','admin','pm','field','viewer'));

-- 3. Index for role-aware lookups
CREATE INDEX IF NOT EXISTS idx_user_projects_user_role
  ON public.user_projects(user_id, role);

-- 4. Helpers — owner==admin synonym is baked into the level table
CREATE OR REPLACE FUNCTION public.user_has_project_role(
  p_project_id uuid,
  p_role       text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_projects up
     WHERE up.user_id    = auth.uid()
       AND up.project_id = p_project_id
       AND up.role       = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(
  p_project_id uuid,
  p_min_role   text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH role_levels(name, level) AS (
    -- owner is treated as admin (3) - see RBAC sprint Phase A report.
    -- Both names map to the same numeric level so existing 'owner'
    -- rows on user_projects pass any 'admin'-or-higher check.
    VALUES ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), my_role AS (
    SELECT rl.level
      FROM public.user_projects up
      JOIN role_levels rl ON rl.name = up.role
     WHERE up.user_id    = auth.uid()
       AND up.project_id = p_project_id
  ), required AS (
    SELECT level FROM role_levels WHERE name = p_min_role
  )
  SELECT EXISTS (
    SELECT 1 FROM my_role m, required r WHERE m.level >= r.level
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_project_admin(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.user_has_project_role_at_least(p_project_id, 'admin');
$$;

-- 5. Grants — match the existing helper grant pattern
GRANT EXECUTE ON FUNCTION public.user_has_project_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_project_role_at_least(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_project_admin(uuid) TO authenticated;
