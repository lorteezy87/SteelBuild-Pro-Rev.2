-- 20260619010000_org_invite_owner_role_guard.sql
-- Tighten organization_invitations INSERT so only an org OWNER can create an
-- 'owner'-role invitation. The prior policy required only
-- user_org_role_at_least(org_id,'admin') with no role ceiling, so an org ADMIN
-- could mint an 'owner' invite — and accept_invitation (SECURITY DEFINER) would
-- then make the invitee a full org owner (privilege escalation). Admins keep
-- inviting members/admins; only owners can invite owners. The onboarding
-- hand-off UI also clamps the role, but the DB boundary is authoritative.
-- invited_by self-check preserved.
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-19; policy verified.

DROP POLICY IF EXISTS org_invites_insert ON public.organization_invitations;
CREATE POLICY org_invites_insert ON public.organization_invitations
  FOR INSERT TO public
  WITH CHECK (
    public.user_org_role_at_least(org_id, 'admin'::text)
    AND (invited_by = (SELECT auth.uid()))
    AND (role <> 'owner'::text OR public.user_org_role_at_least(org_id, 'owner'::text))
  );
