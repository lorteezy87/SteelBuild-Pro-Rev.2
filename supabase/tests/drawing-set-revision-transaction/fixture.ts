import { readFile } from 'node:fs/promises';
import { validateDrawingPackage, requiredPrerequisites } from '../../../scripts/drawing-cutover-package.ts';
import { initialize as baseInitialize, ids, actor, migrationUrl, sourcePath, type Database } from '../submittal-revision-evidence/fixture.ts';
export { ids, actor, type Database };
export const reviewedPayloads=validateDrawingPackage();
export const manualInstallUrl=new URL('../../drawing-cutover/install-manual.sql',import.meta.url);
/** Synthetic fixture bindings ONLY. These hashes/classifications are never hosted approval. */
export async function prepareFixtureInstall(db:Database){
  await db.exec('create schema if not exists supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])');
  const prerequisites=[];
  for(const identity of requiredPrerequisites){
    const row=(await db.query("select encode(sha256(convert_to(pg_get_functiondef($1::regprocedure),'UTF8')),'hex') sha256",[identity])).rows[0];
    prerequisites.push({identity,sha256:row.sha256});
  }
  await db.query("select set_config('drawing_cutover.project_ref',$1,false),set_config('drawing_cutover.reviewed_source_commit',$2,false),set_config('drawing_cutover.reviewed_classification_sha256',$3,false),set_config('drawing_cutover.expected_prerequisites',$4,false)",
    ['syntheticfixtureonly', 'a'.repeat(40),'b'.repeat(64),JSON.stringify(prerequisites)]);
}
export async function installReviewedFixturePackage(db:Database){
  await prepareFixtureInstall(db);
  await db.exec(await readFile(manualInstallUrl,'utf8'));
}
/** TEST ONLY: permit existing positive command cases AFTER disabled-install negatives. */
export async function enableFixtureMutations(db:Database){
  await db.exec('grant execute on function public.create_drawing_set_from_review(uuid,jsonb),public.apply_drawing_set_revision(uuid,jsonb) to authenticated');
}
export const path=`${ids.org}/uploads/${ids.project}/reviewed-new.pdf`;
export const zoneA='abababab-abab-4bab-8bab-abababababab',zoneB='bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc';
export async function initialize(db:Database){
  // TEST ONLY: cluster roles can outlive another fixture database. Never alter
  // shared API-role attributes to manufacture a privileged Storage writer.
  await db.exec(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='drawing_fixture_storage_admin') then
      create role drawing_fixture_storage_admin nologin nosuperuser nocreatedb nocreaterole noinherit noreplication bypassrls;
    end if;
    if not exists(select 1 from pg_roles where rolname='drawing_fixture_storage_admin'
      and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole
      and not rolinherit and not rolreplication and rolbypassrls)
      or exists(select 1 from pg_auth_members where roleid='drawing_fixture_storage_admin'::regrole or member='drawing_fixture_storage_admin'::regrole)
    then raise exception 'DRAWING_FIXTURE_STORAGE_ADMIN_UNEXPECTED';end if;
  end $$;`);
  await baseInitialize(db);
  await db.exec(await readFile(migrationUrl,'utf8'));
  const baseline=await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql',import.meta.url),'utf8');
  const nameIndex=baseline.match(/CREATE UNIQUE INDEX "uq_drawing_sets_project_set_name"[^;]+;/)?.[0];
  if(!nameIndex)throw new Error('Missing set-name uniqueness fixture');
  await db.exec(nameIndex);
  for(const table of ['drawing_zones','drawing_links','drawing_zone_dependencies','drawing_activity','drawing_zone_activity','drawing_watchers','alerts','pma_audit_logs']){
    const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
    await db.exec(baseline.slice(start,baseline.indexOf('\n);',start)+3));
    await db.exec(`alter table public.${table} add primary key(${table==='drawing_watchers'?'drawing_id,user_id':'id'})`);
  }
  for(const statement of baseline.matchAll(/ALTER TABLE ONLY "public"\."(drawing_zones|drawing_links|drawing_zone_dependencies|drawing_activity|drawing_zone_activity|drawing_watchers|alerts)"\s+ADD CONSTRAINT[^;]+FOREIGN KEY[^;]+;/g)){
    await db.exec(statement[0]);
  }
  for(const name of ['audit_log_trigger','tg_validate_drawing_zone_dependency_project','validate_drawing_link_target','validate_drawing_zone_polygon','update_updated_at','sync_drawing_set_counts','log_drawing_activity','log_drawing_zone_activity','log_drawing_link_activity','drawing_watch_notify_revision']){
    const start=baseline.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"()`);
    if(start<0)throw new Error(`Missing function ${name}`);
    await db.exec(baseline.slice(start,baseline.indexOf('ALTER FUNCTION',start)));
  }
  for(const statement of baseline.matchAll(/CREATE OR REPLACE TRIGGER[^;]+ ON "public"\."(drawing_zones|drawing_links|drawing_zone_dependencies|drawings|drawing_revisions|drawing_sets)"[^;]+;/g)){
    if(statement[0].includes('enforce_drawing_set_unlock_role'))continue;
    await db.exec(statement[0]);
  }
  await db.exec(`
    grant usage on schema public to anon,authenticated,service_role;
    revoke all on function public.soft_delete_project(uuid) from public,anon,authenticated,service_role;
    grant execute on function public.soft_delete_project(uuid) to authenticated;
    alter table public.drawing_activity drop constraint chk_drawing_activity_event_type;
    alter table public.drawing_activity add constraint chk_drawing_activity_event_type check(event_type in ('created','stage_changed','revision_changed','approval_changed','deleted','restored','ai_status_changed','superseded','hold_placed','hold_released'));
    alter table public.drawings add column scale_status text check(scale_status in ('undetected','ambiguous','auto','manual'));
    alter table public.drawing_sets add column titleblock_revision_rect jsonb;
    alter table auth.test_access add column app_role text default 'admin';
    update auth.test_access set app_role='viewer' where user_id<>'${ids.pm}';
    create or replace function public.user_has_project_role_at_least(p_project_id uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
      select p_project_id='${ids.project}'::uuid and coalesce((select is_member and case p_role
        when 'admin' then is_pm and app_role='admin' when 'pm' then is_pm when 'field' then is_pm or app_role='field' else true end
        from auth.test_access where user_id=auth.uid()),false) $$;
    alter table public.drawing_holds alter column id set default gen_random_uuid();
    alter table public.drawing_holds add column reason text not null default 'Synthetic hold',
      add column prior_release_status text,add column placed_by_id uuid,add column placed_by_name text,
      add column placed_at timestamptz not null default now(),add column released_by_id uuid,add column released_by_name text,
      add column released_at timestamptz,add column release_notes text,add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(),add column prior_stage text,add column metadata jsonb not null default '{}';
    alter table public.drawing_holds alter column is_active set default true;
    alter table public.drawing_holds add constraint drawing_holds_reason_not_blank check(length(btrim(reason))>0),
      add constraint chk_drawing_holds_prior_stage check(prior_stage is null or prior_stage in ('Not Started','IFA','OFA','BFA','OFS','IFC','Released')),
      add constraint chk_drawing_holds_release_consistent check((is_active and released_at is null) or (not is_active and released_at is not null));
    create table public.user_profiles(id uuid primary key,full_name text,email text);
    alter table public.drawing_sets add foreign key(locked_by) references auth.users(id) on delete set null;
    insert into public.user_profiles values('${ids.pm}','Synthetic PM','fixture@example.invalid');
    grant all on public.drawings,public.drawing_sets,public.drawing_revisions,public.drawing_holds to authenticated,service_role;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='drawing_fixture_inherited') then create role drawing_fixture_inherited nologin;end if;
      if not exists(select 1 from pg_roles where rolname='drawing_fixture_settable') then create role drawing_fixture_settable nologin;end if;
      if not exists(select 1 from pg_roles where rolname='drawing_fixture_auth_admin') then create role drawing_fixture_auth_admin nologin;end if;
    end $$;
    grant usage on schema auth to drawing_fixture_auth_admin;
    grant select,delete on auth.users to drawing_fixture_auth_admin;
    grant drawing_fixture_inherited to authenticated;
    grant drawing_fixture_settable to authenticated with inherit false,set true;
    grant usage on schema public to drawing_fixture_inherited,drawing_fixture_settable;
    grant update(file_url) on public.drawings to public,drawing_fixture_inherited,drawing_fixture_settable;
    grant truncate on public.drawings to drawing_fixture_inherited,drawing_fixture_settable;
    -- Current staging catalog bodies, captured SELECT-only 2026-10-15. These
    -- replaced the baseline count trigger; no migration history is invented.
    create or replace function public.recount_drawing_set(p_set_id uuid) returns void language plpgsql security definer set search_path='public' as $$
    begin
      update public.drawing_sets ds set
        sheet_count=(select count(*) from public.drawings where drawing_set_id=p_set_id and not is_deleted),
        processed_count=(select count(*) filter(where ai_extraction_status='Processed') from public.drawings where drawing_set_id=p_set_id and not is_deleted),
        needs_review_count=(select count(*) filter(where ai_extraction_status='NeedsReview') from public.drawings where drawing_set_id=p_set_id and not is_deleted),
        failed_count=(select count(*) filter(where ai_extraction_status='Failed' or upload_status='Failed') from public.drawings where drawing_set_id=p_set_id and not is_deleted),updated_at=now()
        where ds.id=p_set_id;
      update public.drawing_sets set is_deleted=true,deleted_at=now() where id=p_set_id and is_deleted=false and sheet_count=0;
    end $$;
    create or replace function public.sync_drawing_set_counts() returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
    declare v_set uuid;
    begin
      if tg_op='UPDATE' and new.drawing_set_id is distinct from old.drawing_set_id and old.drawing_set_id is not null then perform public.recount_drawing_set(old.drawing_set_id);end if;
      v_set:=case when tg_op='DELETE' then old.drawing_set_id else new.drawing_set_id end;
      if v_set is not null then perform public.recount_drawing_set(v_set);end if;
      return coalesce(new,old);
    end $$;
    revoke all on function public.recount_drawing_set(uuid),public.sync_drawing_set_counts() from public,anon,authenticated,service_role;
    grant execute on function public.recount_drawing_set(uuid) to service_role;
    alter table storage.objects add column owner uuid default '${ids.pm}';
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    grant usage on schema storage to drawing_fixture_storage_admin;
    grant select,update on storage.objects to drawing_fixture_storage_admin;
    alter table public.drawing_holds add foreign key(drawing_id) references public.drawings(id);
    create function public.user_is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
      select p_org='${ids.org}'::uuid and coalesce((select is_member from auth.test_access where user_id=auth.uid()),false) $$;
    create policy auth_read on storage.objects for select to authenticated using
      (bucket_id='app-files' and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.user_is_org_member(((storage.foldername(name))[1])::uuid));
    create policy auth_upload on storage.objects for insert to authenticated with check
      (bucket_id='app-files' and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.user_is_org_member(((storage.foldername(name))[1])::uuid));
    create policy auth_update on storage.objects for update to authenticated using (bucket_id='app-files' and owner=auth.uid()) with check (bucket_id='app-files' and owner=auth.uid());
    create policy auth_delete on storage.objects for delete to authenticated using (bucket_id='app-files' and owner=auth.uid());
    create policy require_enrolled_mfa on storage.objects as restrictive for all to authenticated using ((select steelbuild_security.satisfies_mfa())) with check ((select steelbuild_security.satisfies_mfa()));
    create unique index drawing_revision_unique_code on public.drawing_revisions(drawing_id,revision_code);
    create unique index drawing_revision_unique_version on public.drawing_revisions(drawing_id,version_number);
    create unique index drawing_zone_unique_key on public.drawing_zones(drawing_revision_id,zone_key);
    create unique index drawing_links_active_unique on public.drawing_links(drawing_zone_id,linked_record_type,linked_record_id,link_role) where removed_at is null;
    create unique index drawing_dependencies_active_unique on public.drawing_zone_dependencies(source_zone_id,target_zone_id,relationship) where removed_at is null;
    update public.drawing_sets set revision='A',file_url='${sourcePath}',updated_at='2026-10-09T00:00:00Z' where id='${ids.set}';
    update public.drawings set revision_number='A',updated_at='2026-10-09T00:00:00Z' where id in ('${ids.drawing}','${ids.drawing2}');
    insert into storage.objects(bucket_id,name) values('app-files','${path}');
    insert into public.drawing_zones(id,project_id,drawing_id,drawing_revision_id,zone_key,label,x_min,y_min,x_max,y_max,status) values
      ('${zoneA}','${ids.project}','${ids.drawing}','${ids.revision}','Z-1','Connection bay',0,0,0.4,0.4,'green'),
      ('${zoneB}','${ids.project}','${ids.drawing}','${ids.revision}','Z-2','Erection bay',0.5,0.5,1,1,'amber');
    insert into public.drawing_links(project_id,drawing_id,drawing_revision_id,drawing_zone_id,linked_record_type,linked_record_id,metadata)
      values('${ids.project}','${ids.drawing}','${ids.revision}','${zoneA}','drawing','${ids.drawing2}','{"test":"retained"}');
    insert into public.drawing_zone_dependencies(project_id,source_zone_id,target_zone_id,relationship,note)
      values('${ids.project}','${zoneA}','${zoneB}','blocks','Connection approval');
    insert into public.drawing_watchers(project_id,drawing_id,user_id) values('${ids.project}','${ids.drawing}','${ids.pm}');
    grant select,insert,update,delete on public.drawing_zones,public.drawing_links,public.drawing_zone_dependencies to authenticated,service_role;
    alter default privileges grant all on tables to authenticated,service_role;
    alter default privileges grant execute on functions to authenticated,service_role;
  `);
  for(const table of ['drawings','drawing_sets','drawing_revisions'])await db.exec(`
    create trigger trg_audit_log after insert or update or delete on public.${table} for each row execute function public.audit_log_trigger();
    alter table public.${table} enable row level security;
    create policy fixture_read on public.${table} for select to authenticated using(public.user_has_project_access(project_id));
    create policy fixture_update on public.${table} for update to authenticated using(public.user_has_project_role_at_least(project_id,'pm')) with check(public.user_has_project_role_at_least(project_id,'pm'));
    create policy fixture_insert on public.${table} for insert to authenticated with check(public.user_has_project_role_at_least(project_id,'pm'));
    create policy fixture_delete on public.${table} for delete to authenticated using(public.user_has_project_role_at_least(project_id,'admin'));
  `);
}
export async function request(db:Database):Promise<Record<string,unknown>>{
  const set=(await db.query('select * from public.drawing_sets where id=$1',[ids.set])).rows[0];
  const drawing=(await db.query('select * from public.drawings where id=$1',[ids.drawing])).rows[0];
  const sources=(await db.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,[path]])).rows[0].sources;
  return { project_id:ids.project,set_id:ids.set,expected_set_updated_at:set.updated_at,expected_set_revision:set.revision,
    revision_label:'B',issued_date:'2026-10-09',file_path:path,
    source_objects:sources,sheets:[{action:'revised',drawing_id:ids.drawing,expected_updated_at:drawing.updated_at,
      expected_revision_id:ids.revision,sheet_number:'S1',sheet_title:'Reviewed connections',revision_code:'B',file_path:path,pdf_page:7,reviewed:true,
      extraction:{text:{state:'unavailable'},callouts:{state:'unavailable'}}}]};
}
export async function execute(db:Database,payload:Record<string,unknown>,key='dddddddd-dddd-4ddd-8ddd-dddddddddddd'){
  return (await db.query('select public.apply_drawing_set_revision($1::uuid,$2::jsonb) result',[key,JSON.stringify(payload)])).rows[0]?.result as Record<string,unknown>;
}
export async function createRequest(db:Database):Promise<Record<string,unknown>>{
  const revision=await request(db);
  const incoming:Record<string,unknown>={...(revision.sheets as Record<string,unknown>[])[0],action:'added'};
  delete incoming.drawing_id;delete incoming.expected_updated_at;delete incoming.expected_revision_id;
  return {project_id:ids.project,set_name:'Reviewed new set',set_number:null,revision_label:'B',discipline:null,
    issued_date:null,issued_by:null,notes:null,file_path:path,source_objects:revision.source_objects,sheets:[incoming]};
}
export async function createSet(db:Database,payload:Record<string,unknown>,key='dddddddd-dddd-4ddd-8ddd-dddddddddddd'){
  return (await db.query('select public.create_drawing_set_from_review($1::uuid,$2::jsonb) result',[key,JSON.stringify(payload)])).rows[0].result as Record<string,unknown>;
}
export async function receipt(db:Database,payload:Record<string,unknown>,operation='create_set',key='dddddddd-dddd-4ddd-8ddd-dddddddddddd'){
  return (await db.query('select public.get_drawing_command_receipt($1::uuid,$2::text,$3::jsonb) result',[key,operation,JSON.stringify(payload)])).rows[0].result as Record<string,unknown>;
}
