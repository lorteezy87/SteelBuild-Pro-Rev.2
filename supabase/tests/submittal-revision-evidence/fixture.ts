import { readFile } from 'node:fs/promises';

export interface Database {
  exec(sql: string): Promise<unknown>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
}
export const ids = {
  project: '11111111-1111-4111-8111-111111111111', foreignProject: '22222222-2222-4222-8222-222222222222',
  org: '33333333-3333-4333-8333-333333333333', pm: '44444444-4444-4444-8444-444444444444',
  viewer: '55555555-5555-4555-8555-555555555555', foreign: '66666666-6666-4666-8666-666666666666',
  set: '77777777-7777-4777-8777-777777777777', set2: '77777777-7777-4777-8777-777777777778',
  drawing: '88888888-8888-4888-8888-888888888888', drawing2: '88888888-8888-4888-8888-888888888889',
  revision: '99999999-9999-4999-8999-999999999999', revision2: '99999999-9999-4999-8999-999999999990',
  submittal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', legacy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
};
export const migrationUrl = new URL('../../migrations/20261009070300_submittal_round_revision_evidence.sql', import.meta.url);
export const sourcePath = `${ids.org}/uploads/shop.pdf`;
export async function actor(db: Database, id: string = ids.pm, aal = 'aal2'): Promise<void> {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id, role:'authenticated',aal})]);
}
export async function initialize(db: Database): Promise<void> {
  await db.exec(`
    create schema auth; create schema storage; create schema steelbuild_security; create schema extensions;
    create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${ids.pm}'),('${ids.viewer}'),('${ids.foreign}');
    create table auth.test_access(user_id uuid primary key,is_member boolean,is_pm boolean,mfa_satisfied boolean);
    insert into auth.test_access values('${ids.pm}',true,true,true),('${ids.viewer}',true,false,true),('${ids.foreign}',false,false,true);
    create function steelbuild_security.satisfies_mfa() returns boolean language sql stable security definer set search_path='' as $$
      select auth.jwt()->>'aal'='aal2' and coalesce((select mfa_satisfied from auth.test_access where user_id=auth.uid()),false) $$;
    create function public.user_has_project_access(p_project_id uuid) returns boolean language sql stable security definer set search_path='' as $$
      select p_project_id='${ids.project}'::uuid and coalesce((select is_member from auth.test_access where user_id=auth.uid()),false) $$;
    create function public.user_has_project_role_at_least(p_project_id uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
      select p_project_id='${ids.project}'::uuid and coalesce((select is_pm from auth.test_access where user_id=auth.uid()),false) $$;
    create table public.projects (id uuid primary key, org_id uuid not null, metadata jsonb default '{}');
    insert into public.projects values ('${ids.project}','${ids.org}','{}'),('${ids.foreignProject}','${ids.foreign}','{}');
    alter table public.projects add column name text default 'Synthetic steel project', add column project_number text default 'P-1', add column is_deleted boolean default false, add column deleted_at timestamptz;
    create table public.organizations(id uuid primary key,name text);
    insert into public.organizations values('${ids.org}','Synthetic steel company');
    create table public.organization_members(org_id uuid,user_id uuid);
    insert into public.organization_members values('${ids.org}','${ids.pm}');
    create table public.data_erasure_log(kind text,org_id uuid,org_name text,project_id uuid,project_name text,project_number text,requested_by uuid,requested_by_email text,reason text,row_counts jsonb,storage_prefix text);
    create table storage.objects(bucket_id text,name text,id uuid default gen_random_uuid(),version text default 'fixture-v1',updated_at timestamptz default now(),metadata jsonb default '{"eTag":"fixture-etag"}',primary key(bucket_id,name));
    insert into storage.objects(bucket_id,name) values('app-files','${sourcePath}');
  `);
  const baseline = await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql',import.meta.url),'utf8');
  for (const table of ['drawing_sets','drawings','drawing_revisions','submittals','submittal_rounds','rfis']) {
    const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
    if(start < 0) throw new Error(`Missing baseline table ${table}`);
    await db.exec(baseline.slice(start,baseline.indexOf('\n);',start)+3));
    await db.exec(`alter table public.${table} add primary key(id)`);
  }
  await db.exec(`
    create table public.drawing_holds (id uuid primary key,project_id uuid,drawing_id uuid,is_active boolean);
    create table public.drawing_signoffs (id uuid primary key,project_id uuid,drawing_id uuid,drawing_revision_id uuid,is_voided boolean,stamp_type text);
    alter table public.rfis add column drawing_id uuid;
    alter table public.drawings add foreign key(drawing_set_id) references public.drawing_sets(id);
    alter table public.drawing_revisions add foreign key(drawing_id) references public.drawings(id);
    alter table public.submittal_rounds add foreign key(submittal_id) references public.submittals(id);
    alter table public.submittals add column derived_stage text, add column stage_entered_at timestamptz,
      add column gate_override_reason text,add column gate_override_by uuid,add column gate_override_at timestamptz;
    create table public.submittal_comment_dispositions(id uuid primary key default gen_random_uuid(),submittal_id uuid,project_id uuid,is_deleted boolean default false,deleted_at timestamptz,is_required boolean default true,status text);
    create function public.submittal_blocking_rfis(uuid) returns table(rfi_number text) language sql stable as $$ select rfi_number from public.rfis where false $$;
    create function public.fab_release_blocking_rfis(uuid[]) returns table(rfi_number text) language sql stable as $$ select rfi_number from public.rfis where false $$;
    create unique index ux_drawing_revisions_one_current on public.drawing_revisions(drawing_id) where is_current=true;
    insert into public.drawing_sets(id,project_id,set_name) values('${ids.set}','${ids.project}','Shop A'),('${ids.set2}','${ids.project}','Shop B');
    insert into public.drawings(id,project_id,drawing_set_id,sheet_number,title,file_url,pdf_page,stage) values
      ('${ids.drawing}','${ids.project}','${ids.set}','S1','Connections','${sourcePath}',1,'IFC'),
      ('${ids.drawing2}','${ids.project}','${ids.set2}','S2','Stairs','${sourcePath}',2,'IFC');
    insert into public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,is_current,file_url,pdf_page,release_status) values
      ('${ids.revision}','${ids.project}','${ids.drawing}','A','S1','Connections',true,'${sourcePath}',1,'released_for_shop'),
      ('${ids.revision2}','${ids.project}','${ids.drawing2}','A','S2','Stairs',true,'${sourcePath}',2,'released_for_shop');
    insert into public.submittals(id,project_id,submittal_number,title,submittal_type,drawing_set_ids) values
      ('${ids.submittal}','${ids.project}','SUB-001','Steel connection drawings','Shop Drawing',array['${ids.set}'::uuid,'${ids.set2}'::uuid]);
    insert into public.submittals(id,project_id,submittal_number,title,submittal_type,drawing_set_ids,status,ball_in_court,submitted_date) values
      ('${ids.legacy}','${ids.project}','SUB-002','Legacy shop drawings','Shop Drawing',array['${ids.set}'::uuid,'${ids.set2}'::uuid],'Released for Fabrication',NULL,'2026-10-01');
  `);
  await db.exec(await readFile(new URL('../function-search-path/live-helper-fixture.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./live-workflow-guards.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./live-erasure-functions.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../migrations/20260914120000_adopt_production_soft_delete_project.sql',import.meta.url),'utf8'));
  await db.exec(`
    create trigger trg_enforce_submittal_status_transition before update on public.submittals for each row execute function public.enforce_submittal_status_transition();
    create trigger trg_enforce_submittal_fab_release_gate before update on public.submittals for each row execute function public.enforce_submittal_fab_release_gate();
    create trigger trg_submittals_workflow_gates before insert or update on public.submittals for each row execute function public.enforce_submittal_workflow_gates();
    grant usage on schema auth,storage,steelbuild_security to authenticated,service_role,anon;
    grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
  `);
  await db.exec(await readFile(new URL('../../migrations/20261008013546_align_drawing_set_governing_submittal.sql',import.meta.url),'utf8'));
  await actor(db);
}
