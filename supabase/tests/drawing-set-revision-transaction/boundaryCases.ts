import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { actor, ids, request, execute, createRequest, createSet, type Database } from './fixture.ts';
import { denied, snapshot } from './cases.ts';
import { command, parent, submit, checklist, execute as roundExecute } from '../submittal-revision-evidence/cases.ts';

export async function runBoundaryCases(db:Database){
  let checks=0;
  async function check(name:string,run:()=>Promise<void>){
    if(process.env.DRAWING_BOUNDARY_CASE && !name.includes(process.env.DRAWING_BOUNDARY_CASE))return;
    await db.exec('begin');await actor(db);
    try{await run();checks++;console.log(`PASS ${name}`);}finally{await db.exec('rollback;reset role');}
  }
  async function authenticated<T>(run:()=>Promise<T>){await db.exec('set local role authenticated');const result=await run();await db.exec('reset role');return result;}
  async function workflow(patch:Record<string,unknown>,submittal=ids.submittal){
    const coverage=(await db.query('select public.get_submittal_revision_coverage($1) result',[submittal])).rows[0].result as {current_revision_ids:string[]};
    const c=command(await parent(db,submittal),patch,randomUUID(),coverage.current_revision_ids);
    return authenticated(()=>roundExecute(db,c));
  }
  async function approval(set=ids.set){return (await db.query('select set_approval_status status from public.drawing_sets where id=$1',[set])).rows[0].status;}
  for(const create of [false,true])for(const phase of ['receipt','revision_insert','before_row'])
    await check(`immediateWriterCannotBorrowIntake ${create?'create':'revise'} ${phase}`,async()=>{
      const payload=await (create?createRequest:request)(db);
      const body=phase==='before_row'?"new.file_url:='unreviewed.pdf';return new;":
        `update public.drawings set file_url='unreviewed.pdf' where id=${phase==='receipt'?'(select id from public.drawings where drawing_set_id=new.set_id order by id limit 1)':'new.drawing_id'};return new;`;
      await db.exec(`create function public.immediate_source_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin ${body}end $$;
        create trigger zzz_immediate_source_writer ${phase==='before_row'?`before ${create?'insert':'update'} on public.drawings`:phase==='receipt'?'after insert on steelbuild_drawing_revision.requests':'after insert on public.drawing_revisions'}
        for each row execute function public.immediate_source_writer()`);
      await denied(db,()=>(create?createSet:execute)(db,payload),/COMMAND_REQUIRED|TRANSITION/);
      assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,0);
    });
  await check('immediateDailyWriterCannotBorrowPublicationValues',async()=>{
    await db.exec(`create function public.immediate_publication_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin
      update public.drawing_revisions set release_status='released_for_shop' where id='${ids.revision}';return new;end $$;
      create trigger immediate_publication_writer after insert on public.drawing_activity for each row execute function public.immediate_publication_writer()`);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/COMMAND_REQUIRED|TRANSITION/);
  });
  await check('immediateCountWriterCannotInventDerivedCounts',async()=>{
    await db.exec(`create function public.immediate_count_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin
      update public.drawing_sets set sheet_count=999 where id=new.set_id;return new;end $$;
      create trigger immediate_count_writer after insert on steelbuild_drawing_revision.requests for each row execute function public.immediate_count_writer()`);
    await denied(db,()=>request(db).then(p=>execute(db,p)),/COMMAND_REQUIRED|TRANSITION/);
  });
  await check('laterBeforeCountTriggerCannotCorruptParentSource',async()=>{
    await db.exec(`create function public.corrupt_count_parent() returns trigger language plpgsql security definer set search_path='' as $$ begin
      if pg_trigger_depth()>1 then new.file_url:='unreviewed.pdf';end if;return new;end $$;
      create trigger zzzz_corrupt_count_parent before update on public.drawing_sets for each row execute function public.corrupt_count_parent()`);
    await denied(db,()=>createRequest(db).then(p=>createSet(db,p)),/COMMAND_REQUIRED|TRANSITION/);
  });
  await check('beforeInsertCannotBorrowCountLaneToArchiveNewParent',async()=>{
    await db.exec(`create function public.premature_recount() returns trigger language plpgsql security definer set search_path='' as $$ begin
      perform public.recount_drawing_set(new.drawing_set_id);return new;end $$;
      create trigger zzzz_premature_recount before insert on public.drawings for each row execute function public.premature_recount()`);
    await denied(db,()=>createRequest(db).then(p=>createSet(db,p)),/COMMAND_REQUIRED|TRANSITION/);
  });
  await check('projectArchiveCannotBorrowRestorationAuthority',async()=>{
    await db.exec(`create function public.archive_restore_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin
      update public.drawings set is_deleted=false,deleted_at=null where id=new.id;return new;end $$;
      create trigger archive_restore_writer after update on public.drawings for each row when(new.is_deleted) execute function public.archive_restore_writer()`);
    await denied(db,()=>db.query('select public.soft_delete_project($1)',[ids.project]),/COMMAND_REQUIRED|TRANSITION/);
  });
  await check('singleUseIntentsArePrivateAndLeaveNoAuthority',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      assert.equal((await db.query("select has_table_privilege($1,'steelbuild_drawing_revision.write_intents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed,false);
      assert.equal((await db.query("select has_function_privilege($1,'steelbuild_drawing_revision.write_row(uuid,regclass,text,jsonb,uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
    }
    await authenticated(()=>request(db).then(p=>execute(db,p)));
    const hold=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'Exact transition']))).rows[0];
    await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[hold.id,'Resolved']));
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.write_intents')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
  });
  await check('metadataLaneCannotChangeSQLNullSourceIntoJSONNull',async()=>{
    await db.query('update public.drawings set callouts=null where id=$1',[ids.drawing]);
    await db.exec(`create function public.null_source_writer() returns void language sql security definer set search_path='' as $$
      update public.drawings set callouts='null'::jsonb where id='${ids.drawing}' $$`);
    await denied(db,()=>db.query('select public.null_source_writer()'),/COMMAND_REQUIRED|TRANSITION/);
  });
  for(const kind of ['view','rewrite','reloptions'])await check(`reviewedPackageDetects ${kind} definition drift`,async()=>{
    await db.exec(`create view public.review_dependency as select true as allowed;
      create table public.review_sink(allowed boolean);
      create rule reviewed_insert as on insert to public.review_sink do instead nothing;
      insert into steelbuild_drawing_revision.package_review values(true,1,repeat('a',40),steelbuild_drawing_revision.catalog_fingerprint(),repeat('b',64),true)`);
    const before=(await db.query('select steelbuild_drawing_revision.catalog_fingerprint() hash')).rows[0].hash;
    await db.exec(kind==='view'?'create or replace view public.review_dependency as select false as allowed':kind==='rewrite'?
      'create or replace rule reviewed_insert as on insert to public.review_sink do instead select true':'alter view public.review_dependency set(security_invoker=true)');
    assert.notEqual((await db.query('select steelbuild_drawing_revision.catalog_fingerprint() hash')).rows[0].hash,before);
    assert.equal(((await authenticated(()=>db.query('select public.get_drawing_command_capabilities($1) result',[ids.project]))).rows[0].result as Record<string,unknown>).write_boundary,false);
  });
  await check('governingWorkflowNewSetAndRevisionCanReachPublication',async()=>{
    for(const create of [false,true]){
      await db.exec('savepoint intake');
      let set=ids.set;
      if(create){const result=await authenticated(()=>createRequest(db).then(p=>createSet(db,p)));set=result.set_id as string;
        await db.query('update public.submittals set drawing_set_ids=array[$1::uuid] where id=$2',[set,ids.submittal]);
      }else await authenticated(()=>request(db).then(p=>execute(db,p)));
      assert.equal(await approval(set),'pending_review');
      await workflow(submit);assert.equal(await approval(set),'pending_review');
      await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
      assert.equal(await approval(set),'approved');
      const revision=(await db.query('select r.id from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where d.drawing_set_id=$1 and r.is_current',[set])).rows[0].id;
      await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[revision,'released_for_shop']));
      assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[revision])).rows[0].release_status,'released_for_shop');
      assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
      await db.exec('rollback to savepoint intake');
    }
  });
  await check('sameSourceHoldClosureAfterGoverningDowngradeDoesNotRestoreRelease',async()=>{
    await workflow(submit);await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']));
    const held=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'Review correction']))).rows[0];
    await workflow({status:'Revise and Resubmit',ball_in_court:'Detailer'});assert.equal(await approval(),'pending_review');
    await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[held.id,'Hold closed; engineering correction remains']));
    assert.equal((await db.query('select is_active from public.drawing_holds where id=$1',[held.id])).rows[0].is_active,false);
    assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[ids.revision])).rows[0].release_status,'received');
  });
  await check('governingWorkflowUsesCurrentGovernorIncludingVoidFallback',async()=>{
    await workflow(submit);await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    const newer=randomUUID();
    await authenticated(()=>db.query("insert into public.submittals(id,project_id,submittal_number,title,submittal_type,drawing_set_ids) values($1,$2,'NEWER','Newer review','Shop Drawing',array[$3::uuid,$4::uuid])",[newer,ids.project,ids.set,ids.set2]));
    await workflow({...submit,submitted_date:'2026-10-10'},newer);assert.equal(await approval(),'pending_review');
    await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    assert.equal(await approval(),'pending_review','Older approval must not lend its status to newer submission');
    await workflow({status:'Rejected',ball_in_court:'Detailer'},newer);assert.equal(await approval(),'pending_review');
    await workflow({status:'Void'},newer);assert.equal(await approval(),'approved','Voiding current governor restores only independently valid fallback');
    await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']));
  });
  await check('governingWorkflowReplayAndChangedSourceNeverReapprove',async()=>{
    await workflow(submit);
    const c=command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await authenticated(()=>roundExecute(db,c));assert.equal(await approval(),'approved');
    await authenticated(()=>request(db).then(p=>execute(db,p)));assert.equal(await approval(),'pending_review');
    const before=await snapshot(db);await authenticated(()=>roundExecute(db,c));assert.deepEqual(await snapshot(db),before);
    const current=(await db.query('select public.get_submittal_revision_coverage($1) result',[ids.submittal])).rows[0].result as {current_revision_ids:string[]};
    const stale=command(await parent(db),{status:'Approved'},randomUUID(),current.current_revision_ids);
    await denied(db,()=>roundExecute(db,stale),/ROUND_LEGACY_RECONCILIATION_REQUIRED/);
    const revision=(await db.query('select id from public.drawing_revisions where drawing_id=$1 and is_current',[ids.drawing])).rows[0].id;
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[revision,'released_for_shop']),/APPROVAL_REQUIRED/);
  });
  await check('governingWorkflowChangedRosterAndForeignScopeRejectAtomically',async()=>{
    await workflow(submit);
    await db.query("insert into public.drawings(project_id,drawing_set_id,sheet_number) values($1,$2,'LATE')",[ids.project,ids.set]);
    const c=command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await denied(db,()=>roundExecute(db,c),/ROUND_SOURCE_INCOMPLETE/);
    await actor(db,ids.foreign);await denied(db,()=>roundExecute(db,c),/ROUND_NOT_AUTHORIZED/);
  });
  await check('governingWorkflowLateReceiptFailureRollsBackMarkerAndEvidence',async()=>{
    await workflow(submit);const c=command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await db.exec("create function public.fail_round_receipt() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_ROUND_RECEIPT';end $$;create trigger fail_round_receipt before insert on steelbuild_workflow.round_requests for each row execute function public.fail_round_receipt()");
    await denied(db,()=>roundExecute(db,c),/INJECTED_ROUND_RECEIPT/);assert.equal(await approval(),'pending_review');
  });
  for(const access of ['is_member','is_pm','mfa_satisfied'])await check(`governingWorkflowDeferredAuthorization ${access}`,async()=>{
    await workflow(submit);await db.exec('set constraints all immediate;set constraints all deferred');
    await db.exec('savepoint late_round');const before=await snapshot(db);
    await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await db.query(`update auth.test_access set ${access}=false where user_id=$1`,[ids.pm]);
    await assert.rejects(()=>db.exec('set constraints all immediate'),/NOT_AUTHORIZED/);
    await db.exec('rollback to savepoint late_round');assert.deepEqual(await snapshot(db),before);
  });
  await check('infoAndEstimateDistributionNeverGrantFabricationAuthority',async()=>{
    await authenticated(()=>request(db).then(p=>execute(db,p)));
    const revision=(await db.query('select id from public.drawing_revisions where drawing_id=$1 and is_current',[ids.drawing])).rows[0].id;
    for(const status of ['reviewed','released_for_estimate']){
      await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[revision,status]));assert.equal(await approval(),'pending_review');
      await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[revision,'released_for_field']),/APPROVAL_REQUIRED/);
    }
  });
  for(const blocker of ['rfi','signoff','none'])await check(`sameSourceHoldRestorationRechecks ${blocker}`,async()=>{
    await workflow(submit);await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']));
    const h=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'Review']))).rows[0];
    if(blocker==='rfi')await db.query("insert into public.rfis(id,project_id,rfi_number,drawing_set_id,status) values($1,$2,'RFI-NEW',$3,'Open')",[randomUUID(),ids.project,ids.set]);
    if(blocker==='signoff')await db.query('update public.projects set metadata=$1 where id=$2',[JSON.stringify({require_fab_signoffs:true}),ids.project]);
    await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[h.id,'Resolved hold']));
    assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[ids.revision])).rows[0].release_status,blocker==='none'?'released_for_shop':'received');
  });
  await check('pmDirectSourceWriteDenied',async()=>{
    await denied(db,()=>db.query('update public.drawings set file_url=$1 where id=$2',['forged.pdf',ids.drawing]),/permission denied|DRAWING_COMMAND_REQUIRED/);
    assert.equal((await db.query("select has_column_privilege('authenticated','public.drawings','file_url','UPDATE') allowed")).rows[0].allowed,false);
  });
  await check('truncateAndInheritedGrantsDenied',async()=>{
    for(const role of ['anon','authenticated','service_role'])for(const table of ['drawings','drawing_sets','drawing_revisions']){
      assert.equal((await db.query(`select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') allowed`,[role,`public.${table}`])).rows[0].allowed,false);
    }
    await denied(db,()=>db.exec('truncate public.drawings cascade'),/permission denied|DRAWING_COMMAND_REQUIRED/);
    for(const role of ['drawing_fixture_inherited','drawing_fixture_settable'])assert.equal((await db.query("select has_column_privilege($1,'public.drawings','file_url','UPDATE') or has_table_privilege($1,'public.drawings','TRUNCATE') allowed",[role])).rows[0].allowed,false);
  });
  await check('regrantedServiceTruncateStillCannotBypassBoundary',async()=>{
    await db.exec('grant truncate on all tables in schema public to service_role');
    await db.exec('grant truncate on all tables in schema steelbuild_drawing_revision to service_role');
    const before=await snapshot(db);await db.exec('savepoint truncate_probe;set local role service_role');
    try{await assert.rejects(()=>db.exec('truncate public.drawings cascade'),/DRAWING_COMMAND_REQUIRED/);}finally{await db.exec('rollback to savepoint truncate_probe;reset role');}
    assert.deepEqual(await snapshot(db),before);
  });
  await check('metadataCalibrationStillWorks',async()=>{
    await authenticated(()=>db.query("update public.drawings set notes=$1,markup_scale=48,scale_status='manual' where id=$2",["literal '; drop table public.drawings; --",ids.drawing]));
    assert.deepEqual((await db.query('select notes,markup_scale::int scale,scale_status from public.drawings where id=$1',[ids.drawing])).rows[0],{notes:"literal '; drop table public.drawings; --",scale:48,scale_status:'manual'});
  });
  await check('sourceReplacementInvalidatesCalibration',async()=>{
    await db.query("update public.drawings set markup_scale=48,scale_status='manual' where id=$1",[ids.drawing]);
    await authenticated(()=>request(db).then(p=>execute(db,p)));
    assert.deepEqual((await db.query('select markup_scale,scale_status from public.drawings where id=$1',[ids.drawing])).rows[0],{markup_scale:null,scale_status:null});
  });
  await check('publishCannotSelectMismatchedSource',async()=>{
    await db.query("update public.drawings set file_url='mismatched.pdf' where id=$1",[ids.drawing]);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/SOURCE_MISMATCH/);
  });
  await check('releaseOldHoldDoesNotReleaseNewRevision',async()=>{
    const held=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'Check connection']))).rows[0];
    assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[ids.revision])).rows[0].release_status,'on_hold');
    await authenticated(()=>request(db).then(p=>execute(db,p)));
    await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[held.id,'Old source reviewed']));
    assert.equal((await db.query('select release_status from public.drawing_revisions where drawing_id=$1 and is_current',[ids.drawing])).rows[0].release_status,'received');
  });
  await check('unlockRequiresAdminAndReason',async()=>{
    const stamp=(await db.query('select updated_at from public.drawing_sets where id=$1',[ids.set])).rows[0].updated_at;
    await authenticated(()=>db.query('select public.set_drawing_set_lock($1,true,$2,$3)',[ids.set,'Freeze review',stamp]));
    const locked=(await db.query('select * from public.drawing_sets where id=$1',[ids.set])).rows[0];
    assert.equal(locked.locked_by,ids.pm);assert.ok(locked.locked_at);
    await db.query("update auth.test_access set app_role='pm' where user_id=$1",[ids.pm]);
    await denied(db,()=>db.query('select public.set_drawing_set_lock($1,false,$2,$3)',[ids.set,'Unlock',locked.updated_at]),/NOT_AUTHORIZED/);
    await db.query("update auth.test_access set app_role='admin' where user_id=$1",[ids.pm]);
    await denied(db,()=>db.query('select public.set_drawing_set_lock($1,false,$2,$3)',[ids.set,' ',locked.updated_at]),/REASON/);
  });
  await check('authCascadeAnonymizesLockActorWithoutUnlockOrSourceChange',async()=>{
    const stamp=(await db.query('select updated_at from public.drawing_sets where id=$1',[ids.set])).rows[0].updated_at;
    await authenticated(()=>db.query('select public.set_drawing_set_lock($1,true,$2,$3)',[ids.set,'Frozen review',stamp]));
    const before=(await db.query("select to_jsonb(s)-array['locked_by','updated_at'] row from public.drawing_sets s where id=$1",[ids.set])).rows[0].row;
    await db.exec('set local role drawing_fixture_auth_admin');await db.query('delete from auth.users where id=$1',[ids.pm]);await db.exec('reset role');
    const after=(await db.query("select to_jsonb(s)-array['locked_by','updated_at'] row,locked_by from public.drawing_sets s where id=$1",[ids.set])).rows[0];
    assert.deepEqual(after.row,before);assert.equal(after.locked_by,null);
  });
  await check('unreviewedPackageCapabilitiesFailClosed',async()=>{
    const before=await snapshot(db);
    assert.deepEqual((await authenticated(()=>db.query('select public.get_drawing_command_capabilities($1) result',[ids.project]))).rows[0].result,
      {contract_version:1,new_set:false,revision:false,write_boundary:false,source_protection:false,receipt_lookup:false});
    assert.deepEqual(await snapshot(db),before);
  });
  await check('reviewedPackageDetectsDefinitionGrantRoleAndTriggerDrift',async()=>{
    await db.exec(`insert into steelbuild_drawing_revision.package_review values(true,1,repeat('a',40),steelbuild_drawing_revision.catalog_fingerprint(),repeat('b',64),true)`);
    const ready=async()=>((await authenticated(()=>db.query('select public.get_drawing_command_capabilities($1) result',[ids.project]))).rows[0].result as Record<string,unknown>).write_boundary;
    assert.equal(await ready(),true);
    for(const mutation of [
      "grant update on public.drawings to service_role",
      "grant update(file_url) on public.drawings to public",
      "alter table public.drawings disable trigger aaa_drawing_command_boundary",
      "drop index public.ux_drawing_revisions_one_current",
      "alter table public.drawing_revisions alter column release_status set default 'released_for_shop'",
      "alter function public.place_drawing_hold(uuid,text) set lock_timeout='0'",
      "alter role authenticated createrole",
      "create function public.unclassified_writer() returns void language sql security definer as 'update public.drawings set file_url=''forged.pdf'''",
      "create schema boundary_external;create function boundary_external.writer() returns void language sql security definer as 'update public.drawings set file_url=''forged.pdf''';grant usage on schema boundary_external to authenticated",
    ]){
      await db.exec('savepoint drift');await db.exec(mutation);assert.equal(await ready(),false,mutation);await db.exec('rollback to savepoint drift');
    }
    await db.exec("update steelbuild_drawing_revision.package_review set approved=false");assert.equal(await ready(),false);
  });
  await check('exactMetadataGrantMatrixAndMixedPatch',async()=>{
    const allowed:Record<string,string[]>={drawings:['notes','reviewer','due_date','spec_section','priority_flag','fabrication_start_date','fabrication_finish_date','ready_for_install_date','final_delivery_date','markup_scale','scale_status'],drawing_sets:['description','notes','due_date','eor_reviewer','area_sequence','material_impacted','long_lead_impact','titleblock_title_rect','titleblock_number_rect','titleblock_revision_rect'],drawing_revisions:[]};
    for(const [table,columns] of Object.entries(allowed))for(const role of ['anon','authenticated','service_role']){
      const actual=(await db.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and has_column_privilege($2,$1,attname,'UPDATE') order by attname",[`public.${table}`,role])).rows.map(r=>r.attname);
      assert.deepEqual(actual,role==='authenticated'?[...columns].sort():[]);
    }
    await denied(db,()=>db.query('update public.drawings set notes=$1,file_url=$2 where id=$3',['safe','unsafe.pdf',ids.drawing]),/permission denied/);
  });
  await check('serviceRoleAndForgedAuthorityCannotWrite',async()=>{
    const before=await snapshot(db);
    await db.exec('savepoint service;set local role service_role');
    try{await assert.rejects(()=>db.query("update public.drawings set file_url='forged.pdf' where id=$1",[ids.drawing]),/permission denied/);}finally{await db.exec('rollback to savepoint service;reset role');}
    assert.deepEqual(await snapshot(db),before);
    await db.exec("select set_config('steelbuild.drawing_command','true',true);select set_config('steelbuild.command_context','true',true)");
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:ids.pm,role:'authenticated',aal:'aal2',user_metadata:{role:'admin',drawing_command:true}})]);
    await denied(db,()=>db.exec("insert into steelbuild_drawing_revision.command_context(transaction_id,backend_pid,actor_id,project_id,set_id,operation) values(txid_current(),pg_backend_pid(),auth.uid(),'"+ids.project+"','"+ids.set+"','revise_set')"),/permission denied/);
    await db.exec(`create function public.fixture_privileged_writer() returns void language sql security definer set search_path='' as $$ update public.drawings set file_url='forged.pdf' where id='${ids.drawing}' $$;grant execute on function public.fixture_privileged_writer() to authenticated,service_role`);
    await denied(db,()=>db.query('select public.fixture_privileged_writer()'),/COMMAND_REQUIRED/);
  });
  await check('insertUpsertDeleteAndReassignmentDenied',async()=>{
    for(const sql of [
      `insert into public.drawings(project_id,sheet_number) values('${ids.project}','X')`,
      `insert into public.drawings(id,project_id,sheet_number) values('${ids.drawing}','${ids.project}','X') on conflict(id) do update set file_url='X'`,
      `delete from public.drawings where id='${ids.drawing}'`,
      `update public.drawings set drawing_set_id='${ids.set2}' where id='${ids.drawing}'`,
      `update public.drawing_revisions set is_current=false where id='${ids.revision}'`,
      `update public.drawing_sets set is_locked=true where id='${ids.set}'`,
    ])await denied(db,()=>db.exec(sql),/permission denied/);
  });
  await check('publicationRetainsApprovalAndEvidenceGates',async()=>{
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']),/APPROVAL_REQUIRED/);
    await roundExecute(db,command(await parent(db,ids.submittal),submit));
    await roundExecute(db,command(await parent(db,ids.submittal),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}}));
    await authenticated(()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']));
    assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[ids.revision])).rows[0].release_status,'released_for_shop');
    await db.query("update public.drawings set revision_number='unreviewed' where id=$1",[ids.drawing]);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_field']),/SOURCE_MISMATCH/);
  });
  await check('publicationRejectsSiblingParentSourceMismatch',async()=>{
    await workflow(submit);await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await db.query("update public.drawings set revision_number='mismatched-parent' where id=$1",[ids.drawing2]);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']),/APPROVAL_REQUIRED/);
  });
  await check('fieldHoldThresholdAndSameSourceRestore',async()=>{
    await db.query("update public.drawing_revisions set release_status='reviewed' where id=$1",[ids.revision]);
    await db.query("update auth.test_access set is_pm=false,app_role='field' where user_id=$1",[ids.pm]);
    const held=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'Field hold']))).rows[0];
    await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[held.id,'Resolved']));
    assert.equal((await db.query('select release_status from public.drawing_revisions where id=$1',[ids.revision])).rows[0].release_status,'reviewed');
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/NOT_AUTHORIZED/);
  });
  for(const access of ['is_member','is_pm','mfa_satisfied'])await check(`dailyCommandRejectsStale ${access}`,async()=>{
    await db.query(`update auth.test_access set ${access}=false where user_id=$1`,[ids.pm]);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/NOT_AUTHORIZED/);
  });
  await check('metadataDeniedForViewerFieldRemovedAndLowAssurance',async()=>{
    for(const role of ['viewer','field']){
      await db.query('update auth.test_access set is_pm=false,app_role=$1 where user_id=$2',[role,ids.pm]);
      const before=await snapshot(db);assert.equal((await authenticated(()=>db.query('update public.drawings set notes=$1 where id=$2 returning id',['denied',ids.drawing]))).rows.length,0);assert.deepEqual(await snapshot(db),before);
      if(role==='viewer')await denied(db,()=>db.query('select public.place_drawing_hold($1,$2)',[ids.drawing,'Denied']),/NOT_AUTHORIZED/);
    }
    await db.query("update auth.test_access set is_pm=true,app_role='admin' where user_id=$1",[ids.pm]);await actor(db,ids.pm,'aal1');
    await denied(db,()=>db.query('update public.drawings set notes=$1 where id=$2',['denied',ids.drawing]),/NOT_AUTHORIZED/);
  });
  await check('twoOrganizationsTwoProjectsEachEnforceCurrentRoleAndScope',async()=>{
    await db.exec(`create table auth.boundary_access(user_id uuid,project_id uuid,org_id uuid,rank integer);
      create or replace function public.user_has_project_access(p_project_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.boundary_access where user_id=auth.uid() and project_id=p_project_id) $$;
      create or replace function public.user_is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.boundary_access where user_id=auth.uid() and org_id=p_org) $$;
      create or replace function public.user_has_project_role_at_least(p_project_id uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.boundary_access where user_id=auth.uid() and project_id=p_project_id and rank>=case p_role when 'admin' then 3 when 'pm' then 2 when 'field' then 1 else 0 end) $$;`);
    const uuid=(prefix:string,n:number)=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const orgs=[ids.org,ids.foreign];
    await db.query('insert into public.organizations(id,name) values($1,$2)',[ids.foreign,'Synthetic second organization']);
    const records:{project:string;set:string;drawing:string;revision:string;org:string}[]=[];
    for(let n=1;n<=4;n++){
      const project=uuid('10000000',n),set=uuid('11000000',n),drawing=uuid('12000000',n),revision=uuid('13000000',n),org=orgs[Math.floor((n-1)/2)],source=`${org}/uploads/${project}/source.pdf`;
      await db.query('insert into public.projects(id,org_id) values($1,$2)',[project,org]);
      await db.query('insert into public.drawing_sets(id,project_id,set_name) values($1,$2,$3)',[set,project,`Set ${n}`]);
      await db.query("insert into public.drawings(id,project_id,drawing_set_id,sheet_number,title,revision_number,file_url,pdf_page) values($1,$2,$3,'S1','Steel','A',$4,1)",[drawing,project,set,source]);
      await db.query("insert into public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,file_url,pdf_page,is_current) values($1,$2,$3,'A','S1','Steel',$4,1,true)",[revision,project,drawing,source]);
      records.push({project,set,drawing,revision,org});
    }
    for(const [index,record] of records.entries())for(const [rank,role] of ['viewer','field','pm','admin'].entries()){
      const user=uuid('20000000',index*4+rank+1);await db.query('insert into auth.users values($1)',[user]);
      await db.query('insert into auth.test_access values($1,true,$2,true,$3)',[user,rank>=2,role]);
      await db.query('insert into auth.boundary_access values($1,$2,$3,$4)',[user,record.project,record.org,rank]);await actor(db,user);
      assert.equal((await authenticated(()=>db.query('update public.drawings set notes=$1 where id=$2 returning id',[role,record.drawing]))).rows.length,rank>=2?1:0);
      const foreign=records[(index+1)%records.length];
      await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[foreign.revision,'reviewed']),/NOT_AUTHORIZED/);
      if(rank>=1){const h=(await authenticated(()=>db.query('select * from public.place_drawing_hold($1,$2)',[record.drawing,`${role} reason`]))).rows[0];await authenticated(()=>db.query('select public.release_drawing_hold($1,$2)',[h.id,'Resolved']));}
      else await denied(db,()=>db.query('select public.place_drawing_hold($1,$2)',[record.drawing,'Denied']),/NOT_AUTHORIZED/);
      await db.query('delete from auth.boundary_access where user_id=$1',[user]);
      await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[record.revision,'reviewed']),/NOT_AUTHORIZED/);
    }
  });
  await check('rectangleIsNarrowCalibrationAndLockedArchivedParentsReject',async()=>{
    await authenticated(()=>db.query('update public.drawing_sets set titleblock_revision_rect=$1 where id=$2',[JSON.stringify({x:0.1,y:0.1,width:0.2,height:0.3}),ids.set]));
    for(const rect of [{x:0,y:0,width:0.2,height:0.2,approve:true},{x:0.9,y:0,width:0.2,height:0.2},{x:'0',y:0,width:0.2,height:0.2}])
      await denied(db,()=>db.query('update public.drawing_sets set titleblock_revision_rect=$1 where id=$2',[JSON.stringify(rect),ids.set]),/CALIBRATION/);
    for(const update of ['is_locked=true','is_deleted=true','deleted_at=now()']){
      await db.exec('savepoint parent_unavailable');await db.exec(`update public.drawing_sets set ${update} where id='${ids.set}'`);
      await denied(db,()=>db.query('update public.drawings set markup_scale=48 where id=$1',[ids.drawing]),/SET_UNAVAILABLE/);
      await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/SET_UNAVAILABLE/);
      await db.exec('rollback to savepoint parent_unavailable');
    }
  });
  await check('staleLockAndReasonedUnlockKeepAudit',async()=>{
    const before=(await db.query('select updated_at from public.drawing_sets where id=$1',[ids.set])).rows[0].updated_at;
    await authenticated(()=>db.query('select public.set_drawing_set_lock($1,true,$2,$3)',[ids.set,'Review',before]));
    await denied(db,()=>db.query('select public.set_drawing_set_lock($1,false,$2,$3)',[ids.set,'Reason',before]),/STALE/);
    const current=(await db.query('select updated_at from public.drawing_sets where id=$1',[ids.set])).rows[0].updated_at;
    await authenticated(()=>db.query('select public.set_drawing_set_lock($1,false,$2,$3)',[ids.set,"Reason '; --",current]));
    assert.deepEqual((await db.query('select is_locked,locked_at,locked_by from public.drawing_sets where id=$1',[ids.set])).rows[0],{is_locked:false,locked_at:null,locked_by:null});
    assert.equal((await db.query("select new_values->>'reason' reason from public.pma_audit_logs where new_values->>'operation'='set_unlock'")).rows[0].reason,"Reason '; --");
  });
  await check('deferredProtectedWriterCannotReuseCompletedContext',async()=>{
    await db.exec(`create function public.deferred_source_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin update public.drawings set file_url='forged.pdf' where id=new.id;return new;end $$;
      create constraint trigger late_source_writer after update on public.drawings deferrable initially deferred for each row execute function public.deferred_source_writer()`);
    const p=await request(db),before=await snapshot(db);await db.exec('savepoint deferred_probe;set local role authenticated');
    await execute(db,p);
    await assert.rejects(()=>db.exec('set constraints all immediate'),/COMMAND_REQUIRED/);
    await db.exec('rollback to savepoint deferred_probe;reset role');assert.deepEqual(await snapshot(db),before);
  });
  await check('nestedSameSetCommandCannotBorrowOrLeakOuterAuthority',async()=>{
    await db.exec(`create function public.nested_drawing_command() returns trigger language plpgsql security definer set search_path='' as $$
      declare revision uuid;begin select id into revision from public.drawing_revisions where drawing_id=new.drawing_id and is_current;
      if revision is not null then perform public.publish_drawing_revision(revision,'reviewed');end if;return new;end $$;
      create trigger nested_drawing_command after insert on public.drawing_activity for each row execute function public.nested_drawing_command()`);
    await denied(db,()=>db.query('select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/duplicate key/);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
  });
  await check('archiveAtomicAuditAndContextCleanup',async()=>{
    const count=(await authenticated(()=>db.query('select public.delete_drawing_set($1) count',[ids.set]))).rows[0].count;
    assert.equal(count,1);assert.equal((await db.query('select is_deleted from public.drawings where id=$1',[ids.drawing])).rows[0].is_deleted,true);
    assert.equal((await db.query('select is_deleted from public.drawing_sets where id=$1',[ids.set])).rows[0].is_deleted,true);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
    assert.ok(Number((await db.query("select count(*)::int n from public.pma_audit_logs where entity_type='drawing_sets' and entity_id=$1",[ids.set])).rows[0].n)>0);
  });
  await check('projectArchivePreservesAuthorizedCoreCascade',async()=>{
    await db.query('update public.drawing_sets set is_locked=true where id=$1',[ids.set]);
    const legacy=randomUUID();await db.query("insert into public.drawings(id,project_id,sheet_number,drawing_set_id) values($1,$2,'LEGACY',null)",[legacy,ids.project]);
    await authenticated(()=>db.query('select public.soft_delete_project($1)',[ids.project]));
    assert.equal((await db.query('select is_deleted from public.projects where id=$1',[ids.project])).rows[0].is_deleted,true);
    assert.equal((await db.query('select is_deleted from public.drawings where id=$1',[ids.drawing])).rows[0].is_deleted,true);
    assert.equal((await db.query('select is_deleted from public.drawings where id=$1',[legacy])).rows[0].is_deleted,true);
    assert.equal((await db.query('select is_locked from public.drawing_sets where id=$1',[ids.set])).rows[0].is_locked,true);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.project_archive_context')).rows[0].n,0);
    assert.equal((await db.query("select current_setting('app.skip_wp_progress_refresh',true) value")).rows[0].value,'1');
  });
  await check('projectArchiveWithoutSetsRetainsLegacyProjectSheets',async()=>{
    await db.exec('update public.drawings set drawing_set_id=null;delete from public.drawing_sets');
    await authenticated(()=>db.query('select public.soft_delete_project($1)',[ids.project]));
    assert.equal((await db.query('select count(*)::int n from public.drawings where project_id=$1 and not is_deleted',[ids.project])).rows[0].n,0);
  });
  await check('projectArchiveRejectsForeignParentWithoutCrossProjectWrite',async()=>{
    const foreignSet=randomUUID();await db.query("insert into public.drawing_sets(id,project_id,set_name) values($1,$2,'Foreign')",[foreignSet,ids.foreignProject]);
    await db.query('update public.drawings set drawing_set_id=$1 where id=$2',[foreignSet,ids.drawing]);
    await denied(db,()=>db.query('select public.soft_delete_project($1)',[ids.project]),/SOURCE_MISMATCH/);
  });
  await check('projectArchiveRejectsMissingLegacyParentAtomically',async()=>{
    await db.exec('alter table public.drawings drop constraint drawings_drawing_set_id_fkey');
    await db.query('update public.drawings set drawing_set_id=$1 where id=$2',[randomUUID(),ids.drawing]);
    await denied(db,()=>db.query('select public.soft_delete_project($1)',[ids.project]),/SOURCE_MISMATCH/);
  });
  await check('projectArchiveWithoutAnyDrawingRowsStillArchives',async()=>{
    await db.exec('delete from public.drawing_links;delete from public.drawing_zone_dependencies;delete from public.drawing_zones;delete from public.drawing_revisions;delete from public.drawings;delete from public.drawing_sets');
    await authenticated(()=>db.query('select public.soft_delete_project($1)',[ids.project]));
    assert.equal((await db.query('select is_deleted from public.projects where id=$1',[ids.project])).rows[0].is_deleted,true);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.project_archive_context')).rows[0].n,0);
  });
  await check('projectArchivePrivateImplementationAndContextAreNotAPIAuthority',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      assert.equal((await db.query("select has_function_privilege($1,'steelbuild_drawing_revision.archive_project_impl(uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
      assert.equal((await db.query("select has_table_privilege($1,'steelbuild_drawing_revision.project_archive_context','INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed,false);
      assert.equal((await db.query("select has_function_privilege($1,'public.soft_delete_project(uuid)','EXECUTE') allowed",[role])).rows[0].allowed,role==='authenticated');
    }
    await db.query("update auth.test_access set app_role='pm' where user_id=$1",[ids.pm]);
    await denied(db,()=>db.query('select public.soft_delete_project($1)',[ids.project]),/NOT_AUTHORIZED/);
  });
  for(const deferred of [false,true])await check(`projectArchiveCannotAuthorizeUnknownSourceWriter deferred=${deferred}`,async()=>{
    await db.exec(`create function public.archive_source_writer() returns trigger language plpgsql security definer set search_path='' as $$ begin update public.drawings set file_url='forged.pdf' where id=new.id;return new;end $$;
      create ${deferred?'constraint ':''}trigger archive_source_writer after update on public.drawings ${deferred?'deferrable initially deferred ':''}for each row execute function public.archive_source_writer()`);
    const before=await snapshot(db);await db.exec('savepoint project_archive_probe;set local role authenticated');
    if(deferred){await db.query('select public.soft_delete_project($1)',[ids.project]);await assert.rejects(()=>db.exec('set constraints all immediate'),/COMMAND_REQUIRED/);}
    else await assert.rejects(()=>db.query('select public.soft_delete_project($1)',[ids.project]),/COMMAND_REQUIRED/);
    await db.exec('rollback to savepoint project_archive_probe;reset role');assert.deepEqual(await snapshot(db),before);
  });
  await check('projectArchiveLateFailureRollsBackFullCascadeAndContext',async()=>{
    await db.exec("create function public.fail_project_archive() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_PROJECT_ARCHIVE';end $$;create trigger fail_project_archive before update on public.projects for each row execute function public.fail_project_archive()");
    await denied(db,()=>db.query('select public.soft_delete_project($1)',[ids.project]),/INJECTED_PROJECT_ARCHIVE/);
  });
  await check('soleOwnerAccountErasureUsesActualArchiveAndErasureChain',async()=>{
    // Load the existing shared functions verbatim; only their unrelated tail
    // tables and owner-membership helper are synthetic fixture infrastructure.
    for(const [file,name,signature,hash] of [
      ['20260912062606_hard_delete_organization_cursor_and_note_folders.sql','hard_delete_organization','uuid,text','404a23ce644aa5cf979bd611538acba3d1abece441b88d2c1eec19d1a88e4d18'],
      ['20261007090057_acquire_erasure_relation_locks_before_rows.sql','erase_my_sole_member_workspaces','text','460c1446c45aa2240e6a9946edb3117928a531d98170f232d44de6938fbe3e31'],
    ]){
      const source=await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8');
      const start=source.toLowerCase().indexOf(`create or replace function public.${name}(`);
      assert.ok(start>=0);await db.exec(source.slice(start,source.indexOf('$function$;',start)+11));
      assert.equal((await db.query("select encode(sha256(convert_to(pg_get_functiondef($1::regprocedure),'UTF8')),'hex') hash",[`public.${name}(${signature})`])).rows[0].hash,hash);
    }
    await db.exec(`alter table public.organization_members add column role text default 'owner';
      create function public.user_org_role_at_least(p_org uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.organization_members where org_id=p_org and user_id=auth.uid() and role='owner') $$;
      create table public.account_deletions(org_id uuid,org_name text,deleted_by uuid,projects_deleted integer,note text);
      create table public.note_folders(id uuid primary key,org_id uuid,parent_folder_id uuid references public.note_folders(id) on delete restrict);`);
    for(const table of ['billing_events','organization_invitations','note_folder_audit_events','note_folder_mutation_receipts','note_folder_migrations','vendors'])
      await db.exec(`create table public.${table}(org_id uuid)`);
    await db.query('insert into public.organizations(id,name) values($1,$2)',[ids.foreign,'Preserved other workspace']);
    await db.query('update public.drawing_sets set is_locked=true,locked_by=$1 where id=$2',[ids.pm,ids.set]);
    // Create actual private command/adoption records before erasure, then queue
    // a real governing receipt to exercise its deferred completion flush.
    await db.query('update public.drawing_sets set is_locked=false where id=$1',[ids.set]);
    await authenticated(()=>request(db).then(p=>execute(db,p)));
    await workflow(submit);await workflow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await db.query('update public.drawing_sets set is_locked=true where id=$1',[ids.set]);
    const result=(await authenticated(()=>db.query('select public.erase_my_sole_member_workspaces($1) result',['Synthetic account erasure regression']))).rows[0].result;
    assert.deepEqual(result,{org_ids:[ids.org],project_ids:[ids.project]});
    assert.equal((await db.query('select count(*)::int n from public.projects where id=$1',[ids.project])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.organizations where id=$1',[ids.foreign])).rows[0].n,1);
    for(const table of ['requests','source_observations','adopted_sources','command_context','write_intents','project_archive_context','hold_bindings'])
      assert.equal((await db.query(`select count(*)::int n from steelbuild_drawing_revision.${table}`)).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from public.data_erasure_log where kind in ('project','organization')")).rows[0].n,2);
    await db.exec('set local role drawing_fixture_auth_admin');await db.query('delete from auth.users where id=$1',[ids.pm]);await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[ids.pm])).rows[0].n,0);
  });
  for(const table of ['drawing_holds','drawing_revisions','drawing_activity','drawing_sets','pma_audit_logs'])await check(`dailyFailureRollsBackContextAndAudit ${table}`,async()=>{
    await db.exec(`create function public.fail_daily() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_DAILY';end $$;
      create trigger zzz_fail_daily before insert or update on public.${table} for each row execute function public.fail_daily()`);
    const operation=table==='drawing_sets'||table==='pma_audit_logs'?'select public.delete_drawing_set($1)':'select public.place_drawing_hold($1,$2)';
    await denied(db,()=>db.query(operation,operation.includes('$2')?[ids.drawing,'Reason']:[ids.set]),/INJECTED_DAILY/);
  });
  return checks;
}
