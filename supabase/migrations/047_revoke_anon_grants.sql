-- ============================================================================
-- 047_revoke_anon_grants.sql — defense-in-depth: remove anon table grants
-- ============================================================================
-- Audit finding (see supabase/scripts/verify_rls_isolation.sql section 5):
-- the `anon` role holds SELECT/INSERT/UPDATE/DELETE grants on every public
-- user-data table. Migration 011 locked down RLS so no policy TARGETS the
-- anon role (every policy is `TO authenticated`), which means anon reads
-- are blocked TODAY by row-level evaluation.
--
-- But grants + RLS is defense-in-depth. If any future migration adds a
-- permissive `TO public` or `TO anon` policy to a table — or temporarily
-- disables RLS for a backfill and forgets to re-enable it — the grants
-- immediately become exploitable. Revoking them now closes that failure
-- mode permanently.
--
-- Authenticated users are unaffected: they authenticate against Supabase,
-- which swaps the Postgres role from `anon` to `authenticated`, and the
-- grants on `authenticated` are left in place.
--
-- Anonymous public pages (Landing) do not query DB tables.
--
-- Edge functions (llm-proxy, schedule-assistant) call the DB with the
-- user's JWT; the Postgres role resolves to `authenticated`. They do not
-- rely on anon grants for table reads — verified against the function
-- source as of this migration.
--
-- Storage remains open to anon via the existing `public_read` policy on
-- storage.objects — that's intentional for file downloads and is NOT
-- touched here (this migration only affects the public schema).
-- ============================================================================

do $$
declare
  tbl record;
begin
  for tbl in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Skip Supabase-owned / extension tables (safety belt: none of
      -- ours start with these, but future additions might).
      and c.relname not like 'pg\_%' escape '\'
      and c.relname not like 'extension\_%' escape '\'
  loop
    execute format(
      'revoke all on table public.%I from anon',
      tbl.relname
    );
  end loop;
end $$;

-- Belt & suspenders: if Supabase's built-in grant hook re-grants SELECT
-- by default on new tables, we also revoke at the schema-default level so
-- future tables don't silently inherit anon access.
alter default privileges in schema public revoke all on tables from anon;

-- Explicit allowlist for anon access, if any. Today: NONE. If you later
-- need to make a specific table readable to anon (e.g. a public project
-- directory), add it here with a narrow GRANT + a specific RLS policy
-- scoped `TO anon`, not by loosening this migration.
--
-- Example:
--   grant select on public.public_project_directory to anon;
--   create policy "anon_read_directory"
--     on public.public_project_directory
--     for select to anon
--     using (is_public = true);
