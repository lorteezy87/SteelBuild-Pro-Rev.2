-- Account deletion: erasing a deleted account's sole-member workspaces
-- (20260927150000, 20260927160000) and releasing the rows it authored.
--
-- STAGING or another database with production's schema:
--   psql --set=ON_ERROR_STOP=1 --file=this-file
-- Everything, including the two migrations, rolls back.
--
-- First run 2026-09-27 on the local drift-replay container, after loading the
-- migrations from 20260914010000 on, the pure helpers in
-- function-search-path/live-helper-fixture.sql, and stand-ins for two
-- production-only objects no migration creates: the public.data_erasure_log
-- table (no foreign keys) and public.erasure_toggle_user_triggers (copied from
-- supabase/_capture/production-public-functions-2026-09-15.sql). Without the
-- two migrations the final auth.users delete fails with a foreign key
-- violation, and the erase fails with "Not authorized to read this project".
\set ON_ERROR_STOP on
BEGIN;
\ir ../migrations/20260927150000_erasure_census_admits_project_admins.sql
\ir ../migrations/20260927160000_account_deletion_releases_authorship.sql
\ir ../migrations/20261007084117_permit_authorship_cleanup_through_immutable_guards.sql

do $$ begin
  assert not exists (select 1 from auth.users where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') or email in ('a@example.invalid','b@example.invalid'))
    and not exists (select 1 from public.organizations where id::text like '0a000000-0000-4000-8000-%')
    and not exists (select 1 from public.projects where id::text like '0b000000-0000-4000-8000-%'),
    'Fixture namespace collision: never reuse an existing account or workspace';
end $$;

-- A = the user deleting their account, B = a teammate.
-- OX: A is the only member (owner)          -> erased by the RPC
-- OY: B owns it, A is an admin member        -> kept; A authored a row in all 27 columns
-- OZ: A is the only owner, B is a member     -> RPC must skip it; DB refuses to drop A's owner row
-- OW: A and B both own it                    -> kept

\set A  '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set B  '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''
\set OX '''0a000000-0000-4000-8000-000000000001'''
\set OY '''0a000000-0000-4000-8000-000000000002'''
\set OZ '''0a000000-0000-4000-8000-000000000003'''
\set OW '''0a000000-0000-4000-8000-000000000004'''
\set PX '''0b000000-0000-4000-8000-000000000001'''
\set PX2 '''0b000000-0000-4000-8000-000000000005'''
\set PY '''0b000000-0000-4000-8000-000000000002'''
\set PZ '''0b000000-0000-4000-8000-000000000003'''

insert into auth.users (id, email, aud, role) values
  (:A, 'a@example.invalid', 'authenticated', 'authenticated'),
  (:B, 'b@example.invalid', 'authenticated', 'authenticated');

insert into public.organizations (id, name, plan, created_by) values
  (:OX, 'Solo shop',   'business', :A),
  (:OY, 'Shared shop', 'business', :A),
  (:OZ, 'A-owned team','business', :A),
  (:OW, 'Co-owned',    'business', :A);
insert into public.organization_members (org_id, user_id, role) values
  (:OX, :A, 'owner'),
  (:OY, :B, 'owner'), (:OY, :A, 'admin'),
  (:OZ, :A, 'owner'), (:OZ, :B, 'member'),
  (:OW, :A, 'owner'), (:OW, :B, 'owner');

-- Normal project seed triggers require the actual owner's authorization.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.projects (id, org_id, name) values
  (:PX, :OX, 'Solo live'), (:PY, :OY, 'Shared job'), (:PZ, :OZ, 'Team job');
insert into public.projects (id, org_id, name, is_deleted) values (:PX2, :OX, 'Solo archived', false);
select public.soft_delete_project(:PX2);
select set_config('request.jwt.claims', '', true);

-- Only synthetic authored-row setup bypasses creation-RPC guards. Required
-- columns and CHECK constraints remain active. Restore normal triggers before
-- every census, erasure, permission, and Auth-delete assertion below.
create temp table erasure_trigger_baseline on commit drop as
  select oid, tgenabled from pg_trigger where tgrelid in
    (select oid from pg_class where relnamespace='public'::regnamespace);
set local session_replication_role = replica;
-- Authored rows in the shared project PY: one per targeted column.
insert into public.drawing_sets (id, project_id, set_name) values ('0c000000-0000-4000-8000-000000000001', :PY, 'S-100 set');
insert into public.drawings (id, project_id, drawing_set_id, sheet_number) values ('0c000000-0000-4000-8000-000000000002', :PY, '0c000000-0000-4000-8000-000000000001', 'S-101');
update public.drawing_sets set is_locked = true, locked_by = :A where id = '0c000000-0000-4000-8000-000000000001';
insert into public.drawing_revisions (id, project_id, drawing_id, revision_code, sheet_number, sheet_title)
  values ('0c000000-0000-4000-8000-000000000003', :PY, '0c000000-0000-4000-8000-000000000002', '0', 'S-101', 'Framing');
insert into public.drawing_signoffs (project_id, drawing_revision_id, drawing_id, stamp_type, stamped_by_id, voided_by)
  values (:PY, '0c000000-0000-4000-8000-000000000003', '0c000000-0000-4000-8000-000000000002', 'reviewed', :A, :A);
insert into public.drawing_revision_summaries (project_id, drawing_set_id, generated_by) values (:PY, '0c000000-0000-4000-8000-000000000001', :A);
insert into public.comments (project_id, entity_type, entity_id, body, status_changed_by) values (:PY, 'project', :PY, 'note', :A);
insert into public.backcharges (id, project_id, title, created_by, status, amount, ticket_total)
  values ('0c000000-0000-4000-8000-000000000004', :PY, 'Rework', :A, 'approved', 123.45, 123.45);
insert into public.backcharge_tm_tickets (backcharge_id, project_id, created_by, labor_hours, labor_rate, amount)
  values ('0c000000-0000-4000-8000-000000000004', :PY, :A, 2, 100, 123.45);
select set_config('steelbuild.bc_rpc', 'on', true);
insert into public.backcharge_events (backcharge_id, project_id, event_type, actor) values ('0c000000-0000-4000-8000-000000000004', :PY, 'created', :A);
select set_config('steelbuild.bc_rpc', '', true);
insert into public.email_accounts (id, project_id, email_address, created_by) values ('0c000000-0000-4000-8000-000000000005', :PY, 'inbox@example.invalid', :A);
insert into public.email_messages (project_id, account_id, sender_email, received_at, reviewed_by, sent_by)
  values (:PY, '0c000000-0000-4000-8000-000000000005', 'gc@example.invalid', now(), :A, :A);
insert into public.email_intake_queue (source_message_id, project_id, reviewed_by) values ('msg-1', :PY, :A);
insert into public.organization_invitations (org_id, email, invited_by) values (:OY, 'c@example.invalid', :A);
insert into public.pay_applications (project_id, created_by) values (:PY, :A);
insert into public.pieces (id, project_id, piece_mark) values ('0c000000-0000-4000-8000-000000000006', :PY, 'B1');
insert into public.piece_drawings (project_id, piece_id, drawing_id, created_by) values (:PY, '0c000000-0000-4000-8000-000000000006', '0c000000-0000-4000-8000-000000000002', :A);
insert into public.piece_drawing_sets (project_id, piece_id, drawing_set_id, created_by) values (:PY, '0c000000-0000-4000-8000-000000000006', '0c000000-0000-4000-8000-000000000001', :A);
insert into public.material_requirements (id, project_id, requirement_code, created_by, receipt_verified_by) values ('0c000000-0000-4000-8000-000000000007', :PY, 'MR-1', :A, :A);
insert into public.piece_material_requirements (project_id, material_requirement_id, piece_id, created_by) values (:PY, '0c000000-0000-4000-8000-000000000007', '0c000000-0000-4000-8000-000000000006', :A);
insert into public.material_receipt_events (project_id, material_requirement_id, next_state, recorded_by) values (:PY, '0c000000-0000-4000-8000-000000000007', 'received', :A);
insert into public.piece_import_batches (project_id, source_type, uploaded_by, approved_by, applied_by) values (:PY, 'csv', :A, :A, :A);
insert into public.fab_release_log (project_id, released_by) values (:PY, :A);
insert into public.fab_release_overrides (project_id, overridden_by, reason) values (:PY, :A, 'Synthetic authorship retention fixture');
insert into public.fab_releases (project_id, release_number, name, released_by) values (:PY, 'FR-001', 'First release', :A);

-- Something of A's inside the solo workspace too, erased with it.
insert into public.drawing_sets (id, project_id, set_name) values ('0c000000-0000-4000-8000-000000000011', :PX, 'Solo set');
update public.drawing_sets set is_locked = true, locked_by = :A where id = '0c000000-0000-4000-8000-000000000011';
insert into public.backcharges (project_id, title, created_by) values (:PX, 'Solo backcharge', :A);

set local session_replication_role = origin;
do $$ begin
  assert current_setting('session_replication_role')='origin', 'Normal triggers must be restored before assertions';
  assert not exists (
    select 1 from erasure_trigger_baseline b left join pg_trigger t on t.oid=b.oid
    where t.oid is null or b.tgenabled is distinct from t.tgenabled
  ), 'Synthetic setup changed trigger enablement';
end $$;

create temp table retained_authorship_snapshot on commit drop as
  select 'report' as kind, to_jsonb(summary_row)-'generated_by' as row from public.drawing_revision_summaries summary_row where project_id=:PY
  union all select 'ticket', to_jsonb(ticket_row)-'created_by'-'updated_at' from public.backcharge_tm_tickets ticket_row where project_id=:PY
  union all select 'backcharge', to_jsonb(charge_row)-'created_by'-'updated_at' from public.backcharges charge_row where project_id=:PY;

\echo '== fixtures loaded'

-- 0. project_row_counts (20260927150000): the owner can census an archived
--    project; someone outside the workspace still cannot.
savepoint s0;
-- Removal from a workspace leaves explicit user_projects rows behind. That
-- stale admin role must not restore either live or archived census access.
insert into public.user_projects (user_id, project_id, role) values
  (:B, :PX, 'admin'), (:B, :PX2, 'admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
do $$ begin
  perform public.project_row_counts('0b000000-0000-4000-8000-000000000005');
  raise notice 'OK 0a: owner reads the census of an archived project';
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.project_row_counts('0b000000-0000-4000-8000-000000000005');
    raise exception 'FAIL 0b: outsider read an archived project census';
  exception when insufficient_privilege then raise notice 'OK 0b: outsider denied, archived (%)', sqlerrm;
  end;
  begin
    perform public.project_row_counts('0b000000-0000-4000-8000-000000000001');
    raise exception 'FAIL 0c: outsider read a live project census';
  exception when insufficient_privilege then raise notice 'OK 0c: outsider denied, live (%)', sqlerrm;
  end;
end $$;
reset role;
insert into public.organization_members (org_id, user_id, role) values (:OX, :B, 'member');
set local role authenticated;
do $$ begin
  perform public.project_row_counts('0b000000-0000-4000-8000-000000000005');
  raise notice 'OK 0d: current project admin reads an archived project census';
end $$;
rollback to savepoint s0;

-- 1. anon cannot call the RPC at all.
savepoint s1;
set local role anon;
do $$ begin
  begin
    perform public.erase_my_sole_member_workspaces('Account deleted by the workspace''s only member');
    raise exception 'FAIL: anon could call erase_my_sole_member_workspaces';
  exception when insufficient_privilege then raise notice 'OK 1: anon denied (%)', sqlerrm;
  end;
end $$;
rollback to savepoint s1;

-- 2. authenticated without a user id is refused.
savepoint s2;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$ begin
  begin
    perform public.erase_my_sole_member_workspaces('Account deleted by the workspace''s only member');
    raise exception 'FAIL: RPC ran without auth.uid()';
  exception when insufficient_privilege then raise notice 'OK 2: no uid refused (%)', sqlerrm;
  end;
end $$;
rollback to savepoint s2;

-- 3. All or nothing: a failing erase (reason too short) leaves the archive undone too.
savepoint s3;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","email":"a@example.invalid"}', true);
do $$ begin
  begin
    perform public.erase_my_sole_member_workspaces('too short');
    raise exception 'FAIL: short reason accepted';
  exception when check_violation then raise notice 'OK 3a: erase refused (%)', sqlerrm;
  end;
end $$;
reset role;
do $$ begin
  assert (select not is_deleted from public.projects where id = '0b000000-0000-4000-8000-000000000001'),
    'FAIL 3b: live project stayed archived after the erase failed';
  assert exists (select 1 from public.organizations where id = '0a000000-0000-4000-8000-000000000001'), 'FAIL 3b: org gone';
  raise notice 'OK 3b: failed erase rolled back its archive step';
end $$;
rollback to savepoint s3;

-- 4. The real call, as A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","email":"a@example.invalid"}', true);
create temp table rpc_result on commit drop as
  select public.erase_my_sole_member_workspaces('Account deleted by the workspace''s only member') as r;
reset role;
select set_config('request.jwt.claims', '', true);
select 'rpc result: ' || r::text from rpc_result;
do $$
declare v jsonb := (select r from rpc_result);
begin
  assert v -> 'org_ids' = '["0a000000-0000-4000-8000-000000000001"]'::jsonb, 'FAIL 4: org_ids ' || (v -> 'org_ids')::text;
  assert (v -> 'project_ids') @> '["0b000000-0000-4000-8000-000000000001","0b000000-0000-4000-8000-000000000005"]'::jsonb
     and jsonb_array_length(v -> 'project_ids') = 2, 'FAIL 4: project_ids ' || (v -> 'project_ids')::text;
  assert not exists (select 1 from public.organizations where id = '0a000000-0000-4000-8000-000000000001'), 'FAIL 4: OX still exists';
  assert not exists (select 1 from public.projects where org_id = '0a000000-0000-4000-8000-000000000001'), 'FAIL 4: OX projects remain';
  assert not exists (select 1 from public.drawing_sets where id = '0c000000-0000-4000-8000-000000000011'), 'FAIL 4: OX drawing set remains';
  assert (select count(*) from public.organizations where id in ('0a000000-0000-4000-8000-000000000002','0a000000-0000-4000-8000-000000000003','0a000000-0000-4000-8000-000000000004')) = 3,
    'FAIL 4: a shared workspace was touched';
  assert exists (select 1 from public.projects where id = '0b000000-0000-4000-8000-000000000003' and not coalesce(is_deleted, false)), 'FAIL 4: OZ project touched';
  raise notice 'OK 4: only the sole-member workspace was archived and erased';
end $$;

-- 5. While A is still OZ's only owner, the database itself refuses to delete A.
savepoint s5;
do $$ begin
  begin
    delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL 5: deleted the last owner of a shared workspace';
  exception when check_violation then raise notice 'OK 5: last-owner guard blocks the delete (%)', sqlerrm;
  end;
end $$;
rollback to savepoint s5;

-- 6. Once B owns OZ, deleting A succeeds and authorship is released.
update public.organization_members set role = 'owner'
 where org_id = '0a000000-0000-4000-8000-000000000003' and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
\echo '== auth user A deleted'

do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  r record; v_count bigint;
begin
  for r in select * from (values
      ('backcharge_tm_tickets','created_by','null'), ('backcharges','created_by','null'), ('comments','status_changed_by','null'),
      ('drawing_revision_summaries','generated_by','null'), ('drawing_sets','locked_by','null'), ('email_accounts','created_by','null'),
      ('email_intake_queue','reviewed_by','null'), ('email_messages','reviewed_by','null'), ('email_messages','sent_by','null'),
      ('organization_invitations','invited_by','null'), ('organizations','created_by','null'), ('pay_applications','created_by','null'),
      ('piece_drawings','created_by','null'), ('material_requirements','created_by','null'), ('piece_material_requirements','created_by','null'),
      ('piece_drawing_sets','created_by','null'),
      ('backcharge_events','actor','kept'), ('drawing_signoffs','stamped_by_id','kept'), ('drawing_signoffs','voided_by','kept'),
      ('fab_release_log','released_by','kept'), ('fab_release_overrides','overridden_by','kept'), ('fab_releases','released_by','kept'),
      ('material_receipt_events','recorded_by','kept'), ('material_requirements','receipt_verified_by','kept'),
      ('piece_import_batches','uploaded_by','kept'), ('piece_import_batches','approved_by','kept'), ('piece_import_batches','applied_by','kept')
    ) as t(tbl, col, expect)
  loop
    if r.expect = 'null' then
      execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into v_count using a;
      assert v_count = 0, format('FAIL 6: %s.%s still points at the deleted user', r.tbl, r.col);
      execute format('select count(*) from public.%I where %I is null', r.tbl, r.col) into v_count;
      assert v_count >= 1, format('FAIL 6: %s.%s row vanished instead of being kept', r.tbl, r.col);
    else
      execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into v_count using a;
      assert v_count = 1, format('FAIL 6: %s.%s lost the uuid (%s rows)', r.tbl, r.col, v_count);
    end if;
  end loop;
  assert (select is_locked from public.drawing_sets where id = '0c000000-0000-4000-8000-000000000001'), 'FAIL 6: set unlocked';
  assert not exists (select 1 from public.organization_members where user_id = a), 'FAIL 6: memberships remain';
  assert (select count(*) from public.organization_members where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and role = 'owner') = 3, 'FAIL 6: B lost ownership';
  assert not exists (
    (select * from retained_authorship_snapshot)
    except
    (select 'report', to_jsonb(summary_row)-'generated_by' from public.drawing_revision_summaries summary_row where project_id='0b000000-0000-4000-8000-000000000002'
     union all select 'ticket', to_jsonb(ticket_row)-'created_by'-'updated_at' from public.backcharge_tm_tickets ticket_row where project_id='0b000000-0000-4000-8000-000000000002'
     union all select 'backcharge', to_jsonb(charge_row)-'created_by'-'updated_at' from public.backcharges charge_row where project_id='0b000000-0000-4000-8000-000000000002')
  ), 'FAIL 6: immutable report or frozen ticket/backcharge content changed during authorship cleanup';
  assert (select count(*) from public.backcharge_events where project_id='0b000000-0000-4000-8000-000000000002')=1,
    'FAIL 6: authorship cleanup manufactured a financial event';
  raise notice 'OK 6: 16 authorship links cleared, 11 audit ids kept, set still locked, teammate untouched';
end $$;

-- 7. Nothing in public still blocks an auth.users delete.
do $$ begin
  assert current_setting('session_replication_role')='origin', 'FAIL 7: normal triggers not restored';
  assert not exists (select 1 from erasure_trigger_baseline b left join pg_trigger t on t.oid=b.oid where t.oid is null or b.tgenabled is distinct from t.tgenabled),
    'FAIL 7: erasure changed trigger enablement';
  assert not exists (
    select 1 from pg_catalog.pg_constraint con join pg_catalog.pg_class cls on cls.oid = con.conrelid
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and con.confdeltype in ('a','r')
      and cls.relnamespace = 'public'::regnamespace), 'FAIL 7: blocking FK remains';
  raise notice 'OK 7: no NO ACTION / RESTRICT foreign key to auth.users left in public';
end $$;

ROLLBACK;
SELECT 'Account deletion erasure passed; all fixtures rolled back' AS result;
