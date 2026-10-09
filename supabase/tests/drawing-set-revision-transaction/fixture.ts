import { readFile } from 'node:fs/promises';
import { initialize as baseInitialize, ids, actor, migrationUrl, sourcePath, type Database } from '../submittal-revision-evidence/fixture.ts';
export { ids, actor, type Database };
export const candidateUrl=new URL('../../candidates/drawing-set-revision-transaction.sql',import.meta.url);
export const path=`${ids.org}/uploads/${ids.project}/reviewed-new.pdf`;
export const zoneA='abababab-abab-4bab-8bab-abababababab',zoneB='bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc';
export async function initialize(db:Database){
  await baseInitialize(db);
  await db.exec(await readFile(migrationUrl,'utf8'));
  const baseline=await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql',import.meta.url),'utf8');
  for(const table of ['drawing_zones','drawing_links','drawing_zone_dependencies','drawing_activity','drawing_zone_activity','drawing_watchers','alerts']){
    const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
    await db.exec(baseline.slice(start,baseline.indexOf('\n);',start)+3));
    await db.exec(`alter table public.${table} add primary key(${table==='drawing_watchers'?'drawing_id,user_id':'id'})`);
  }
  for(const statement of baseline.matchAll(/ALTER TABLE ONLY "public"\."(drawing_zones|drawing_links|drawing_zone_dependencies|drawing_activity|drawing_zone_activity|drawing_watchers|alerts)"\s+ADD CONSTRAINT[^;]+FOREIGN KEY[^;]+;/g)){
    await db.exec(statement[0]);
  }
  for(const name of ['tg_validate_drawing_zone_dependency_project','validate_drawing_link_target','validate_drawing_zone_polygon','update_updated_at','sync_drawing_set_counts','log_drawing_activity','log_drawing_zone_activity','log_drawing_link_activity','drawing_watch_notify_revision']){
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
    alter table public.drawing_holds add foreign key(drawing_id) references public.drawings(id);
    create function public.user_is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
      select p_org='${ids.org}'::uuid and coalesce((select is_member from auth.test_access where user_id=auth.uid()),false) $$;
    create unique index drawing_revision_unique_code on public.drawing_revisions(drawing_id,revision_code);
    create unique index drawing_revision_unique_version on public.drawing_revisions(drawing_id,version_number);
    create unique index drawing_zone_unique_key on public.drawing_zones(drawing_revision_id,zone_key);
    create unique index drawing_links_active_unique on public.drawing_links(drawing_zone_id,linked_record_type,linked_record_id,link_role) where removed_at is null;
    create unique index drawing_dependencies_active_unique on public.drawing_zone_dependencies(source_zone_id,target_zone_id,relationship) where removed_at is null;
    update public.drawing_sets set revision='A',file_url='${sourcePath}',updated_at='2026-10-09T00:00:00Z' where id='${ids.set}';
    update public.drawings set revision_number='A',updated_at='2026-10-09T00:00:00Z' where id='${ids.drawing}';
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
}
export async function request(db:Database):Promise<Record<string,unknown>>{
  const set=(await db.query('select * from public.drawing_sets where id=$1',[ids.set])).rows[0];
  const drawing=(await db.query('select * from public.drawings where id=$1',[ids.drawing])).rows[0];
  const sources=(await db.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,[path]])).rows[0].sources;
  return { project_id:ids.project,set_id:ids.set,expected_set_updated_at:set.updated_at,expected_set_revision:set.revision,
    revision_label:'B',issued_date:'2026-10-09',file_path:path,
    source_objects:sources,sheets:[{action:'revised',drawing_id:ids.drawing,expected_updated_at:drawing.updated_at,
      expected_revision_id:ids.revision,sheet_number:'S1',sheet_title:'Reviewed connections',revision_code:'B',file_path:path,pdf_page:7,reviewed:true}]};
}
export async function execute(db:Database,payload:Record<string,unknown>,key='dddddddd-dddd-4ddd-8ddd-dddddddddddd'){
  return (await db.query('select public.apply_drawing_set_revision($1::uuid,$2::jsonb) result',[key,JSON.stringify(payload)])).rows[0]?.result as Record<string,unknown>;
}
