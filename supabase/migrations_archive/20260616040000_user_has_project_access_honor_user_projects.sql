-- Make user_has_project_access honor user_projects for org MEMBERS, so a per-project
-- grant actually scopes reads. Org owners/admins keep all-org visibility (admin
-- override). Applied live 2026-06-16 via Supabase MCP + field-verified; captured
-- here so repo and live stay in sync.
--
-- BEFORE: the function checked org membership ONLY, so ANY org member could read
-- EVERY project in the org — the project list (projects.project_select uses this
-- function) AND all ~70 project-scoped tables that gate SELECT on it. user_projects
-- (the per-project viewer/field/pm/admin role) had NO effect on reads; it only
-- mattered where policies separately check user_has_project_role_at_least (writes).
--
-- AFTER: org owners/admins still see every project in the org; org members see only
-- the projects they hold a user_projects grant on. This is the intended model
-- ("user_projects authoritative for project data").
--
-- Verified safe before applying (only two org members existed):
--   • nickl@ (org OWNER, grants on all 8 active projects) — unaffected (owner override).
--   • mcp-agent (org member, single Capstone grant) — correctly scoped to Capstone.
-- Field-verified after: mcp-agent went 8→1 projects, 275→69 RFIs, all COs→1.
--
-- IMPLICATION: new org members now see NO projects until granted via user_projects
-- (Project Members), where previously org membership exposed everything.
CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.projects p
    join public.organization_members om
      on om.org_id = p.org_id
     and om.user_id = auth.uid()
    where p.id = p_project_id
      and (
        om.role in ('owner', 'admin')
        or exists (
          select 1 from public.user_projects up
          where up.project_id = p.id and up.user_id = auth.uid()
        )
      )
  );
$function$;
