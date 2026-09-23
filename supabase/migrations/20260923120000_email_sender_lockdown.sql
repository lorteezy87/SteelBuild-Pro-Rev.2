-- PLACEHOLDER VERSION. 20260923120000 is the authoring stamp, not a ledger
-- version. Before merge-with-apply, apply this exact SQL in one transaction,
-- read the recorded version, and rename this file to <that-version>_email_sender_lockdown.sql
-- (CLAUDE.md "Applying a migration"; ARCHITECTURE.md "Migrations"). Never db push.
-- NOT APPLIED anywhere as of authoring. STAGING VALIDATION REQUIRED.
--
-- SEC-N1 (audit 2026-09-23) - "Send mail as any address".
--
-- Attack path (verified in repo): any project member at field or above could
-- INSERT an email_accounts row with any email_address (20260630131332 FOR ALL
-- + 20260921080604 launch_field_* floor). email-send only checked that the
-- from address matched an ACTIVE email_accounts row, then sent through the
-- platform's provider (Resend, or Graph app-only /users/{from}/sendMail). A
-- self-signed-up user owns their own org, so an admin-only write rule ALONE does
-- not stop them - the server must also decide which address an org may use,
-- from data no tenant can write. The hourly send cap counted email_messages
-- rows, which the sender can delete.
--
-- This migration:
--   1. Caps every write to email_accounts at project admin (RESTRICTIVE, so it
--      also caps any drifted permissive policy in production).
--   2. Adds email_verified_senders: which address an org may send as. Service
--      role only - rows are written by the platform operator (runbook
--      docs/runbooks/email-sending-accounts.md) or a future proof-of-control
--      flow running as the service role.
--   3. Adds email_send_events + email_send_reserve(): an append-only send
--      ledger and an atomic per-user reservation, service role only. Members
--      can neither read, write nor delete it, so the cap cannot be reset.
--
-- Deliberately NOT changed: who can READ email_accounts (DB-9, tokens readable
-- by members, is a separate finding); the launch_field_* floors (subsumed, and
-- already live in production); email_messages policies.
SET LOCAL lock_timeout = '5s';

DO $preconditions$
BEGIN
  IF to_regclass('public.email_accounts') IS NULL
     OR to_regclass('public.projects') IS NULL
     OR to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'email_sender_lockdown: expected tables are missing';
  END IF;
  -- A security floor that silently skips is worse than a failed migration.
  IF to_regprocedure('public.user_has_project_role_at_least(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'email_sender_lockdown: public.user_has_project_role_at_least(uuid,text) is missing';
  END IF;
END
$preconditions$;

-- ---------------------------------------------------------------------------
-- 1. email_accounts: admin-only writes
--
-- user_has_project_role_at_least(project_id, 'admin') is true for org
-- owners/admins and for an explicit project admin/owner (user_projects), the
-- same predicate user_is_project_admin() and hard_delete_project() use.
-- RESTRICTIVE policies AND with every permissive policy, so the existing
-- email_accounts_project_access / launch_field_* rules still apply on top.
DROP POLICY IF EXISTS email_accounts_admin_insert ON public.email_accounts;
CREATE POLICY email_accounts_admin_insert ON public.email_accounts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'admin'));

DROP POLICY IF EXISTS email_accounts_admin_update ON public.email_accounts;
CREATE POLICY email_accounts_admin_update ON public.email_accounts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'admin'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'admin'));

DROP POLICY IF EXISTS email_accounts_admin_delete ON public.email_accounts;
CREATE POLICY email_accounts_admin_delete ON public.email_accounts
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'admin'));

-- ---------------------------------------------------------------------------
-- 2. email_verified_senders: which address an org may send as
--
-- One active verification per address platform-wide, so an operator mistake
-- cannot hand the same mailbox to two orgs. Revoke by setting revoked_at.
-- Same fail-closed shape as billing_config: RLS on, zero policies, service-role
-- grant only.
CREATE TABLE IF NOT EXISTS public.email_verified_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  verified_by text NOT NULL,
  verification_note text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT email_verified_senders_address_format
    CHECK (email_address = btrim(email_address) AND email_address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT email_verified_senders_verified_by_present
    CHECK (length(btrim(verified_by)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verified_senders_active_address_key
  ON public.email_verified_senders (lower(email_address))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS email_verified_senders_org_idx
  ON public.email_verified_senders (org_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.email_verified_senders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_verified_senders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_verified_senders TO service_role;

-- ---------------------------------------------------------------------------
-- 3. email_send_events: tamper-proof send ledger (the hourly cap's source)
--
-- One row per reserved send: who, which project, which from address, which
-- provider, how many recipients, and the outcome. No subject/body/recipient
-- addresses. project_id makes hard_delete_project's dynamic loop clear it;
-- the FKs cascade for org/user erasure.
CREATE TABLE IF NOT EXISTS public.email_send_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_address text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('resend', 'msgraph')),
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  outcome text NOT NULL DEFAULT 'reserved' CHECK (outcome IN ('reserved', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_send_events_user_created_idx
  ON public.email_send_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_send_events_project_idx
  ON public.email_send_events (project_id);

ALTER TABLE public.email_send_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_send_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_send_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. email_send_reserve: atomic check-and-reserve
--
-- Replaces email-send's read-then-send count, which had two holes: the rows
-- were deletable by the sender, and two concurrent sends could both read
-- limit-1. The per-user advisory lock serializes reservations for one user.
-- p_hourly_limit <= 0 (or NULL) means "cap disabled" (EMAIL_SEND_HOURLY_LIMIT=0);
-- the event is still recorded. A reserved slot is consumed even if the
-- provider later fails.
--
-- SECURITY INVOKER on purpose: only service_role may execute it, and if a grant
-- ever slipped an authenticated caller would still meet RLS with zero policies.
CREATE OR REPLACE FUNCTION public.email_send_reserve(
  p_user_id uuid,
  p_project_id uuid,
  p_from_address text,
  p_provider text,
  p_recipient_count integer,
  p_hourly_limit integer
)
RETURNS TABLE (allowed boolean, event_id uuid, sent_last_hour integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'email_send_reserve requires a user and a project' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('email_send_reserve:' || p_user_id::text, 0)
  );

  SELECT count(*)::integer INTO v_count
    FROM public.email_send_events e
   WHERE e.user_id = p_user_id
     AND e.created_at > now() - interval '1 hour';

  IF coalesce(p_hourly_limit, 0) > 0 AND v_count >= p_hourly_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, v_count;
    RETURN;
  END IF;

  INSERT INTO public.email_send_events (user_id, project_id, from_address, provider, recipient_count)
  VALUES (p_user_id, p_project_id, p_from_address, p_provider, coalesce(p_recipient_count, 0))
  RETURNING id INTO v_id;

  -- Bounded retention for this user's rows; the cap only needs the last hour.
  DELETE FROM public.email_send_events e
   WHERE e.user_id = p_user_id
     AND e.created_at < now() - interval '90 days';

  RETURN QUERY SELECT true, v_id, v_count + 1;
END
$function$;

REVOKE ALL ON FUNCTION public.email_send_reserve(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_send_reserve(uuid, uuid, text, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
