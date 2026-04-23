-- ============================================================================
-- verify_rls_isolation.sql
--
-- Run this in the Supabase SQL editor (or psql) on the PRODUCTION project to
-- confirm migration 011_rls_project_isolation.sql fully landed. Migration
-- 001 ships every user-data table with a permissive `auth_all` policy
-- (`USING (true)` — any authenticated user reads any row). Migration 011
-- replaces those with project-member-scoped policies. If 011 half-applied
-- (e.g. got interrupted, was skipped in a branch DB, or a later migration
-- added a new table without porting the same restriction), this script
-- will tell you.
--
-- Expected output on a healthy prod:
--   - Section 1 (leftover auth_all): 0 rows
--   - Section 2 (RLS disabled):      0 rows
--   - Section 3 (tables without a policy): 0 rows
--   - Section 4 (service-role-in-client sanity): 0 rows
--
-- Anything returned by any section is a leak risk. Do not treat them as
-- benign until proven. Audit who's querying the listed tables and either
-- write a project-scoped policy or add the table to a documented allowlist.
-- ============================================================================

-- Section 1: leftover permissive "auth_all" policies --------------------------
-- Migration 011 drops every auth_all policy by name. Any row here is a
-- table where an authenticated user can read/write across tenants.
select
  '1. leftover auth_all policies' as check_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where policyname = 'auth_all'
order by tablename;

-- Section 2: user-data tables with RLS disabled -------------------------------
-- If relrowsecurity is false, policies don't matter — the table is open.
-- Excludes Postgres system schemas.
select
  '2. RLS disabled on user table' as check_name,
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where
  c.relkind = 'r'
  and n.nspname = 'public'
  and c.relrowsecurity = false
order by c.relname;

-- Section 3: RLS-enabled tables with ZERO policies ---------------------------
-- An RLS-enabled table without a policy defaults to "deny all" — safer than
-- leaking, but means the table is unreachable even for legitimate reads.
-- Usually indicates a migration that enabled RLS but never wrote a policy.
select
  '3. RLS enabled but no policies' as check_name,
  c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where
  c.relkind = 'r'
  and n.nspname = 'public'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = n.nspname and p.tablename = c.relname
  )
order by c.relname;

-- Section 4: cross-reference critical tables have the expected policy --------
-- These are the tables that migration 011 replaced auth_all on. Expect each
-- to have a project-scoped policy (the exact policyname varies — 011 uses
-- "project_member_access" and similar).
select
  '4. critical tables policy presence' as check_name,
  t.table_name,
  coalesce(
    string_agg(p.policyname, ', ' order by p.policyname),
    '(NONE — FIX)'
  ) as policies
from (
  values
    ('projects'),
    ('rfis'),
    ('drawings'),
    ('drawing_sets'),
    ('deliveries'),
    ('work_packages'),
    ('schedule_tasks'),
    ('change_orders'),
    ('change_requests'),
    ('sov_items'),
    ('expenses'),
    ('documents'),
    ('meetings'),
    ('punchlist_items'),
    ('inspections'),
    ('safety_incidents'),
    ('contacts'),
    ('look_ahead'),
    ('production_notes'),
    ('user_projects'),
    -- NOTE: project_members intentionally excluded — documentation
    -- references the name but the project uses user_projects in
    -- practice. See migration 011 + verify_rls_isolation audit trail.
    ('ai_audit_log'),
    ('drawing_analyses'),
    ('drawing_sheets'),
    ('drawing_findings'),
    ('drawing_revision_comparisons'),
    ('drawing_revision_deltas'),
    ('delivery_items'),
    ('number_sequences')
) as t(table_name)
left join pg_policies p on p.tablename = t.table_name and p.schemaname = 'public'
group by t.table_name
order by t.table_name;

-- Section 5: anon role must NOT have read/write on user-data tables ----------
-- The anon role should only be able to hit edge functions / auth endpoints.
-- If it has direct SELECT/INSERT/UPDATE/DELETE on any user-data table via a
-- GRANT, that bypasses RLS entirely.
select
  '5. anon role has direct table grants' as check_name,
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.table_privileges
where
  grantee = 'anon'
  and table_schema = 'public'
  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
order by table_name, privilege_type;
