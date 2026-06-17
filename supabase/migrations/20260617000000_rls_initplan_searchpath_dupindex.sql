-- =============================================================================
-- Phase 1a — RLS init-plan wrap + function search_path + duplicate index drop
-- Project: kjrwqagyeswwoxpjkcko
--
-- Behavior-preserving hardening only. Verified against live prod schema on
-- 2026-06-17: every policy body below is reproduced byte-for-byte from
-- pg_policies, with the ONLY change being auth.uid() -> (select auth.uid())
-- so Postgres evaluates it once (init-plan) instead of per-row.
--
-- Clears these advisor findings:
--   * 9x auth_rls_initplan  (perf)   -- the ALTER POLICY block
--   * 1x duplicate_index    (perf)   -- the DROP INDEX
--   * 3x function_search_path_mutable (security) -- the stripe DO block
--
-- Assumes the target DB already has these policies (created by their table
-- migrations: drawing_markups_v2, fab_release_*, backcharges, organizations,
-- org_invitations). Apply to an environment carrying that baseline (prod, or a
-- branch that replayed cleanly). Safe inside a single transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. auth_rls_initplan: wrap auth.uid() in (select auth.uid()).
--    Logic identical; only evaluation frequency changes. ::text casts and
--    helper calls (which take a per-row column arg) are preserved verbatim.
-- -----------------------------------------------------------------------------

-- drawing_markups (INSERT / UPDATE / DELETE)
alter policy "project_insert" on public.drawing_markups
  with check (
    user_has_project_role_at_least(project_id, 'field'::text)
    and ((author_id is null) or (author_id = (select auth.uid())))
  );

alter policy "project_update" on public.drawing_markups
  using (
    user_has_project_role_at_least(project_id, 'field'::text)
    and ((author_id = (select auth.uid())) or user_has_project_role_at_least(project_id, 'pm'::text))
  )
  with check (
    user_has_project_role_at_least(project_id, 'field'::text)
  );

alter policy "project_delete" on public.drawing_markups
  using (
    user_has_project_role_at_least(project_id, 'field'::text)
    and ((author_id = (select auth.uid())) or user_has_project_role_at_least(project_id, 'pm'::text))
  );

-- fab_release_overrides (INSERT)
alter policy "fab_release_overrides_insert" on public.fab_release_overrides
  with check (
    user_has_project_role_at_least(project_id, 'field'::text)
    and (overridden_by = (select auth.uid()))
  );

-- fab_release_log (INSERT)
alter policy "fab_release_log_insert" on public.fab_release_log
  with check (
    user_has_project_role_at_least(project_id, 'pm'::text)
    and (released_by = (select auth.uid()))
  );

-- backcharge_events (INSERT)
alter policy "bc_events_insert" on public.backcharge_events
  with check (
    user_has_project_role_at_least(project_id, 'pm'::text)
    and (actor = (select auth.uid()))
  );

-- organizations (INSERT) — TO public; role clause preserved by ALTER POLICY
alter policy "organizations_insert" on public.organizations
  with check (
    ((select auth.uid()) is not null)
    and (created_by = (select auth.uid()))
  );

-- organization_members (DELETE) — TO public
alter policy "org_members_delete" on public.organization_members
  using (
    user_org_role_at_least(org_id, 'admin'::text)
    or (user_id = (select auth.uid()))
  );

-- organization_invitations (INSERT) — TO public
alter policy "org_invites_insert" on public.organization_invitations
  with check (
    user_org_role_at_least(org_id, 'admin'::text)
    and (invited_by = (select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- 2. duplicate_index on drawing_markups — both index the (project_id) column.
--    Keep idx_drawing_markups_project, drop the redundant one.
-- -----------------------------------------------------------------------------
drop index if exists public.idx_drawing_markups_project_id;

-- -----------------------------------------------------------------------------
-- 3. function_search_path_mutable on the stripe trigger/util functions.
--    Guarded: the stripe schema is provisioned out-of-band (Stripe wrapper),
--    not by migrations, so a fresh db reset / branch / CI build won't have it.
--    to_regprocedure() returns NULL when absent -> these become no-ops there
--    and apply only where the functions actually exist (i.e. prod).
--    CAVEAT: these functions may be wrapper-generated; a wrapper re-sync could
--    reset the search_path. Re-run the security advisor after any stripe re-sync.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('stripe.set_updated_at()') is not null then
    execute 'alter function stripe.set_updated_at() set search_path = stripe, public, pg_temp';
  end if;
  if to_regprocedure('stripe.set_updated_at_metadata()') is not null then
    execute 'alter function stripe.set_updated_at_metadata() set search_path = stripe, public, pg_temp';
  end if;
  if to_regprocedure('stripe.check_rate_limit(text, integer, integer)') is not null then
    execute 'alter function stripe.check_rate_limit(text, integer, integer) set search_path = stripe, public, pg_temp';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- DEFERRED to their own migrations (separate decisions, intentionally NOT here):
--   * billing_config / billing_events: RLS enabled, no policy (deny-all to
--     clients). Decide service-role-only (document) vs scoped org read, then
--     write that migration.
--   * pg_net extension in public schema: move to a dedicated schema only after
--     confirming nothing references net.* unqualified (often Supabase-managed).
-- -----------------------------------------------------------------------------
