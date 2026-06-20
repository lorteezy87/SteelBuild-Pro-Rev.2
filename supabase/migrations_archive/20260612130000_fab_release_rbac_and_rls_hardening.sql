-- Phase 0 hardening for the fab-release subsystem (prerequisite to the
-- server-side fab-release gate). Two safe, additive changes.
--
-- (1) UNLOCK public.fab_releases. The table is RLS-enabled with ZERO policies
--     (and no app usage yet) — i.e. inaccessible to every authenticated user.
--     Add project-scoped membership policies so it is usable. The richer
--     production-release model (piece marks / tonnage / % complete) is Phase 2;
--     this only gives the table sane membership RLS now so it isn't a locked
--     landmine when Phase 2 wires it in.
--
-- (2) Restrict the submittal "Released for Fabrication" transition to PM+.
--     Migration 071_restrict_released_for_fabrication.sql was authored but
--     NEVER applied live (verified: absent from supabase_migrations) AND used
--     legacy role names get_my_project_role never returns
--     ('project_manager','reviewer', omitting 'pm'). Re-apply it correctly:
--       - canonical helper user_has_project_role_at_least(project_id,'pm');
--       - `is distinct from` so a NULL status doesn't get blocked for non-PMs
--         (071 used `<>`, which is NULL → not-true → would block NULL-status
--         updates);
--       - cover submittal_rounds INSERT, not only UPDATE — rounds are CREATED
--         (addSubmittalRound) with their status, so an UPDATE-only gate left the
--         release path open and could orphan a 'Released for Fabrication' round.
--     Harmless to current users (only 'owner' memberships exist today; owner
--     passes 'pm'); correct once field/pm/viewer roles are assigned.

-- ── (1) fab_releases membership RLS ─────────────────────────────────────────
grant select, insert, update, delete on table public.fab_releases to authenticated;
revoke all on table public.fab_releases from anon;

drop policy if exists fab_releases_select on public.fab_releases;
create policy fab_releases_select on public.fab_releases
  for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists fab_releases_insert on public.fab_releases;
create policy fab_releases_insert on public.fab_releases
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists fab_releases_update on public.fab_releases;
create policy fab_releases_update on public.fab_releases
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));

drop policy if exists fab_releases_delete on public.fab_releases;
create policy fab_releases_delete on public.fab_releases
  for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'admin'));

-- ── (2) "Released for Fabrication" transition → PM+ ─────────────────────────
drop policy if exists submittals_released_for_fab_requires_elevated_role on public.submittals;
create policy submittals_released_for_fab_requires_elevated_role
  on public.submittals as restrictive for update to authenticated
  with check (
    status is distinct from 'Released for Fabrication'
    or user_has_project_role_at_least(project_id, 'pm')
  );

drop policy if exists submittal_rounds_released_for_fab_requires_elevated_role on public.submittal_rounds;
drop policy if exists submittal_rounds_released_for_fab_requires_elevated_role_upd on public.submittal_rounds;
create policy submittal_rounds_released_for_fab_requires_elevated_role_upd
  on public.submittal_rounds as restrictive for update to authenticated
  with check (
    status is distinct from 'Released for Fabrication'
    or user_has_project_role_at_least(project_id, 'pm')
  );

drop policy if exists submittal_rounds_released_for_fab_requires_elevated_role_ins on public.submittal_rounds;
create policy submittal_rounds_released_for_fab_requires_elevated_role_ins
  on public.submittal_rounds as restrictive for insert to authenticated
  with check (
    status is distinct from 'Released for Fabrication'
    or user_has_project_role_at_least(project_id, 'pm')
  );

notify pgrst, 'reload schema';
