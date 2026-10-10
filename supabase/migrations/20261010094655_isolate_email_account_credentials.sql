-- LOCAL CANDIDATE: manual, reviewed application only; never db push/repair.
-- Move mailbox OAuth material out of the project-readable public account row.
-- The product currently uses email_accounts only for connection metadata; a
-- future OAuth flow must expose narrowly scoped SECURITY DEFINER operations
-- rather than granting browser or service-role table access to these secrets.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.email_account_credentials (
  account_id uuid PRIMARY KEY
    REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.email_account_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.email_account_credentials
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve every existing credential value before removing the exposed
-- columns. Manual-forward accounts with no credential material need no row.
INSERT INTO private.email_account_credentials (
  account_id,
  access_token,
  refresh_token,
  token_expires_at,
  updated_at
)
SELECT
  id,
  access_token,
  refresh_token,
  token_expires_at,
  updated_at
FROM public.email_accounts
WHERE access_token IS NOT NULL
   OR refresh_token IS NOT NULL
   OR token_expires_at IS NOT NULL;

ALTER TABLE public.email_accounts
  DROP COLUMN access_token,
  DROP COLUMN refresh_token,
  DROP COLUMN token_expires_at;

COMMENT ON TABLE private.email_account_credentials IS
  'Server-only OAuth material separated from project-readable email account metadata.';

NOTIFY pgrst, 'reload schema';
COMMIT;
