-- LOCAL CANDIDATE. Review, apply, and ledger-stamp this exact file manually.
-- Never db push/repair on the shared database. Coordinate both application callers.
-- Existing editable mailbox addresses are NOT evidence of provider authorization.
-- No bindings are backfilled. Sending stays disabled until a trusted operator
-- verifies workspace ownership, provider consent/scope and the precise identity.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.email_accounts IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA steelbuild_email_private;
REVOKE ALL ON SCHEMA steelbuild_email_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE steelbuild_email_private.mailbox_credentials (
  account_id uuid PRIMARY KEY REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE steelbuild_email_private.mailbox_bindings (
  account_id uuid PRIMARY KEY REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_address text NOT NULL CHECK (
    email_address = lower(btrim(email_address)) AND
    email_address ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
  ),
  account_provider text NOT NULL,
  connection_type text NOT NULL,
  send_provider text NOT NULL CHECK (send_provider IN ('resend','msgraph','inbound_only')),
  -- Nonsecret configuration generation, matched by the Edge environment.
  -- A provider tenant/application change must use a NEW connection identifier.
  provider_connection_id text NOT NULL CHECK (length(btrim(provider_connection_id)) > 0),
  verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by text NOT NULL CHECK (length(btrim(verified_by)) > 0),
  verification_reference text NOT NULL CHECK (length(btrim(verification_reference)) > 0),
  revoked_at timestamptz
);
ALTER TABLE steelbuild_email_private.mailbox_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE steelbuild_email_private.mailbox_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA steelbuild_email_private FROM PUBLIC, anon, authenticated, service_role;
-- No direct Data API role policies/grants, including service_role. The only
-- privileged runtime access is through the explicitly granted functions below.
-- Binding creation/revocation is a trusted operator SQL operation, not a client RPC.

INSERT INTO steelbuild_email_private.mailbox_credentials(account_id,access_token,refresh_token,token_expires_at)
SELECT id,access_token,refresh_token,token_expires_at FROM public.email_accounts
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR token_expires_at IS NOT NULL;
-- No CASCADE: an unexpected view/function dependency must stop this migration
-- for review rather than silently dropping a shared caller.
ALTER TABLE public.email_accounts DROP COLUMN access_token, DROP COLUMN refresh_token, DROP COLUMN token_expires_at;

REVOKE ALL ON public.email_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO authenticated, service_role;
CREATE POLICY email_accounts_pm_insert ON public.email_accounts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id) AND public.user_has_project_role_at_least(project_id,'pm'));
CREATE POLICY email_accounts_pm_update ON public.email_accounts AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id) AND public.user_has_project_role_at_least(project_id,'pm'))
  WITH CHECK (public.user_has_project_access(project_id) AND public.user_has_project_role_at_least(project_id,'pm'));
CREATE POLICY email_accounts_pm_delete ON public.email_accounts AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_project_access(project_id) AND public.user_has_project_role_at_least(project_id,'pm'));

CREATE FUNCTION steelbuild_email_private.invalidate_mailbox_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'Mailbox identity and project cannot be reassigned' USING ERRCODE='23514';
  END IF;
  IF NEW.email_address IS DISTINCT FROM OLD.email_address OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.connection_type IS DISTINCT FROM OLD.connection_type THEN
    DELETE FROM steelbuild_email_private.mailbox_bindings WHERE account_id=OLD.id;
    DELETE FROM steelbuild_email_private.mailbox_credentials WHERE account_id=OLD.id;
  ELSIF OLD.is_active AND NOT NEW.is_active THEN
    DELETE FROM steelbuild_email_private.mailbox_bindings WHERE account_id=OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION steelbuild_email_private.invalidate_mailbox_binding() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER invalidate_mailbox_binding BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION steelbuild_email_private.invalidate_mailbox_binding();

CREATE FUNCTION steelbuild_email_private.verified_mailboxes(p_project_id uuid)
RETURNS TABLE(account_id uuid,email_address text,display_name text,send_provider text,provider_connection_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id,b.email_address,a.display_name,b.send_provider,b.provider_connection_id
  FROM public.email_accounts a
  JOIN public.projects p ON p.id=a.project_id
  JOIN steelbuild_email_private.mailbox_bindings b ON b.account_id=a.id
  WHERE a.project_id=p_project_id AND a.is_active AND NOT p.is_deleted
    AND b.project_id=a.project_id AND b.org_id=p.org_id
    AND b.email_address=lower(btrim(a.email_address))
    AND b.account_provider=a.provider AND b.connection_type=a.connection_type
    AND b.revoked_at IS NULL
  ORDER BY a.id;
$$;
REVOKE ALL ON FUNCTION steelbuild_email_private.verified_mailboxes(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_verified_email_mailboxes(p_project_id uuid)
RETURNS TABLE(account_id uuid,email_address text,display_name text,send_provider text,provider_connection_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM steelbuild_email_private.verified_mailboxes(p_project_id);
$$;
REVOKE ALL ON FUNCTION public.get_verified_email_mailboxes(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_verified_email_mailboxes(uuid) TO service_role;

-- Safe status for the existing metadata UI, checked against the caller's
-- current project authority. Never returns credentials or verification evidence.
CREATE FUNCTION public.get_email_account_verification(p_project_id uuid)
RETURNS TABLE(account_id uuid,verified boolean,send_provider text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id,v.account_id IS NOT NULL,v.send_provider
  FROM public.email_accounts a
  LEFT JOIN steelbuild_email_private.verified_mailboxes(p_project_id) v ON v.account_id=a.id
  WHERE a.project_id=p_project_id AND public.user_has_project_access(p_project_id);
$$;
REVOKE ALL ON FUNCTION public.get_email_account_verification(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_email_account_verification(uuid) TO authenticated;

-- OAuth is not currently exposed in the UI. Preserve credentials for trusted
-- refresh integrations, but release them only for a still-verified identity.
CREATE FUNCTION public.get_email_account_credentials(p_account_id uuid)
RETURNS TABLE(access_token text,refresh_token text,token_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.access_token,c.refresh_token,c.token_expires_at
  FROM steelbuild_email_private.mailbox_credentials c
  JOIN public.email_accounts a ON a.id=c.account_id
  JOIN LATERAL steelbuild_email_private.verified_mailboxes(a.project_id) v ON v.account_id=a.id
  WHERE c.account_id=p_account_id;
$$;
REVOKE ALL ON FUNCTION public.get_email_account_credentials(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_email_account_credentials(uuid) TO service_role;

CREATE FUNCTION public.store_email_account_credentials(p_account_id uuid,p_access_token text,p_refresh_token text,p_token_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project uuid;
BEGIN
  -- Serialize refresh with client identity edits/deactivation. If the edit
  -- commits first, verification fails; if refresh commits first, the edit clears it.
  SELECT project_id INTO v_project FROM public.email_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM steelbuild_email_private.verified_mailboxes(v_project) WHERE account_id=p_account_id) THEN
    RAISE EXCEPTION 'Mailbox is not verified' USING ERRCODE='42501';
  END IF;
  INSERT INTO steelbuild_email_private.mailbox_credentials(account_id,access_token,refresh_token,token_expires_at)
    VALUES(p_account_id,p_access_token,p_refresh_token,p_token_expires_at)
  ON CONFLICT(account_id) DO UPDATE SET access_token=EXCLUDED.access_token,
    refresh_token=EXCLUDED.refresh_token,token_expires_at=EXCLUDED.token_expires_at,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.store_email_account_credentials(uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_email_account_credentials(uuid,text,text,timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
