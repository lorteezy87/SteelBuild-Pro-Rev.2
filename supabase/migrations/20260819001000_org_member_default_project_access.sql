-- Org members currently see ZERO projects until someone also adds them to
-- user_projects per project (org owners/admins are the only exception, since
-- 20260727012111). For a new teammate that means a completely empty app on
-- first sign-in — the documented open decision in TECH_DEBT.md
-- ("Org → project access model").
--
-- Decision implemented here: org members implicitly hold a workspace-level
-- DEFAULT ROLE on every org project when they have no explicit user_projects
-- row. The default is configurable per organization:
--
--   organizations.member_default_project_role
--     'viewer' (default) — members see all org projects read-only
--     'field' / 'pm'     — members get that working role by default
--     NULL               — legacy invite-only behavior (no implicit access)
--
-- An explicit user_projects row always WINS over the default (it can grant
-- more OR restrict below the default), and org owners/admins keep their
-- existing unconditional access. Archived (is_deleted) projects stay
-- invisible on every branch. RLS write policies still gate through
-- user_has_project_role_at_least, so a 'viewer' default grants no writes.

BEGIN;

-- ── Column + constraint ──────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS member_default_project_role text DEFAULT 'viewer';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_org_member_default_project_role;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_member_default_project_role
  CHECK (
    member_default_project_role IS NULL
    OR member_default_project_role IN ('viewer', 'field', 'pm')
  );

-- Existing orgs get the new default too: the whole point is that the founding
-- workspace's next hire sees the org's projects instead of an empty app.
UPDATE public.organizations
   SET member_default_project_role = 'viewer'
 WHERE member_default_project_role IS NULL;

-- ── user_has_project_access: org default grants visibility ──────────────────
-- (keeps the is_deleted gate and initplan-safe (select auth.uid()) from
-- 20260727012111)

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.organization_members om
      ON om.org_id = p.org_id
     AND om.user_id = (SELECT auth.uid())
    JOIN public.organizations o
      ON o.id = p.org_id
    WHERE p.id = p_project_id
      AND COALESCE(p.is_deleted, false) = false
      AND (
        om.role IN ('owner', 'admin')
        OR o.member_default_project_role IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.user_projects up
          WHERE up.project_id = p.id
            AND up.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_project_access(uuid) TO authenticated;

-- ── get_my_project_role: explicit row → org owner/admin → org default ────────

CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_projects
       WHERE user_id = (SELECT auth.uid()) AND project_id = p_project_id
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

GRANT EXECUTE ON FUNCTION public.get_my_project_role(uuid) TO authenticated;

-- ── user_has_project_role_at_least: org default participates in the ladder ──
-- Effective role resolution mirrors get_my_project_role exactly: an explicit
-- user_projects row WINS (even if lower than the org default), otherwise the
-- org default applies. Org owner/admin keep the unconditional bypass.

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH role_levels(name, level) AS (
    VALUES ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), explicit_role AS (
    SELECT rl.level
      FROM public.user_projects up
      JOIN role_levels rl ON rl.name = up.role
     WHERE up.user_id    = (SELECT auth.uid())
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

GRANT EXECUTE ON FUNCTION public.user_has_project_role_at_least(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
