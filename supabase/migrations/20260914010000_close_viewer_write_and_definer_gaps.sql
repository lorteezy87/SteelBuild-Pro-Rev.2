-- Close seven confirmed backend authorization gaps.
--
-- Each was verified against the live database (policy definitions, function
-- bodies, EXECUTE grants and the full caller graph) before being changed here,
-- and every legitimate caller was traced so nothing below narrows a path the
-- app actually uses.
--
-- 1. projects           — any viewer could edit a project's fields (incl. on_hold)
-- 2. drawing_signoffs   — any viewer could forge or rewrite a fab-release stamp
-- 3. organization_invitations — an org admin could escalate an invite to owner
-- 4. build_pay_application_lines        — unauthenticated-by-role, forgeable row arg
-- 5. refresh_pay_application_totals     — cross-project write, no role check
-- 6. link_unlinked_model_elements_for_piece — cross-project write, exposed needlessly
-- 7. project_row_counts — cross-tenant row-count census

-- ---------------------------------------------------------------------------
-- 1. projects: a viewer could edit any project in the org
--
-- project_update gated on user_has_project_access(id). That function returns
-- true for ANY org member whenever organizations.member_default_project_role
-- is set, so a viewer-by-default member could UPDATE any project row in the
-- org.
--
-- Scope of what that reached, verified against the live policy: the
-- descriptive and scheduling columns — name, phase, health_status, dates,
-- address, project_manager, superintendent, and on_hold, which stops work on
-- the job. The contract columns were already covered by
-- enforce_project_update_guard, org_id by its immutability rule,
-- approved_change_total and piece_control_mode by their own GUC-gated
-- triggers.
--
-- NOT reachable, contrary to an earlier reading of this: is_deleted. A direct
-- client write of it already failed the policy's own WITH CHECK (verified by
-- re-testing the pre-migration policy), and archival goes through
-- soft_delete_project(), which is SECURITY DEFINER and checks admin itself.
-- So this is not an archive fix.
--
-- The policy now decides WHO may update a project at all → pm.
--
-- The is_deleted / deleted_at rule added to enforce_project_update_guard
-- below is therefore defence in depth, not a hole being closed: it states the
-- intended authority for archiving in the guard where the other
-- column-level rules live, and it would hold if a future policy ever admitted
-- a direct write.
drop policy if exists project_update on public.projects;
create policy project_update on public.projects
  for update to authenticated
  using (public.user_has_project_role_at_least(id, 'pm'))
  with check (public.user_has_project_role_at_least(id, 'pm'));

-- Extend the existing guard rather than adding a second trigger. The org_id
-- and contract-field rules below are unchanged; the is_deleted / deleted_at
-- rule is new.
create or replace function public.enforce_project_update_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role() = 'authenticated' and new.org_id is distinct from old.org_id then
    raise exception 'project org_id is immutable' using errcode = '42501';
  end if;

  -- Defence in depth: a direct client write of is_deleted already fails the
  -- project_update WITH CHECK, and archival runs through
  -- soft_delete_project(). This states the intended authority in the same
  -- place as the other column-level rules.
  if auth.role() = 'authenticated'
     and (new.is_deleted is distinct from old.is_deleted
          or new.deleted_at is distinct from old.deleted_at)
     and not public.user_has_project_role_at_least(old.id, 'admin') then
    raise exception 'Archiving or restoring a project requires an admin'
      using errcode = '42501';
  end if;

  if auth.role() = 'authenticated'
     and not public.user_has_project_role_at_least(old.id, 'pm')
     and (
          new.original_contract_value is distinct from old.original_contract_value
       or new.retainage_percent       is distinct from old.retainage_percent
       or new.contingency_amount      is distinct from old.contingency_amount
       or new.contract_type           is distinct from old.contract_type
       or new.project_number          is distinct from old.project_number
     ) then
    raise exception 'Editing project contract fields requires PM or admin' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. drawing_signoffs: a viewer could forge the fab-release stamp
