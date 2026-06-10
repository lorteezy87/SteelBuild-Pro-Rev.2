-- ============================================================================
-- 20260610000000_revoke_anon_table_access.sql — P0 SECURITY INCIDENT FIX
-- ============================================================================
-- Applied live to project kjrwqagyeswwoxpjkcko via Supabase MCP on 2026-06-10,
-- then captured here so the repo and the live database stop diverging (the
-- divergence is the root cause this hole kept reappearing).
--
-- INCIDENT: a set of permissive policies (anon_select / anon_insert /
-- anon_update / anon_delete, USING(true) / WITH CHECK(true), role {anon}) plus
-- matching anon table GRANTs had been applied LIVE / out-of-band to 18 core
-- project-data tables:
--   action_items, change_orders, contacts, daily_logs, deliveries, drawings,
--   expenses, fab_releases, inspections, production_notes, projects,
--   punchlist_items, rfis, safety_incidents, schedule_tasks, sov_items,
--   submittals, work_packages
-- Because the anon (publishable) key ships in the frontend bundle, ANY
-- unauthenticated caller could read/insert/update/delete EVERY tenant's data —
-- a complete tenant-isolation failure. These policies + grants existed in NO
-- prior migration; this reconciles the live DB back to the intended posture
-- (migration 011 RLS + 047 anon-grant revoke).
--
-- VERIFIED SAFE: the app never relies on anonymous table access — the public
-- Landing page queries no tables, and edge functions call the DB with the
-- caller's JWT (role = authenticated) or the service role. Authenticated users
-- are unaffected; their per-project RLS policies remain in place.
-- ============================================================================

-- 1) Drop every out-of-band permissive policy that targets the anon role.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'anon' = any(roles)
  loop
    execute format('drop policy if exists %I on %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- 2) Re-apply 047: revoke all anon table grants in public (defense in depth).
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
      and c.relname not like 'pg\_%' escape '\'
      and c.relname not like 'extension\_%' escape '\'
  loop
    execute format('revoke all on table public.%I from anon', tbl.relname);
  end loop;
end $$;

-- 3) Stop future tables from silently inheriting anon access again.
alter default privileges in schema public revoke all on tables from anon;

-- 4) Reload PostgREST so the policy/grant changes take effect immediately.
notify pgrst, 'reload schema';
