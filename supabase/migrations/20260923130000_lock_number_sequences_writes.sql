-- PLACEHOLDER VERSION: 20260923130000 is the authoring timestamp, not a ledger
-- version. Rename this file to the version production records when it is
-- applied, and land the rename in the same change that applies it (see
-- ARCHITECTURE.md → "Migrations" and CLAUDE.md → "Applying a migration"). Until
-- then `Supabase drift check` correctly reports it as a missing migration, so do
-- not merge it to main unapplied: main's drift check would block every deploy.
-- For the same reason scripts/__tests__/migrationOverrides.test.ts ("leaves no
-- local migration unclassified") fails until the stamped version is added to
-- its LEDGER snapshot in the applying change.
--
-- RLS-4 (docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md): official-number
-- counters are writable below the RPC.
--
-- The baseline gives number_sequences permissive project_insert /
-- project_update / project_delete policies for any project member, and
-- 20260702034009 only narrows them to role >= field. So a field user can send
--     PATCH /rest/v1/number_sequences?project_id=eq.<id>  {"next_value": 1}
-- and get_next_sequence_number then hands out RFI / CO / submittal numbers that
-- already exist — or DELETE the row and restart the counter the same way.
--
-- After this migration no client role can write the table. The only writers
-- left are SECURITY DEFINER functions, which run as their owner and never
-- depended on these authenticated-only policies:
--   * get_next_sequence_number — SECURITY DEFINER, search_path pinned to
--     public, gated on user_has_project_access (baseline; no later migration
--     redefines it, and it is not in _capture/DRIFTED-FUNCTIONS-2026-09-15.md,
--     so production runs this body). Every numbering path in src/ and in the
--     production-only RPCs calls it.
--   * hard_delete_project / hard_delete_organization / reset_org_data — the
--     erasure sweeps, all SECURITY DEFINER.
-- No code in src/ or supabase/functions/ writes the table directly; the only
-- client access is the SELECT in previewNextNumber (numberSequencing.jsx).
--
-- Kept on purpose:
--   * project_select — the preview read above.
--   * postgres_full_access — the table owner, not a client role.
--   * number_sequences_{ins,upd,del}_role_floor — RESTRICTIVE, so they grant
--     nothing; they would still bind if a permissive write policy came back.
--
-- Out of scope (separate audit items): the RPC's own gate is still
-- user_has_project_access, so any member can burn a number (a gap, never a
-- duplicate). Raising it to `field` would break change requests that members
-- raise through 20260921054458. The case-insensitive unique index vs. the RPC's
-- ON CONFLICT target is also untouched.
--
-- Shared database: the sibling app (SteelBuild-Pro-2026) writes to the same
-- production project. If it wrote number_sequences from a client, this breaks
-- it — the guards below cannot see a client, only functions and policies.
-- Confirm in that repo before applying.
--
-- Replay-safe (IF EXISTS / no-op revokes). Aborts, changing nothing, if the
-- database is not the one this file was written against.

do $$
declare
  v_rpc regprocedure := to_regprocedure('public.get_next_sequence_number(uuid,text)');
  v_rpc_ok boolean;
  v_invoker_writers text;
  v_client_writers text;
begin
  if to_regclass('public.number_sequences') is null then
    raise notice 'public.number_sequences missing; nothing to lock';
    return;
  end if;

  -- 1. The RPC must be able to keep writing once the client policies are gone.
  if v_rpc is null then
    raise exception 'public.get_next_sequence_number(uuid, text) is missing; without it and without client write policies nothing could allocate a record number. Aborting.';
  end if;
  select p.prosecdef
         and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
         and pg_get_userbyid(p.proowner) not in ('anon', 'authenticated')
    into v_rpc_ok
    from pg_proc p
   where p.oid = v_rpc;
  if not v_rpc_ok then
    raise exception 'public.get_next_sequence_number is not a SECURITY DEFINER function with a pinned search_path owned by a non-client role; dropping the client write policies would stop all numbering. Aborting.';
  end if;

  -- 2. No SECURITY INVOKER function may write the table: it runs as the caller
  --    and would fail the moment the policies go.
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_invoker_writers
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not p.prosecdef
     and p.prosrc ~* '(insert\s+into|update|delete\s+from|merge\s+into|truncate(\s+table)?)\s+("?public"?\s*\.\s*)?"?number_sequences\M';
  if v_invoker_writers is not null then
    raise exception 'SECURITY INVOKER function(s) write number_sequences and would break: %. Aborting.', v_invoker_writers;
  end if;

  -- 3. Drop every client write path. project_member_access was a FOR ALL
  --    policy on this table in older environments (dropped by 20260805030000
  --    where it existed); drop it again so no replay order can leave it.
  drop policy if exists project_insert on public.number_sequences;
  drop policy if exists project_update on public.number_sequences;
  drop policy if exists project_delete on public.number_sequences;
  drop policy if exists project_member_access on public.number_sequences;

  -- 4. Anything still granting a client role a write is unknown to this repo
  --    (the sibling app shares the database). Stop and look rather than drop
  --    a policy nobody here reviewed, or leave the hole open.
  select string_agg(format('%s (%s to %s)', policyname, cmd, array_to_string(roles, ',')), ', ')
    into v_client_writers
    from pg_policies
   where schemaname = 'public'
     and tablename = 'number_sequences'
     and permissive = 'PERMISSIVE'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and exists (select 1 from unnest(roles) r
                  where r not in ('postgres', 'service_role', 'supabase_admin'));
  if v_client_writers is not null then
    raise exception 'Unreviewed client write policy on number_sequences: %. Aborting.', v_client_writers;
  end if;

  -- 5. Belt and braces: take the table privileges too. TRUNCATE in particular
  --    is not subject to RLS at all.
  revoke insert, update, delete, truncate on table public.number_sequences
    from public, anon, authenticated;

  comment on table public.number_sequences is
    'Official record-number counters. Written ONLY by SECURITY DEFINER functions (get_next_sequence_number, the erasure sweeps); clients may read, never write (RLS-4).';
end $$;

notify pgrst, 'reload schema';
