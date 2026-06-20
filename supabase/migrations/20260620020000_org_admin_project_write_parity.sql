-- 20260620020000_org_admin_project_write_parity.sql
-- I3: an org owner/admin who joined by INVITE (no user_projects row) could READ
-- every org project (user_has_project_access grants org owners/admins access) but
-- every WRITE was silently RLS-rejected, and the UI hid all write controls,
-- because the write gate user_has_project_role_at_least AND the UI role source
-- get_my_project_role both resolved the caller's level ONLY from user_projects,
-- with no org override. An org owner/admin thus saw all org projects but could
-- not act on any they weren't explicitly granted.
--
-- Per the chosen model (org owners/admins control every project in their org),
-- give BOTH helpers the same org override user_has_project_access already has,
-- so READ + WRITE + the UI agree. Org 'member' gets no override (explicit
-- per-project grants only). owner/admin are level 3 (project-admin) here.
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20; both defs verified.

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH role_levels(name, level) AS (
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
  -- Org owners/admins implicitly hold admin-level on every project in their org
  -- (mirrors user_has_project_access), so an invited org admin can WRITE the org
  -- projects they can already READ. Org 'member' falls through to user_projects.
  SELECT EXISTS (
           SELECT 1
             FROM public.projects p
             JOIN public.organization_members om
               ON om.org_id = p.org_id AND om.user_id = auth.uid()
            WHERE p.id = p_project_id
              AND om.role IN ('owner', 'admin')
         )
      OR EXISTS (
           SELECT 1 FROM my_role m, required r WHERE m.level >= r.level
         );
$function$;

CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- An explicit user_projects grant wins (any of owner/admin/pm/field/viewer);
  -- otherwise an org owner/admin implicitly holds that role on every project in
  -- their org, so the UI shows the same write controls RLS now allows (I3).
  SELECT COALESCE(
    (SELECT role FROM public.user_projects
       WHERE user_id = auth.uid() AND project_id = p_project_id
       LIMIT 1),
    (SELECT om.role FROM public.projects p
       JOIN public.organization_members om
         ON om.org_id = p.org_id AND om.user_id = auth.uid()
      WHERE p.id = p_project_id AND om.role IN ('owner', 'admin')
      LIMIT 1)
  );
$function$;
