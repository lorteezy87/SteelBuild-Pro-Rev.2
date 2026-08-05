-- enforce_org_invite_limit() is a trigger function only (fires on
-- organization_invitations INSERT); it must not be callable directly via the
-- PostgREST /rpc API. Revoke EXECUTE from client roles to match the other locked
-- trigger functions (advisor 0028/0029). The BEFORE INSERT trigger still fires
-- regardless — EXECUTE governs only direct /rpc calls, not trigger invocation.
-- Applied live 2026-06-18.
revoke execute on function public.enforce_org_invite_limit() from public, anon, authenticated;
