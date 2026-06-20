-- 20260620000000_org_members_owner_role_guard.sql
-- Close the org-member privilege-escalation path the 2026-06-19 invitation guard
-- (20260619010000) left open on the DIRECT table. organization_members
-- INSERT/UPDATE required only user_org_role_at_least(org_id,'admin') with NO
-- owner ceiling, so an org ADMIN could escalate to OWNER straight through
-- PostgREST — INSERT (org_id, <self>, 'owner') to mint owners, or UPDATE their
-- own row role 'admin' -> 'owner' to self-escalate — bypassing both the
-- invitation guard and accept_invitation. Owner is the top tenant role (org
-- delete, member management, owner-gated Stripe billing). Confirmed live on
-- prod (org_members_insert/update WITH CHECK = admin-only, no ceiling).
--
-- Fix mirrors org_invite_owner_role_guard: admins keep managing members/admins;
-- only an OWNER can create an 'owner' member row OR set a row to 'owner'. The
-- UPDATE USING owner-row guard also stops a non-owner admin from
-- demoting/hijacking an EXISTING owner's row. Legitimate flows are unaffected:
-- the first owner is inserted by create_organization (SECURITY DEFINER, bypasses
-- RLS), invited members by accept_invitation (SECURITY DEFINER), and the only
-- client-side RLS-gated write is updateMemberRole (member<->admin still passes).
--
-- NOTE: the direct-INSERT path also bypasses the plan member-limit (enforced
-- only inside accept_invitation); that billing-enforcement gap is tracked
-- separately and intentionally NOT addressed here.
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20; policies verified.

DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
CREATE POLICY org_members_insert ON public.organization_members
  FOR INSERT TO public
  WITH CHECK (
    public.user_org_role_at_least(org_id, 'admin'::text)
    AND (role <> 'owner'::text OR public.user_org_role_at_least(org_id, 'owner'::text))
  );

DROP POLICY IF EXISTS org_members_update ON public.organization_members;
CREATE POLICY org_members_update ON public.organization_members
  FOR UPDATE TO public
  USING (
    public.user_org_role_at_least(org_id, 'admin'::text)
    AND (role <> 'owner'::text OR public.user_org_role_at_least(org_id, 'owner'::text))
  )
  WITH CHECK (
    public.user_org_role_at_least(org_id, 'admin'::text)
    AND (role <> 'owner'::text OR public.user_org_role_at_least(org_id, 'owner'::text))
  );

NOTIFY pgrst, 'reload schema';
