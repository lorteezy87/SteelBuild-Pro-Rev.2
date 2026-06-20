-- Close the anonymous-callable SECURITY DEFINER function exposure (Supabase
-- advisor lint 0028) for the clearly-safe subset. Applied live 2026-06-16 via
-- Supabase MCP; captured here so repo and live stay in sync.
--
-- Verified safe before applying:
--   • org_protect_billing_columns() / vendors_set_org() return `trigger` and are
--     referenced by NO RLS policy. Trigger execution does not check the invoking
--     user's EXECUTE privilege, so dropping the PUBLIC grant closes their
--     /rest/v1/rpc endpoints with zero functional impact.
--   • founding_org_id() is referenced ONLY by the app-files storage policies
--     (auth_read / auth_upload, both TO authenticated) and is never client-called
--     (no supabase.rpc("founding_org_id") anywhere). Re-granting to authenticated
--     keeps those policies working; anon loses only the RPC endpoint.
--
-- The broader anon-definer helpers (user_is_org_member, user_org_role_at_least,
-- users_share_org) are deliberately NOT touched here: they back the TO-public
-- organization/invitation policies and the onboarding flow, so they need a
-- separate, carefully-verified pass.

revoke all on function public.org_protect_billing_columns() from public;
revoke all on function public.vendors_set_org() from public;

revoke all on function public.founding_org_id() from public;
grant execute on function public.founding_org_id() to authenticated, service_role;
