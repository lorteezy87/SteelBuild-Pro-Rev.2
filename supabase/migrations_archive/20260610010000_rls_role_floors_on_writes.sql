-- ============================================================================
-- 20260610010000_rls_role_floors_on_writes.sql — close the "viewer can write" P1
-- ============================================================================
-- Applied live to project kjrwqagyeswwoxpjkcko via Supabase MCP on 2026-06-10
-- and verified, then captured here so repo and live stay in sync.
--
-- The project-data tables below had membership-only RLS (user_has_project_access
-- with NO role floor), so a read-only `viewer` could INSERT/UPDATE/DELETE via the
-- raw API. This re-floors writes, mirroring 20260531000000_rbac_restore_role_gates
-- and aligning with src/services/permissions.ts.
--
-- Role levels (user_has_project_role_at_least): viewer 0, field 1, pm 2, admin/owner 3.
--   SELECT  -> every project member (unchanged)
--   Operational tables           -> INSERT/UPDATE/DELETE require >= field (excludes viewer)
--   Financial (change_orders,
--     sov_items, cost_codes)     -> INSERT/UPDATE require >= pm, DELETE require >= admin
--
-- drawings / drawing_sets are intentionally NOT touched here: drawings' UPDATE
-- policy carries the released-set lock check and drawing_sets has an admin-only
-- delete; those need separate, careful handling so the moat's lock protection
-- is preserved.
-- ============================================================================

-- Operational tables: writes require >= field.
do $$
declare t text;
begin
  foreach t in array array[
    'expenses','deliveries','rfis','schedule_tasks','work_packages','inspections',
    'action_items','daily_logs','production_notes','punchlist_items','safety_incidents',
    'contacts','photos'
  ] loop
    execute format('drop policy if exists project_select on public.%I', t);
    execute format('drop policy if exists project_insert on public.%I', t);
    execute format('drop policy if exists project_update on public.%I', t);
    execute format('drop policy if exists project_delete on public.%I', t);
    execute format('create policy project_select on public.%I for select to authenticated using (user_has_project_access(project_id))', t);
    execute format('create policy project_insert on public.%I for insert to authenticated with check (user_has_project_role_at_least(project_id, %L))', t, 'field');
    execute format('create policy project_update on public.%I for update to authenticated using (user_has_project_role_at_least(project_id, %L)) with check (user_has_project_role_at_least(project_id, %L))', t, 'field', 'field');
    execute format('create policy project_delete on public.%I for delete to authenticated using (user_has_project_role_at_least(project_id, %L))', t, 'field');
  end loop;
end $$;

-- Financial tables: INSERT/UPDATE >= pm, DELETE >= admin.
do $$
declare t text;
begin
  foreach t in array array['change_orders','sov_items','cost_codes'] loop
    execute format('drop policy if exists project_select on public.%I', t);
    execute format('drop policy if exists project_insert on public.%I', t);
    execute format('drop policy if exists project_update on public.%I', t);
    execute format('drop policy if exists project_delete on public.%I', t);
    execute format('create policy project_select on public.%I for select to authenticated using (user_has_project_access(project_id))', t);
    execute format('create policy project_insert on public.%I for insert to authenticated with check (user_has_project_role_at_least(project_id, %L))', t, 'pm');
    execute format('create policy project_update on public.%I for update to authenticated using (user_has_project_role_at_least(project_id, %L)) with check (user_has_project_role_at_least(project_id, %L))', t, 'pm', 'pm');
    execute format('create policy project_delete on public.%I for delete to authenticated using (user_has_project_role_at_least(project_id, %L))', t, 'admin');
  end loop;
end $$;

-- submittals: replace the single membership-only FOR ALL policy with field-gated CRUD.
drop policy if exists project_member_access on public.submittals;
drop policy if exists project_select on public.submittals;
drop policy if exists project_insert on public.submittals;
drop policy if exists project_update on public.submittals;
drop policy if exists project_delete on public.submittals;
create policy project_select on public.submittals for select to authenticated using (user_has_project_access(project_id));
create policy project_insert on public.submittals for insert to authenticated with check (user_has_project_role_at_least(project_id, 'field'));
create policy project_update on public.submittals for update to authenticated using (user_has_project_role_at_least(project_id, 'field')) with check (user_has_project_role_at_least(project_id, 'field'));
create policy project_delete on public.submittals for delete to authenticated using (user_has_project_role_at_least(project_id, 'field'));

notify pgrst, 'reload schema';