--
-- drawing_signoffs_insert correctly requires pm AND stamped_by_id = auth.uid()
-- — you cannot stamp as someone else. drawing_signoffs_update only required
-- user_has_project_access, so a viewer could UPDATE an existing row and
-- rewrite stamped_by_id, stamped_at or the sign-off type. The fab-release gate
-- is a P0 path; a forgeable stamp there releases steel to the shop on
-- someone else's authority.
--
-- The WITH CHECK rule is kept as-is (voiding still needs admin or your own
-- stamp) and the pm floor is added to both sides.
drop policy if exists drawing_signoffs_update on public.drawing_signoffs;
create policy drawing_signoffs_update on public.drawing_signoffs
  for update to authenticated
  using (public.user_has_project_role_at_least(project_id, 'pm'))
  with check (
    public.user_has_project_role_at_least(project_id, 'pm')
    and (
      is_voided = false
      or public.user_has_project_role_at_least(project_id, 'admin')
      or stamped_by_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. organization_invitations: an admin could mint an org owner
--
-- org_invites_insert refuses to mint an owner invite unless you are already an
-- owner. org_invites_update required only admin on both sides, so the
-- insert-time rule was bypassable: create a 'member' invite, then UPDATE its
-- role to 'owner'. accept_invitation() inserts organization_members.role from
-- the invite verbatim, so whoever holds that token becomes an org owner.
--
-- An existing member cannot raise their own role this way -- accept_invitation
-- ends in ON CONFLICT (org_id, user_id) DO NOTHING -- but an admin can send
-- the escalated invite to any address they control and accept it on a second
-- account, which defeats the INSERT-time guard just the same.
--
-- The same clause the INSERT policy already carries now applies to UPDATE.
-- Because it tests NEW.role, it also stops an admin from repointing an
-- owner invite created by an owner at their own email address: role stays
-- 'owner', the admin is not an owner, so the whole clause fails.
--
-- invited_by is deliberately NOT pinned here. A policy sees only NEW, so it
-- cannot express "unchanged" -- requiring invited_by = auth.uid() would let an
-- admin rewrite another admin's invite provenance to themselves, and would
-- block one admin from legitimately editing another's invite. Column
-- immutability needs an OLD/NEW trigger; noted as a follow-up.
drop policy if exists org_invites_update on public.organization_invitations;
create policy org_invites_update on public.organization_invitations
  for update to authenticated
  using (public.user_org_role_at_least(org_id, 'admin'))
  with check (
    public.user_org_role_at_least(org_id, 'admin')
    and (role <> 'owner' or public.user_org_role_at_least(org_id, 'owner'))
  );

-- ---------------------------------------------------------------------------
-- 4. build_pay_application_lines: forgeable composite argument
--
-- SECURITY DEFINER, granted to authenticated, with no authorization check and
-- a whole pay_applications row as its argument. The caller therefore chose
-- p_app.id, p_app.project_id and p_app.application_number independently of any
-- real row, so any authenticated user could:
--   * inject a second full set of G703 lines into someone else's pay
--     application — there is no idempotency check, so the billed total doubles
--   * pair a victim's application id with an arbitrary project_id to draft
--     lines from a different project's SOV
--
-- A revoke is not available: generate_pay_application and
-- regenerate_pay_application_lines are both SECURITY INVOKER, so they call
-- this as the end user and would lose the privilege too.
--
-- Four checks instead, all of which both real callers already satisfy — they
-- pass a freshly selected row (RETURNING * INTO), hold pm, and call on a draft
-- application with no lines (regenerate deletes them first).
create or replace function public.build_pay_application_lines(p_app pay_applications)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer := 0;
  v_line record;
  v_prev numeric;
  v_to_date numeric;
  v_stored numeric;
  v_real public.pay_applications%rowtype;
  v_prior_rpc text := coalesce(current_setting('steelbuild.payapp_rpc', true), 'off');
begin
  -- The argument is a composite the caller controls, so trust the id only and
  -- re-read the row it names.
  select * into v_real from public.pay_applications where id = p_app.id and is_deleted = false;
  if v_real.id is null then
    raise exception 'Pay application not found' using errcode = 'P0002';
  end if;
  if v_real.project_id is distinct from p_app.project_id
     or v_real.application_number is distinct from p_app.application_number then
    raise exception 'Pay application does not match the row supplied' using errcode = '22023';
  end if;
  if not public.user_has_project_role_at_least(v_real.project_id, 'pm') then
    raise exception 'Not authorized to bill this project' using errcode = '42501';
  end if;
  if v_real.status <> 'draft' then
    raise exception 'Only a draft pay application can have its G703 lines drafted' using errcode = '22023';
  end if;
  -- No upsert here, just an insert: drafting twice would double the billing.
  if exists (select 1 from public.pay_application_lines where pay_application_id = v_real.id) then
    raise exception 'Pay application already has G703 lines' using errcode = '23505';
  end if;

  perform set_config('steelbuild.payapp_rpc', 'on', true);
  for v_line in select s.id, s.line_item_number, s.description, coalesce(s.scheduled_value, 0) as sv, coalesce(s.current_percent_complete, 0) as pct, s.sort_order
                  from public.sov_items s where s.project_id = v_real.project_id and s.is_deleted = false order by s.line_item_number loop
    select coalesce(max(l.total_completed_stored), 0) into v_prev
      from public.pay_application_lines l join public.pay_applications a on a.id = l.pay_application_id
     where l.sov_item_id = v_line.id and a.is_deleted = false and a.status in ('approved', 'paid') and a.application_number < v_real.application_number;
    select coalesce(max(l.materials_stored), 0) into v_stored from public.pay_application_lines l where l.pay_application_id = v_real.id and l.sov_item_id = v_line.id;
    v_to_date := round(v_line.sv * v_line.pct / 100, 2);
    insert into public.pay_application_lines (pay_application_id, project_id, sov_item_id, line_item_number, description, scheduled_value, work_completed_previous, work_completed_this_period, materials_stored, percent_complete, retainage, sort_order, metadata)
    -- Sub-dollar residue from the 3-decimal SOV percent is not billable work.
    values (v_real.id, v_real.project_id, v_line.id, v_line.line_item_number::text, v_line.description, v_line.sv, v_prev, case when v_to_date - v_prev - v_stored < 1 then 0 else round(v_to_date - v_prev - v_stored, 2) end, v_stored, 0, 0, v_n, '{}'::jsonb);
    v_n := v_n + 1;
  end loop;
  -- Restore rather than force 'off': the callers set the GUC themselves and
  -- keep writing after this returns.
  perform set_config('steelbuild.payapp_rpc', v_prior_rpc, true);
  return v_n;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. refresh_pay_application_totals: cross-project write with no role check
--
-- SECURITY DEFINER, granted to authenticated, no authorization. Any
-- authenticated user could recompute the G702 header of any project's pay
-- application at any status — including an approved or paid certificate,
-- whose less_previous_certificates and current_payment_due it rewrites.
--
-- Same constraint as above: generate_pay_application, move_pay_application and
-- regenerate_pay_application_lines are SECURITY INVOKER, so a revoke would
-- break them. All three already require pm, and every write policy on
-- pay_applications and pay_application_lines requires pm, so a pm floor here
-- matches the table rules exactly and leaves the
-- pay_application_lines_changed trigger path intact.
create or replace function public.refresh_pay_application_totals(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_app public.pay_applications%rowtype;
  v_tcs numeric;
  v_ret numeric;
  v_prev numeric;
  v_prior_rpc text := coalesce(current_setting('steelbuild.payapp_rpc', true), 'off');
begin
  select * into v_app from public.pay_applications where id = p_id;
  if v_app.id is null then return; end if;
  -- Enforced only for a real end-user JWT: service-role and migration paths
  -- have no auth.uid() and bypass RLS anyway, so there is nothing to gate.
  if (select auth.uid()) is not null
     and not public.user_has_project_role_at_least(v_app.project_id, 'pm') then
    raise exception 'Not authorized to bill this project' using errcode = '42501';
  end if;
  select coalesce(sum(total_completed_stored), 0), coalesce(sum(retainage), 0) into v_tcs, v_ret from public.pay_application_lines where pay_application_id = p_id;
  select coalesce(max(total_earned_less_retainage), 0) into v_prev
    from public.pay_applications where project_id = v_app.project_id and is_deleted = false and status in ('approved', 'paid') and application_number < v_app.application_number;
  perform set_config('steelbuild.payapp_rpc', 'on', true);
  update public.pay_applications
     set total_completed_stored = round(v_tcs, 2), total_retainage = round(v_ret, 2), total_earned_less_retainage = round(v_tcs - v_ret, 2),
         less_previous_certificates = round(v_prev, 2), current_payment_due = round((v_tcs - v_ret) - v_prev, 2),
         balance_to_finish = round((original_contract_sum + net_change_orders) - v_tcs, 2)
   where id = p_id;
  -- Restore the caller's value. Left 'on', this handed the rest of the
  -- transaction a disarmed pay-application guard.
  perform set_config('steelbuild.payapp_rpc', v_prior_rpc, true);
end $function$;

-- ---------------------------------------------------------------------------
-- 6. link_unlinked_model_elements_for_piece: needlessly exposed
--
-- SECURITY DEFINER, granted to authenticated, no authorization. It derives the
-- project from the piece, so the project is not forgeable — but any
-- authenticated user could pass any piece id and have model_elements rows in
-- another org's project relinked, with work_package_id and fab_status
-- overwritten. That silently corrupts fab tracking on a job they cannot even
-- read.
--
-- Its only caller is the pieces_projection_after_change trigger function,
-- which is SECURITY DEFINER and owned by postgres, so it keeps EXECUTE
-- regardless of this grant. Nothing in the app calls it directly, so a revoke
-- is both sufficient and stronger than a role check — and it avoids putting an
-- auth.uid() test on a trigger path that also runs under service role.
revoke execute on function public.link_unlinked_model_elements_for_piece(uuid) from public;
revoke execute on function public.link_unlinked_model_elements_for_piece(uuid) from anon;
revoke execute on function public.link_unlinked_model_elements_for_piece(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 7. project_row_counts: cross-tenant row-count census
--
-- SECURITY DEFINER, granted to authenticated, no authorization. It loops every
-- public table carrying a project_id and returns a count per table, so any
-- authenticated user could pass any project UUID and read out how many RFIs,
-- change orders, pay applications, drawings and pieces that job has — a
-- straight cross-tenant information leak.
--
-- A role check rather than a revoke: its internal callers are SECURITY
-- DEFINER, but this function may also be reached through the MCP server under
-- a user JWT, and an access check preserves every caller that is entitled to
-- the answer while closing the leak. Enforced only for a real end-user JWT,
-- for the same reason as (5).
create or replace function public.project_row_counts(p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_table text; v_n bigint; v_out jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is not null
     and not public.user_has_project_access(p_project_id) then
    raise exception 'Not authorized to read this project' using errcode = '42501';
  end if;
  for v_table in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'public' and c.column_name = 'project_id' and c.table_name not in ('projects', 'data_erasure_log')
       and c.table_name in (select tablename from pg_tables where schemaname = 'public')
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where project_id = $1', v_table) into v_n using p_project_id;
    if v_n > 0 then v_out := v_out || jsonb_build_object(v_table, v_n); end if;
  end loop;
  return v_out;
end $function$;
