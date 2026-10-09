import assert from 'node:assert/strict';
import { ids, actor, execute, request, path, zoneA, zoneB, type Database } from './fixture.ts';
import { command, parent, submit, checklist, execute as roundExecute } from '../submittal-revision-evidence/cases.ts';

type Payload=Awaited<ReturnType<typeof request>>;
const sheet=(p:Payload)=>(p.sheets as Record<string,unknown>[])[0];
export const tables=['public.drawing_sets','public.drawings','public.drawing_revisions','public.drawing_zones','public.drawing_links',
  'public.drawing_zone_dependencies','public.drawing_activity','public.drawing_zone_activity','public.alerts','public.submittals',
  'public.submittal_rounds','public.submittal_round_revision_evidence','steelbuild_drawing_revision.requests','steelbuild_drawing_revision.source_observations'];
export async function snapshot(db:Database){
  const result:Record<string,unknown>={};
  for(const table of tables)result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from ${table} t`)).rows[0].value;
  return result;
}
export async function denied(db:Database,work:()=>Promise<unknown>,pattern:RegExp){
  const before=await snapshot(db);
  await db.exec('savepoint rejected;set local role authenticated');
  try{await assert.rejects(work,pattern);}finally{await db.exec('rollback to savepoint rejected;reset role');}
  assert.deepEqual(await snapshot(db),before,'Rejected command must leave every source, activity, evidence and receipt row unchanged');
}
async function allowed(db:Database,payload:Payload,key?:string){
  await db.exec('set local role authenticated');
  const result=await execute(db,payload,key);await db.exec('reset role');return result;
}
export async function runCases(db:Database){
  let checks=0;
  async function check(name:string,run:()=>Promise<void>){
    await db.exec('begin');await actor(db);
    try{await run();checks++;console.log(`PASS ${name}`);}finally{await db.exec('rollback;reset role');}
  }
  await check('replacement without harvested extraction clears current unknowns and preserves actual prior source observation',async()=>{
    await db.query('update public.drawings set extracted_text=$1,callouts=$2 where id=$3',['OLD CONNECTION NOTE',JSON.stringify([{targetSheetNumber:'S2',text:'3/S2'}]),ids.drawing]);
    const prior=(await db.query('select * from public.drawings where id=$1',[ids.drawing])).rows[0];
    await allowed(db,await request(db));
    assert.deepEqual((await db.query('select extracted_text,callouts from public.drawings where id=$1',[ids.drawing])).rows[0],{extracted_text:null,callouts:null});
    const observed=(await db.query('select * from steelbuild_drawing_revision.source_observations where drawing_id=$1',[ids.drawing])).rows[0];
    assert.equal(observed.parent_file_url,prior.file_url);assert.equal(observed.parent_pdf_page,prior.pdf_page);assert.equal(observed.parent_revision_number,prior.revision_number);
    assert.equal(observed.extracted_text,'OLD CONNECTION NOTE');assert.deepEqual(observed.callouts,prior.callouts);
    assert.equal(observed.observed_current_revision_id,ids.revision);
  });
  await check('whole reviewed revision carries internal topology and preserves originals',async()=>{
    const payload=await request(db),before=await snapshot(db);
    const result=await allowed(db,payload);
    assert.deepEqual([result.revised,result.added,result.removed,result.zones_cloned,result.links_cloned,result.dependencies_cloned],[1,0,0,2,1,1]);
    const current=(await db.query('select * from public.drawing_revisions where drawing_id=$1 and is_current',[ids.drawing])).rows[0];
    assert.equal(current.revision_code,'B');assert.equal(current.release_status,'received');assert.equal(current.file_url,path);assert.equal(current.pdf_page,7);
    const parentRow=(await db.query('select * from public.drawings where id=$1',[ids.drawing])).rows[0];
    assert.equal(parentRow.stage,'Not Started');assert.equal(parentRow.set_approval_status,'pending_review');assert.equal(parentRow.revision_number,'B');
    const set=(await db.query('select * from public.drawing_sets where id=$1',[ids.set])).rows[0];
    assert.equal(set.revision,'B');assert.equal(set.file_url,path);assert.equal(JSON.parse(set.revision_history as string).length,1);
    const zones=(await db.query('select * from public.drawing_zones where drawing_revision_id=$1 order by zone_key',[current.id])).rows;
    assert.deepEqual(zones.map(z=>z.parent_zone_id),[zoneA,zoneB]);assert.ok(zones.every(z=>z.status==='neutral'&&z.is_manual_status_override===false));
    const edge=(await db.query('select * from public.drawing_zone_dependencies where source_zone_id=$1',[zones[0].id])).rows[0];
    assert.equal(edge.target_zone_id,zones[1].id);assert.equal(edge.relationship,'blocks');assert.equal(edge.note,'Connection approval');
    const link=(await db.query('select * from public.drawing_links where drawing_zone_id=$1',[zones[0].id])).rows[0];
    assert.equal(link.link_source,'inherited');assert.equal((link.metadata as Record<string,unknown>).test,'retained');
    assert.deepEqual((await db.query('select to_jsonb(z) row from public.drawing_zones z where id=any($1) order by id',[[zoneA,zoneB]])).rows.map(r=>r.row),before['public.drawing_zones']);
    assert.ok((await db.query('select count(*)::int n from public.alerts')).rows[0].n as number>0,'Existing watch trigger must execute');
  });
  for(const [text,callouts] of [['',[]],['NEW CONNECTION NOTE',[{targetSheetNumber:'S9',text:'9/S9'}]]] as const)
    await check('explicit harvested values including inspected-empty are preserved exactly',async()=>{
      const p=await request(db);sheet(p).extraction={text:{state:'harvested',value:text},callouts:{state:'harvested',value:callouts}};
      const result=await allowed(db,p);
      assert.deepEqual((await db.query('select extracted_text,callouts from public.drawings where id=$1',[ids.drawing])).rows[0],{extracted_text:text,callouts});
      assert.equal(Object.hasOwn(result,'extraction'),false);assert.equal(JSON.stringify(result).includes('NEW CONNECTION NOTE'),false);
    });
  for(const known of ['text','callouts'])await check(`independent ${known} harvest never implies the other field was inspected`,async()=>{
    const p=await request(db);sheet(p).extraction={text:{state:'unavailable'},callouts:{state:'unavailable'},[known]:{state:'harvested',value:known==='text'?'NEW NOTE':[]}};
    await allowed(db,p);
    assert.deepEqual((await db.query('select extracted_text,callouts from public.drawings where id=$1',[ids.drawing])).rows[0],
      {extracted_text:known==='text'?'NEW NOTE':null,callouts:known==='callouts'?[]:null});
  });
  for(const extraction of [undefined,null,{}, {text:{state:'unavailable'}},
    {text:{state:'unavailable',value:''},callouts:{state:'unavailable'}},
    {text:{state:'harvested',value:null},callouts:{state:'unavailable'}},
    {text:{state:'harvested',value:4},callouts:{state:'unavailable'}},
    {text:{state:'unavailable'},callouts:{state:'harvested',value:{}}},
    {text:{state:'unavailable'},callouts:{state:'unknown'}},
    {text:{state:'unavailable'},callouts:{state:'unavailable'},provenance:'inferred'},
    {text:{state:'harvested',value:'x'.repeat(65537)},callouts:{state:'unavailable'}},
    {text:{state:'unavailable'},callouts:{state:'harvested',value:['x'.repeat(65537)]}},
  ])await check('missing malformed or oversized extraction state refuses the whole command',async()=>{
    const p=await request(db);sheet(p).extraction=extraction;await denied(db,()=>execute(db,p),/EXTRACTION/);
  });
  await check('receipt hash binds exact extraction and replay retains one private observation',async()=>{
    const p=await request(db);await allowed(db,p);await allowed(db,p);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.source_observations')).rows[0].n,1);
    sheet(p).extraction={text:{state:'harvested',value:''},callouts:{state:'unavailable'}};
    await denied(db,()=>execute(db,p),/REQUEST_CONFLICT/);
  });
  await check('observed parent mismatch is preserved without attributing extraction to historical revision',async()=>{
    await db.query('update public.drawings set revision_number=$1,file_url=$2,pdf_page=42,extracted_text=$3 where id=$4',['UNVERIFIED-LEGACY','legacy-parent.pdf','PRIVATE PRIOR NOTE',ids.drawing]);
    const old=(await db.query('select file_url,pdf_page,revision_code from public.drawing_revisions where id=$1',[ids.revision])).rows[0];
    const result=await allowed(db,await request(db));
    const o=(await db.query('select * from steelbuild_drawing_revision.source_observations')).rows[0];
    assert.deepEqual([o.parent_file_url,o.parent_pdf_page,o.parent_revision_number,o.extracted_text],['legacy-parent.pdf',42,'UNVERIFIED-LEGACY','PRIVATE PRIOR NOTE']);
    assert.deepEqual((await db.query('select file_url,pdf_page,revision_code from public.drawing_revisions where id=$1',[ids.revision])).rows[0],old);
    assert.equal(JSON.stringify(result).includes('PRIVATE PRIOR NOTE'),false);
  });
  for(const value of ["'null'::jsonb",'null'])await check(`prior ${value} callouts retain their exact SQL value`,async()=>{
    await db.exec(`update public.drawings set callouts=${value} where id='${ids.drawing}'`);
    await allowed(db,await request(db));
    assert.equal((await db.query('select callouts is null unknown from steelbuild_drawing_revision.source_observations')).rows[0].unknown,value==='null');
  });
  for(const column of ['extracted_text','callouts'])await check(`oversized prior ${column} refuses retention without truncation`,async()=>{
    await db.query(`update public.drawings set ${column}=${column==='callouts'?'to_jsonb($1::text)':'$1'} where id=$2`,['x'.repeat(65537),ids.drawing]);
    const p=await request(db);await denied(db,()=>execute(db,p),/OBSERVATION_LIMIT/);
  });
  await check('maximum per-field prior extraction is retained exactly',async()=>{
    await db.query("update public.drawings set extracted_text=$1,callouts=to_jsonb($2::text) where id=$3",['x'.repeat(65536),'y'.repeat(65534),ids.drawing]);
    await allowed(db,await request(db));
    assert.deepEqual((await db.query('select octet_length(extracted_text) text_bytes,octet_length(callouts::text) callout_bytes from steelbuild_drawing_revision.source_observations')).rows[0],{text_bytes:65536,callout_bytes:65536});
  });
  await check('Auth anonymization retains observations and exact business source context',async()=>{
    await allowed(db,await request(db));const observations=(await snapshot(db))['steelbuild_drawing_revision.source_observations'];
    await db.query('delete from auth.users where id=$1',[ids.pm]);
    assert.equal((await db.query('select actor_id from steelbuild_drawing_revision.requests')).rows[0].actor_id,null);
    assert.deepEqual((await snapshot(db))['steelbuild_drawing_revision.source_observations'],observations);
  });
  await check('soft archives retain observations and do not add captured-source deletion authority',async()=>{
    await roundExecute(db,command(await parent(db,ids.submittal),submit));
    await allowed(db,await request(db));const observations=(await snapshot(db))['steelbuild_drawing_revision.source_observations'];
    await db.query('update public.drawings set is_deleted=true,deleted_at=now() where id=$1',[ids.drawing]);
    assert.deepEqual((await snapshot(db))['steelbuild_drawing_revision.source_observations'],observations);
    await denied(db,()=>db.query('delete from public.drawings where id=$1',[ids.drawing]),/IMMUTABLE|foreign key/);
    await denied(db,()=>db.query('delete from public.drawing_sets where id=$1',[ids.set]),/IMMUTABLE|foreign key/);
  });
  await check('authorized project erasure cascades private receipts and observations',async()=>{
    await allowed(db,await request(db));
    await db.query('select public.soft_delete_project($1)',[ids.project]);
    await db.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic drawing observation erasure verification']);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.source_observations')).rows[0].n,0);
  });
  await check('captured source and round evidence remain intact while new source becomes unapproved',async()=>{
    await roundExecute(db,command(await parent(db,ids.submittal),submit));
    await roundExecute(db,command(await parent(db,ids.submittal),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}}));
    const evidence=(await snapshot(db))['public.submittal_round_revision_evidence'];
    const old=(await db.query('select to_jsonb(r)-array[\'is_current\',\'archived_at\',\'updated_at\',\'updated_by\'] row from public.drawing_revisions r where id=$1',[ids.revision])).rows[0].row;
    await allowed(db,await request(db));
    assert.deepEqual((await snapshot(db))['public.submittal_round_revision_evidence'],evidence);
    assert.deepEqual((await db.query('select to_jsonb(r)-array[\'is_current\',\'archived_at\',\'updated_at\',\'updated_by\'] row from public.drawing_revisions r where id=$1',[ids.revision])).rows[0].row,old);
    const coverage=(await db.query('select public.get_submittal_revision_coverage($1) result',[ids.submittal])).rows[0].result as Record<string,unknown>;
    assert.equal(coverage.ok,false);
    assert.equal((await parent(db,ids.submittal)).status,'Approved','Historical return approval stays in its original record');
  });
  await check('incomplete historical source is never backfilled',async()=>{
    await db.exec(`update public.drawing_revisions set file_url=null,pdf_page=null where id='${ids.revision}'`);
    await allowed(db,await request(db));
    assert.deepEqual((await db.query('select file_url,pdf_page from public.drawing_revisions where id=$1',[ids.revision])).rows[0],{file_url:null,pdf_page:null});
  });
  await check('same actor and exact request returns one receipt after a lost response',async()=>{
    const p=await request(db),first=await allowed(db,p),after=await snapshot(db);
    assert.deepEqual(await allowed(db,p),first);assert.deepEqual(await snapshot(db),after);
    await denied(db,()=>execute(db,{...p,notes:'changed'}),/REQUEST_CONFLICT/);
  });
  await check('same key cannot disclose another actor receipt',async()=>{
    const p=await request(db);await allowed(db,p);
    await db.exec(`update auth.test_access set is_pm=true where user_id='${ids.viewer}'`);await actor(db,ids.viewer);
    await denied(db,()=>execute(db,p),/STALE/);
  });
  for(const access of ['is_member','is_pm','mfa_satisfied'])await check(`${access} required for write and source read`,async()=>{
    const p=await request(db);await db.exec(`update auth.test_access set ${access}=false where user_id='${ids.pm}'`);
    await denied(db,()=>execute(db,p),/NOT_AUTHORIZED/);
    await denied(db,()=>db.query('select public.get_drawing_revision_sources($1,$2)',[ids.project,[path]]),/NOT_AUTHORIZED/);
  });
  await check('low assurance and foreign project never receive sources or command result',async()=>{
    const p=await request(db);await actor(db,ids.pm,'aal1');await denied(db,()=>execute(db,p),/NOT_AUTHORIZED/);
    await actor(db);await denied(db,()=>execute(db,{...p,project_id:ids.foreignProject}),/NOT_AUTHORIZED/);
  });
  await check('default grants do not expose receipts or helper functions to application roles',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      const privileges=(await db.query(`select has_schema_privilege($1,'steelbuild_drawing_revision','USAGE') schema,
        has_table_privilege($1,'steelbuild_drawing_revision.requests','SELECT,INSERT,UPDATE,DELETE') table_access,
        has_function_privilege($1,'steelbuild_drawing_revision.assert_access(uuid)','EXECUTE') helper,
        has_table_privilege($1,'steelbuild_drawing_revision.source_observations','SELECT,INSERT,UPDATE,DELETE') observations,
        has_function_privilege($1,'steelbuild_drawing_revision.observe_source(public.drawings,public.drawing_revisions)','EXECUTE') observation_helper`,[role])).rows[0];
      assert.deepEqual(privileges,{schema:false,table_access:false,helper:false,observations:false,observation_helper:false});
      assert.equal((await db.query("select has_function_privilege($1,'public.apply_drawing_set_revision(uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,role==='authenticated');
    }
  });
  await check('snapshot reader is read-only and binds object identity metadata',async()=>{
    const before=await snapshot(db),p=await request(db);assert.deepEqual(await snapshot(db),before);
    const first=(p.source_objects as Record<string,unknown>[])[0];assert.match(first.token as string,/^[0-9a-f]{64}$/);assert.deepEqual(Object.keys(first).sort(),['path','token']);
    await db.exec(`update storage.objects set metadata='{"eTag":"replacement"}' where name='${path}'`);
    assert.notDeepEqual((await request(db)).source_objects,p.source_objects);await denied(db,()=>execute(db,p),/SOURCE_CHANGED/);
  });
  for(const field of ['id','version','updated_at'])await check(`changed Storage ${field} invalidates reviewed token`,async()=>{
    const p=await request(db);const value=field==='id'?'gen_random_uuid()':field==='version'?"'replacement'":"updated_at+interval '1 second'";
    await db.exec(`update storage.objects set ${field}=${value} where name='${path}'`);await denied(db,()=>execute(db,p),/SOURCE_CHANGED/);
  });
  await check('missing object rejects whole revision',async()=>{
    const p=await request(db);await db.query('delete from storage.objects where name=$1',[path]);await denied(db,()=>execute(db,p),/SOURCE_CHANGED/);
  });
  for(const candidate of [`${ids.org}/uploads/legacy.pdf`,`${ids.org}/uploads/${ids.foreignProject}/foreign.pdf`,`${ids.foreign}/uploads/${ids.project}/foreign.pdf`])
    await check('reader rejects unbound legacy or foreign source path',async()=>{
      await denied(db,()=>db.query('select public.get_drawing_revision_sources($1,$2)',[ids.project,[candidate]]),/SOURCE_SCOPE/);
      const p=await request(db);p.file_path=candidate;sheet(p).file_path=candidate;(p.source_objects as Record<string,unknown>[])[0].path=candidate;
      await denied(db,()=>execute(db,p),/SOURCE_SCOPE/);
    });
  for(const [name,mutate,pattern] of [
    ['oversized payload',(p:Payload)=>{p.notes='x'.repeat(1048576);},/INVALID/],
    ['251 sheet roster',(p:Payload)=>{p.sheets=Array.from({length:251},()=>({...sheet(p)}));},/INVALID/],
    ['251 source snapshots',(p:Payload)=>{p.source_objects=Array.from({length:251},()=>({path,token:'0'.repeat(64)}));},/INVALID/],
    ['missing roster',(p:Payload)=>{p.sheets=[];},/INVALID/],
    ['unknown request key',(p:Payload)=>{p.approve=true;},/INVALID/],
    ['unknown action',(p:Payload)=>{sheet(p).action='approve';},/INVALID/],
    ['null action',(p:Payload)=>{sheet(p).action=null;},/INVALID/],
    ['numeric revision label',(p:Payload)=>{p.revision_label=9;},/INVALID/],
    ['numeric source page string',(p:Payload)=>{sheet(p).pdf_page='7';},/INVALID/],
    ['unreviewed sheet',(p:Payload)=>{sheet(p).reviewed=false;},/INVALID/],
    ['reused code',(p:Payload)=>{sheet(p).revision_code='A';},/DUPLICATE/],
    ['stale set',(p:Payload)=>{p.expected_set_revision='wrong';},/STALE/],
    ['stale revision',(p:Payload)=>{sheet(p).expected_revision_id=ids.revision2;},/STALE/],
    ['changed mark',(p:Payload)=>{sheet(p).sheet_number='S-WRONG';},/STALE/],
    ['duplicate roster',(p:Payload)=>{(p.sheets as unknown[]).push({...sheet(p)});},/STALE/],
    ['untracked revised sheet',(p:Payload)=>{sheet(p).expected_revision_id=null;},/STALE/],
  ] as const)await check(name,async()=>{const p=await request(db);mutate(p);await denied(db,()=>execute(db,p),pattern);});
  for(const update of ["is_locked=true","is_deleted=true","deleted_at=now()"])
    await check(`set ${update} blocks revision`,async()=>{const p=await request(db);await db.exec(`update public.drawing_sets set ${update} where id='${ids.set}'`);await denied(db,()=>execute(db,p),/SET_UNAVAILABLE/);});
  await check('unreviewed late sheet invalidates complete roster',async()=>{
    const p=await request(db);await db.exec(`insert into public.drawings(project_id,drawing_set_id,sheet_number,title) values('${ids.project}','${ids.set}','S-LATE','Late source')`);
    // The count trigger changes the header too; acknowledge that only, leaving the roster stale.
    p.expected_set_updated_at=(await db.query('select updated_at from public.drawing_sets where id=$1',[ids.set])).rows[0].updated_at;
    await denied(db,()=>execute(db,p),/STALE/);
  });
  await check('legacy name-only routing rejects command',async()=>{
    const p=await request(db);await db.exec(`insert into public.drawings(project_id,drawing_set_name,sheet_number,title) values('${ids.project}','Shop A','LEGACY','Legacy source')`);
    await denied(db,()=>execute(db,p),/legacy name-only/);
  });
  await check('foreign project parent and revision routing reject before writes',async()=>{
    const p=await request(db);await db.exec(`update public.drawings set project_id='${ids.foreignProject}' where id='${ids.drawing}'`);
    await denied(db,()=>execute(db,p),/STALE/);
  });
  await check('source reader rejects duplicate paths',async()=>{
    await denied(db,()=>db.query('select public.get_drawing_revision_sources($1,$2)',[ids.project,[path,path]]),/SOURCE_SCOPE/);
  });
  await check('cleared empty current tracking requires explicit completion',async()=>{
    await db.exec(`update public.drawing_revisions set is_current=false where id='${ids.revision}'`);
    const p=await request(db);sheet(p).expected_revision_id=null;await denied(db,()=>execute(db,p),/TRACKING_REQUIRED/);
  });
  await check('installed manifest guard still prevents an archived current revision',async()=>{
    await denied(db,()=>db.exec(`update public.drawing_revisions set archived_at=now() where id='${ids.revision}'`),/ARCHIVED_REVISION/);
  });
  await check('cross-sheet dependency refuses silent edge loss',async()=>{
    await db.exec(`insert into public.drawing_zones(id,project_id,drawing_id,drawing_revision_id,zone_key,label,x_min,y_min,x_max,y_max)
      values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${ids.project}','${ids.drawing2}','${ids.revision2}','Z-X','External',0,0,1,1);
      update public.drawing_zone_dependencies set target_zone_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'`);
    const p=await request(db);await denied(db,()=>execute(db,p),/TOPOLOGY/);
  });
  // Payload is acquired inside each transaction in topology tests below.
  for(const mutation of [`update public.drawing_zones set is_active=false where id='${zoneB}'`,
    `update public.drawing_zones set deleted_at=now() where id='${zoneB}'`])await check('inactive dependency endpoint rejects entire command',async()=>{
      await db.exec(mutation);const p=await request(db);await denied(db,()=>execute(db,p),/TOPOLOGY/);
    });
  await check('active link on inactive zone is never silently discarded',async()=>{
    await db.exec(`update public.drawing_zone_dependencies set removed_at=now();update public.drawing_zones set is_active=false where id='${zoneA}'`);
    const p=await request(db);await denied(db,()=>execute(db,p),/TOPOLOGY/);
  });
  await check('all unchanged roster does not manufacture a revision',async()=>{
    const p=await request(db);sheet(p).action='same';await denied(db,()=>execute(db,p),/INVALID/);
  });
  await check('removed sheet with active dependency or hold rejects atomically',async()=>{
    const p=await request(db);sheet(p).action='removed';await denied(db,()=>execute(db,p),/TOPOLOGY/);
    await db.exec(`update public.drawing_zone_dependencies set removed_at=now();update public.drawing_links set removed_at=now();insert into public.drawing_holds values(gen_random_uuid(),'${ids.project}','${ids.drawing}',true)`);
    await denied(db,()=>execute(db,p),/HOLD/);
  });
  await check('added sheet and explicit removal commit together without erasing history',async()=>{
    await db.exec('update public.drawing_zone_dependencies set removed_at=now();update public.drawing_links set removed_at=now()');
    const p=await request(db),added:Record<string,unknown>={...sheet(p),action:'added',sheet_number:'S3'};
    delete added.drawing_id;delete added.expected_updated_at;delete added.expected_revision_id;
    sheet(p).action='removed';(p.sheets as unknown[]).push(added);
    const result=await allowed(db,p);assert.deepEqual([result.added,result.removed,result.sheet_count],[1,1,1]);
    assert.equal((await db.query('select is_superseded from public.drawings where id=$1',[ids.drawing])).rows[0].is_superseded,true);
    assert.equal((await db.query('select count(*)::int n from public.drawing_zones where drawing_revision_id=$1',[ids.revision])).rows[0].n,2);
    assert.deepEqual((await db.query("select extracted_text,callouts from public.drawings where sheet_number='S3'")).rows[0],{extracted_text:null,callouts:null});
    assert.deepEqual((await db.query('select drawing_id from steelbuild_drawing_revision.source_observations')).rows,[{drawing_id:ids.drawing}]);
  });
  for(const table of ['drawing_revisions','drawing_zones','drawing_links','drawing_zone_dependencies','drawings','drawing_sets','requests','source_observations'])
    await check(`failure at ${table} rolls back every preceding source and activity write`,async()=>{
      const schema=['requests','source_observations'].includes(table)?'steelbuild_drawing_revision':'public';
      await db.exec(`create function public.fail_reviewed_write() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_FAILURE'; end $$;
        create trigger zzz_injected_failure before ${['drawings','drawing_sets'].includes(table)?'update':'insert'} on ${schema}.${table} for each row execute function public.fail_reviewed_write()`);
      const p=await request(db);await denied(db,()=>execute(db,p),/INJECTED_FAILURE/);
    });
  await check('repeatable-read refuses stale MVCC admission',async()=>{
    await db.exec('rollback;begin isolation level repeatable read');await actor(db);
    await denied(db,()=>db.query('select public.get_drawing_revision_sources($1,$2)',[ids.project,[path]]),/ISOLATION/);
  });
  return checks;
}
