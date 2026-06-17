-- Close the anon-executable surface on internal SECURITY DEFINER functions
-- flagged by Supabase advisor lint 0028 (anon can call them via /rest/v1/rpc/).
--
-- Classification verified 2026-06-16:
--   * The client never .rpc()-calls any of these (grep of src for supabase.rpc:
--     only create_project / delete_drawing_set / get_next_sequence_number /
--     publish_drawing_revision / get_my_project_role are client-invoked).
--   * anon has NO table privilege on organizations / organization_members /
--     organization_invitations (has_table_privilege = false), and the app only
--     reaches org data pre-login through the definer RPCs get_invitation /
--     accept_invitation. So anon never evaluates the TO-public org policies that
--     call these helpers -> revoking anon is behaviorally inert for anon.
--   * Trigger functions fire via the trigger system regardless of EXECUTE, so the
--     grant can be revoked from every client role with no effect on the triggers.
--   * RLS helpers keep EXECUTE for `authenticated` (policies evaluate as
--     authenticated); onboarding / invite-accept mutations both use auth.uid() and
--     run post-login, so authenticated keeps them too -> signed-in behavior is
--     unchanged.
--   * get_invitation intentionally stays anon-callable: the accept screen previews
--     the invite before the recipient has signed in.
--
-- Applied live 2026-06-16 via Supabase MCP.

-- Trigger functions — revoke from every client role (firing bypasses EXECUTE).
revoke all on function public.org_protect_billing_columns() from anon, authenticated, public;
revoke all on function public.vendors_set_org() from anon, authenticated, public;

-- Internal RLS helpers — deny anon, keep authenticated for policy evaluation.
revoke all on function public.founding_org_id() from anon, public;
grant execute on function public.founding_org_id() to authenticated;

revoke all on function public.user_is_org_member(uuid) from anon, public;
grant execute on function public.user_is_org_member(uuid) to authenticated;

revoke all on function public.user_org_role_at_least(uuid, text) from anon, public;
grant execute on function public.user_org_role_at_least(uuid, text) to authenticated;

revoke all on function public.users_share_org(uuid, uuid) from anon, public;
grant execute on function public.users_share_org(uuid, uuid) to authenticated;

-- Onboarding / invite mutations — both use auth.uid(); must be signed in. Deny anon.
revoke all on function public.create_organization(text, text) from anon, public;
grant execute on function public.create_organization(text, text) to authenticated;

revoke all on function public.accept_invitation(uuid) from anon, public;
grant execute on function public.accept_invitation(uuid) to authenticated;
