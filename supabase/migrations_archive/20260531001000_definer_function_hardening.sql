-- Definer-function hardening (audit M2 + L1).
--
-- M2: handle_new_user() runs SECURITY DEFINER on every auth.users insert but
-- never pinned its search_path — the injection vector the engineering contract
-- forbids (every other definer function was hardened; this one was missed).
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

-- L1: trigger functions were exposed as callable RPCs to anon/authenticated via
-- PostgREST. They are only meant to fire from table triggers (which run as the
-- table owner regardless of EXECUTE grants), so revoking REST EXECUTE removes
-- the public RPC surface without affecting the triggers.
REVOKE EXECUTE ON FUNCTION public.drawing_watch_notify_impact()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.drawing_watch_notify_revision() FROM anon, authenticated, public;

-- publish_drawing_revision already self-guards (user_has_project_access →
-- raises 42501), and the client calls it as an authenticated user
-- (usePublishRevision.ts). Keep `authenticated`, drop the needless `anon` grant.
REVOKE EXECUTE ON FUNCTION public.publish_drawing_revision(uuid, text) FROM anon;

NOTIFY pgrst, 'reload schema';
