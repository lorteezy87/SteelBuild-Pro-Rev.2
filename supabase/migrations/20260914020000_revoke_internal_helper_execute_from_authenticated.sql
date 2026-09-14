-- Close eleven internal helpers that every logged-in user can call.
--
-- ROOT CAUSE — "revoke execute ... from public" does not lock a function down
-- on Supabase.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions in
-- the public schema directly to anon, authenticated and service_role
-- (visible in pg_default_acl as authenticated=X/postgres). PUBLIC is a separate
-- grantee, so revoking from it leaves the direct grant to `authenticated`
-- untouched and the function stays callable by anyone with a session.
--
-- Every revoke in this repo's migration history uses that ineffective form
-- (14 of 17), and the sibling 2026 repo uses it 108 times with none naming
-- `authenticated`. So a large set of functions the authors deliberately tried
-- to make internal-only are, in fact, part of the public API surface.
--
-- A revoke must therefore name the real grantees. This migration does that for
-- eleven helpers, each verified against the live database first:
--   * no caller in src/ or supabase/functions/ (checked by grep)
--   * every in-database caller is SECURITY DEFINER and owned by postgres, so
--     it keeps EXECUTE regardless of what `authenticated` holds
--
-- The one helper whose caller is SECURITY INVOKER cannot be revoked and gets a
-- role check instead — see the end of this file.

-- ---------------------------------------------------------------------------
-- Note-folder internals. Callers are the note-folder command RPCs
-- (create/rename/move/archive/restore/set_links/list_visible), all SECURITY
-- DEFINER and postgres-owned. Exposed directly, these let any signed-in user
-- reach across orgs: read a folder's effective project list or visible
-- payload, forge an entry in the folder audit trail, or plant a mutation
-- receipt under a chosen idempotency key so a later legitimate command
-- returns the attacker's cached result instead of doing the work.
-- Revoked through a guard, not as bare statements, because not every one of
-- these functions is created by a migration in this repo. feature_flag_enabled_for
-- exists in production only, so a bare REVOKE aborts the whole migration on a
-- fresh database with "function ... does not exist" — proven by replaying the
-- full migration set against an empty cluster, where this file was the only
-- genuine failure. Skipping an absent function is right rather than merely
-- convenient: there is no grant to take away, so the intended end state already
-- holds.
--
-- Each entry is the exact identity signature to_regprocedure resolves.
do $$
declare
  v_sig text;
  v_targets text[] := array[
    -- note-folder internals. Callers are the note-folder command RPCs
    -- (create/rename/move/archive/restore/set_links/list_visible), all SECURITY
    -- DEFINER and postgres-owned. Exposed directly, these let any signed-in user
    -- reach across orgs: read a folder's effective project list or visible
    -- payload, forge an entry in the folder audit trail, or plant a mutation
    -- receipt under a chosen idempotency key so a later legitimate command
    -- returns the attacker's cached result instead of doing the work.
    'public.note_folder_effective_project_ids(uuid)',
    'public.note_folder_visible_payload(uuid)',
    'public.note_folder_receipt_get(text)',
    'public.note_folder_receipt_put(text, uuid, text, jsonb)',
    'public.note_folder_write_audit(uuid, uuid, text, boolean, text, jsonb, jsonb, jsonb)',
    'public.note_folder_reject(uuid, uuid, text, text, text, jsonb)',
    'public.note_folder_same_org_projects(uuid, uuid[])',
    -- Creates the org's system "General" note folder. Callers:
    -- create_note_folder, list_visible_note_folders (both SECURITY DEFINER).
    -- Exposed, it inserts a system folder into any org id passed to it.
    'public.ensure_general_notes_folder(uuid)',
    -- Seeds the project handoff checklist. Its only caller is the
    -- trg_projects_seed_handoff_items AFTER INSERT trigger, which is already
    -- revoked from authenticated. Exposed, it bulk-inserts checklist rows into
    -- any project id, in any org.
    'public.seed_project_handoff_items(uuid)',
    -- Resolves a feature flag for an arbitrary email. Its only caller is
    -- erase_my_account (SECURITY DEFINER). The app does not use it: the client
    -- reads the feature_flags table through createEntityClient('feature_flags')
    -- and resolves per-user in useFeatureFlag.ts. Exposed, it answers "is flag X
    -- on for person Y" for any address. NOT created by any migration in this
    -- repo — production only, which is why this guard exists.
    'public.feature_flag_enabled_for(text, text)'
  ];
begin
  foreach v_sig in array v_targets loop
    if to_regprocedure(v_sig) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_sig);
    else
      raise notice 'skipping revoke, function not present here: %', v_sig;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- refresh_cost_code_actual: a role check, because a revoke would break it.
--
-- Unlike the ten above, this one has a SECURITY INVOKER caller — move_expense
-- runs as the end user, so revoking EXECUTE from `authenticated` would take
-- the privilege away from that call too. (Its other caller, the
-- expenses_changed trigger, is SECURITY DEFINER and unaffected either way.)
--
-- Exposed with no authorization, any signed-in user could force a recompute on
-- any cost code in any org. That is not the no-op it first looks like: the
-- function overwrites actual_cost whenever the expense sum is above zero, so it
-- can discard a hand-entered actual on another org's cost code.
--
-- The floor is 'field', matching create_expense and move_expense exactly, so
-- the trigger path keeps working for the field users who enter expenses.
-- Enforced only for a real end-user JWT: service-role and migration paths have
-- no auth.uid() and bypass RLS anyway, so there is nothing there to gate.
--
-- An unknown cost code id stays a silent no-op rather than raising, both to
-- preserve the existing behaviour and to avoid turning the function into an
-- existence oracle for ids the caller cannot see.
create or replace function public.refresh_cost_code_actual(p_cost_code_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sum numeric;
  v_project uuid;
  v_prev text := coalesce(current_setting('steelbuild.expense_rpc', true), '');
begin
  if p_cost_code_id is null then return; end if;

  select c.project_id into v_project from public.cost_codes c where c.id = p_cost_code_id;
  if v_project is null then return; end if;

  if (select auth.uid()) is not null
     and not public.user_has_project_role_at_least(v_project, 'field') then
    raise exception 'Not authorized to update cost codes on this project' using errcode = '42501';
  end if;

  select coalesce(sum(amount), 0) into v_sum from public.expenses where cost_code_id = p_cost_code_id and is_deleted = false and payment_status in ('Approved', 'Paid');
  perform set_config('steelbuild.expense_rpc', 'on', true);
  update public.cost_codes set expense_actual = round(v_sum, 2), actual_cost = case when v_sum > 0 then round(v_sum, 2) else actual_cost end where id = p_cost_code_id;
  perform set_config('steelbuild.expense_rpc', v_prev, true);
end $function$;
