-- SteelBuild Pro — RLS Policy Intent Documentation
-- Migration 003: Clarify and harden RLS policies
--
-- DEPLOYMENT MODEL: Single-tenant
--   This application is deployed per-company. Each Supabase project instance
--   serves exactly one organisation. All authenticated users belong to that
--   organisation and are therefore permitted to read/write all business data.
--
--   The blanket `USING (true)` policies on business tables (rfis, projects, etc.)
--   are INTENTIONAL for this single-tenant model. They are NOT a multi-tenant
--   data-isolation gap — there is no cross-tenant data in this database.
--
-- WHAT THIS MIGRATION FIXES:
--   1. user_profiles: restrict to own row (users must not read/edit other users' profiles)
--   2. pma_audit_logs: make insert-only for authenticated users (no delete/update of audit trail)

-- ─── user_profiles: own-row isolation ────────────────────────────────────────
-- Drop the blanket policy and replace with scoped ones.
DROP POLICY IF EXISTS "auth_all" ON user_profiles;

-- Users can read their own profile (and admins can read all for user management UI)
CREATE POLICY "own_profile_select" ON user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Users can update only their own profile
CREATE POLICY "own_profile_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Inserts are handled by the handle_new_user() trigger (SECURITY DEFINER).
-- No direct INSERT policy needed; block it from the client.

-- ─── pma_audit_logs: append-only ─────────────────────────────────────────────
-- The audit log should never be modified or deleted by users.
DROP POLICY IF EXISTS "auth_all" ON pma_audit_logs;

CREATE POLICY "audit_insert" ON pma_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "audit_select" ON pma_audit_logs
  FOR SELECT TO authenticated
  USING (true);

-- No UPDATE or DELETE policies — audit entries are immutable.
