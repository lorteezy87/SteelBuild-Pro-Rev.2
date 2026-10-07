-- Avoid the confirmed relation-lock/parent-row inversion in account erasure.
-- Replace only the account RPC; preserve its signature, grants, authorization,
-- deletion/reason checks and 60s PostgREST timeout. Applied migrations stay intact.
-- The 8s acquisition budget fails with 55P03, not an internally retried deadlock.
-- See supabase/tests/account-deletion/README.md for scope and hosted overlap proof.

create or replace function public.erase_my_sole_member_workspaces(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
-- PostgREST 14 hoists this catalog setting before starting the RPC statement,
-- overriding authenticated's 8s timer for this RPC only. SET LOCAL inside the
-- body would be too late. Stay within the API's 60s maximum; do not widen the
-- authenticated role's limit. Reload the schema cache after applying below.
set statement_timeout to '60s'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_project uuid;
  v_locked_org_ids uuid[];
  v_todo uuid[];
  v_live uuid[];
  v_org_ids uuid[] := '{}';
  v_project_ids uuid[] := '{}';
  v_lock_tables text[];
  v_rechecked_tables text[];
  v_lock_table text;
  v_locks_acquired boolean;
  v_lock_deadline timestamptz;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- A caller with no owned workspace has no erasure work and takes no global
  -- write locks. This is only a fast path; ownership and membership are read
  -- again below after acquiring the relation locks.
  if not exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.org_id
    where m.user_id = v_uid and m.role = 'owner'
  ) then
    return jsonb_build_object('org_ids', to_jsonb(v_org_ids), 'project_ids', to_jsonb(v_project_ids));
  end if;

  -- hard_delete_project and hard_delete_organization use ALTER TABLE to
  -- disable user triggers. That needs SHARE ROW EXCLUSIVE relation locks.
  -- Taking an org row lock first inverts ordinary writes: a writer may already
  -- hold ROW EXCLUSIVE on a child relation while waiting for that parent row.
  -- Acquire every possible trigger-toggle target before any row locks instead.
  -- Include empty project tables: a concurrent first insert can make a table
  -- enter project_row_counts before the later trigger-toggle step.
  --
  -- This preserves the existing possible ALTER set, but deliberately broadens
  -- each call from its nonempty tables to the potential set. The underlying
  -- erasure already blocks writes across workspaces while triggers are toggled;
  -- this is a lock-order fix, not a concurrency/performance redesign.
  v_lock_deadline := clock_timestamp() + interval '8 seconds';
  loop
    if clock_timestamp() >= v_lock_deadline then
      raise exception 'ERASURE_BUSY: workspace writes are active; retry account deletion'
        using errcode = '55P03';
    end if;
    v_locks_acquired := false;
    begin
      select coalesce(array_agg(c.relname::text order by c.relname), '{}')
        into v_lock_tables
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and exists (
          select 1 from pg_catalog.pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal and t.tgenabled = 'O'
        )
        and (
          c.relname = any(array[
            'projects', 'billing_events', 'organization_invitations',
            'note_folder_audit_events', 'note_folder_mutation_receipts',
            'note_folder_migrations', 'note_folders', 'vendors',
            'organization_members', 'organizations'
          ])
          or (
            c.relname not in ('projects', 'data_erasure_log')
            and exists (
              select 1 from pg_catalog.pg_attribute a
              where a.attrelid = c.oid and a.attname = 'project_id'
                and a.attnum > 0 and not a.attisdropped
            )
          )
        );

      foreach v_lock_table in array v_lock_tables loop
        execute format('lock table public.%I in share row exclusive mode nowait', v_lock_table);
      end loop;

      -- Detect a changed target set and release this attempt before replanning.
      -- Deploy schema changes in a quiet window: this is not a promise of
      -- universal safety against concurrent DDL after the final catalog read.
      select coalesce(array_agg(c.relname::text order by c.relname), '{}')
        into v_rechecked_tables
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and exists (
          select 1 from pg_catalog.pg_trigger t
          where t.tgrelid = c.oid and not t.tgisinternal and t.tgenabled = 'O'
        )
        and (
          c.relname = any(array[
            'projects', 'billing_events', 'organization_invitations',
            'note_folder_audit_events', 'note_folder_mutation_receipts',
            'note_folder_migrations', 'note_folders', 'vendors',
            'organization_members', 'organizations'
          ])
          or (
            c.relname not in ('projects', 'data_erasure_log')
            and exists (
              select 1 from pg_catalog.pg_attribute a
              where a.attrelid = c.oid and a.attname = 'project_id'
                and a.attnum > 0 and not a.attisdropped
            )
          )
        );
      if v_rechecked_tables is distinct from v_lock_tables then
        raise exception 'ERASURE_RELATION_SET_CHANGED' using errcode = '55P03';
      end if;
      v_locks_acquired := true;
    exception when lock_not_available then
      -- The exception subtransaction releases ALL locks from this attempt.
      -- Never wait/back off while holding a partial relation-lock set.
      null;
    end;
    exit when v_locks_acquired;
    if clock_timestamp() >= v_lock_deadline then
      raise exception 'ERASURE_BUSY: workspace writes are active; retry account deletion'
        using errcode = '55P03';
    end if;
    perform pg_sleep(least(0.05, greatest(0.0, extract(epoch from v_lock_deadline - clock_timestamp()))));
  end loop;

  -- Membership writes lock the parent organization in enforce_org_member_guard.
  -- Take that same lock before deciding an org is sole-member; an invitation
  -- accepted between a stale roster read and erasure must never erase a team.
  -- Materialize the locked ids before trigger-toggling erasure begins below.
  -- A workspace created concurrently is not part of this locked snapshot.
  select coalesce(array_agg(locked.id), '{}') into v_locked_org_ids
  from (
    select o.id from public.organizations o
    where exists (
      select 1 from public.organization_members m
      where m.org_id = o.id and m.user_id = v_uid and m.role = 'owner'
    )
    order by o.id
    for update
  ) locked;

  -- Workspaces where the caller is the only member and an owner. Shared
  -- workspaces are never touched here; the Edge Function refuses deletion
  -- while the caller is the only owner of one.
  --
  -- Ids are collected into arrays before anything is changed: no cursor may
  -- stay open over organization_members or projects while
  -- hard_delete_organization toggles their triggers (error 55006, see
  -- 20260912062606).
  select coalesce(array_agg(m.org_id order by m.org_id), '{}')
    into v_todo
  from public.organization_members m
  where m.user_id = v_uid
    and m.org_id = any(v_locked_org_ids)
    and m.role = 'owner'
    and not exists (
      select 1 from public.organization_members o
      where o.org_id = m.org_id and o.user_id <> v_uid
    );

  foreach v_org in array v_todo loop
    -- hard_delete_organization refuses live projects (ARCHIVE_FIRST).
    select coalesce(array_agg(p.id), '{}')
      into v_live
    from public.projects p
    where p.org_id = v_org and coalesce(p.is_deleted, false) = false;

    foreach v_project in array v_live loop
      perform public.soft_delete_project(v_project);
    end loop;

    v_project_ids := v_project_ids || array(select p.id from public.projects p where p.org_id = v_org);
    -- Re-checks ownership and the reason itself.
    perform public.hard_delete_organization(v_org, p_reason);
    v_org_ids := v_org_ids || v_org;
  end loop;

  return jsonb_build_object('org_ids', to_jsonb(v_org_ids), 'project_ids', to_jsonb(v_project_ids));
end;
$function$;

notify pgrst, 'reload schema';
