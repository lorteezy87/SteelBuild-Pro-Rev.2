import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { actor, ids, sourcePath, type Database } from './fixture.ts';
export type Parent = { id:string;updated_at:string;status:string;current_round_id:string|null;round_number:number };
export type Evidence = { id:string;drawing_revision_id:string;file_url:string;pdf_page:number;captured_by:string;capture_kind:string };
export type Result = { submittal:Parent;round:{id:string;round_number:number;status:string};evidence:Evidence[] };
export type Coverage = { ok:boolean;reason:string;current_revision_ids:string[];evidence:Evidence[] };
export const reviewed=[ids.revision,ids.revision2].sort();
export const submit={status:'Submitted',ball_in_court:'EOR',submitted_date:'2026-10-09'};
export const checklist={markups_incorporated:true,comments_addressed:true,sheets_ready:true,authorized_to_issue:true};
export async function parent(db:Database,id=ids.submittal):Promise<Parent> {
  return (await db.query<Parent>('select id,updated_at::text,status,current_round_id,round_number from public.submittals where id=$1',[id])).rows[0];
}
export function command(s:Parent,patch:Record<string,unknown>,request=randomUUID(),revisionIds=reviewed,newRound=false) {
  return {sql:'select public.apply_submittal_round_workflow($1,$2,$3,$4,$5,$6,$7::jsonb,$8) result',args:[s.id,request,s.updated_at,s.status,s.current_round_id,revisionIds,JSON.stringify(patch),newRound]};
}
export async function execute(db:Database,c:ReturnType<typeof command>):Promise<Result> {
  return (await db.query<{result:Result}>(c.sql,c.args)).rows[0].result;
}
export async function coverage(db:Database,id=ids.submittal):Promise<Coverage> {
  return (await db.query<{result:Coverage}>('select public.get_submittal_revision_coverage($1) result',[id])).rows[0].result;
}
export async function runCases(db:Database):Promise<number> {
  let count=0;
  async function check(name:string,run:()=>Promise<void>) {await run();count++;console.log(`PASS ${name}`);}
  async function rollback(run:()=>Promise<void>) {await db.exec('begin');try{await run();}finally{await db.exec('rollback');}}
  async function flow(patch:Record<string,unknown>,id=ids.submittal,revisionIds=reviewed) {return execute(db,command(await parent(db,id),patch,randomUUID(),revisionIds));}
  await db.exec('set role authenticated');
  await check('direct submission and forged GUC cannot bypass reviewed command',async()=>{
    await db.query("select set_config('steelbuild.round_rpc','on',false)");
    await assert.rejects(db.query("update public.submittals set status='Submitted' where id=$1",[ids.submittal]),/ROUND_WORKFLOW_REQUIRED/);
    await assert.rejects(db.query("insert into public.submittals(project_id,submittal_number,title,submittal_type,status) values($1,'SUB-X','Forged','Shop Drawing','Approved')",[ids.project]),/ROUND_WORKFLOW_REQUIRED/);
    await assert.rejects(db.query('insert into steelbuild_workflow.round_context values(txid_current(),pg_backend_pid(),$1)',[ids.submittal]),/permission denied/);
  });
  await check('PM, project access, MFA and function grants apply before workflow',async()=>{
    const s=await parent(db);
    for(const [who,aal] of [[ids.viewer,'aal2'],[ids.foreign,'aal2'],[ids.pm,'aal1']]) {
      await actor(db,who,aal);await assert.rejects(execute(db,command(s,submit)),/ROUND_NOT_AUTHORIZED/);await actor(db);
    }
    await db.exec('reset role;set role anon');await assert.rejects(execute(db,command(s,submit)),/permission denied/);
    await db.exec('reset role;set role authenticated');
  });
  await check('complete multi-set roster, parent version and patch allowlist are mandatory',async()=>{
    const s=await parent(db);
    await assert.rejects(execute(db,command(s,submit,randomUUID(),[ids.revision])),/ROUND_STALE_ROSTER/);
    await assert.rejects(execute(db,command(s,submit,randomUUID(),[ids.revision,ids.revision])),/ROUND_ROSTER_INVALID/);
    await assert.rejects(execute(db,command({...s,updated_at:'2000-01-01'},submit)),/ROUND_STALE/);
    await assert.rejects(execute(db,command(s,{...submit,project_id:ids.foreignProject})),/ROUND_PATCH_INVALID/);
    assert.equal((await db.query('select id from public.submittal_rounds')).rows.length,0);
  });
  await check('an unlinked Draft can be voided without creating evidence',()=>rollback(async()=>{
    await db.query("update public.submittals set drawing_set_ids='{}' where id=$1",[ids.submittal]);
    const result=await flow({status:'Void'},ids.submittal,[]);assert.equal(result.submittal.status,'Void');
    assert.equal(result.round,null);assert.equal(result.evidence.length,0);
  }));
  let submitted:Result;
  const first=command(await parent(db),submit);
  await check('atomic submission captures exact PDF source and page across all linked sets',async()=>{
    submitted=await execute(db,first);assert.equal(submitted.submittal.status,'Submitted');assert.equal(submitted.evidence.length,2);
    assert.deepEqual(submitted.evidence.map(e=>e.drawing_revision_id).sort(),reviewed);
    assert.deepEqual(submitted.evidence.map(e=>e.pdf_page).sort(),[1,2]);assert.ok(submitted.evidence.every(e=>e.file_url===sourcePath&&e.captured_by===ids.pm));
    assert.equal((await coverage(db)).ok,true);
  });
  await check('same request replays identical result; payload collision and revoked access deny replay',async()=>{
    assert.deepEqual(await execute(db,first),submitted);
    const changed={...first,args:[...first.args]};changed.args[6]=JSON.stringify({...submit,ball_in_court:'GC'});
    await assert.rejects(execute(db,changed),/ROUND_REQUEST_COLLISION/);
    await actor(db,ids.foreign);await assert.rejects(execute(db,first),/ROUND_NOT_AUTHORIZED/);await actor(db);
    assert.equal((await db.query('select id from public.submittal_rounds')).rows.length,1);
  });
  await check('open sent round updates without replacing immutable evidence',async()=>{
    const result=await flow({status:'Under Review'});assert.equal(result.round.id,submitted.round.id);assert.deepEqual(result.evidence,submitted.evidence);
  });
  await check('Rejected to Draft remains able to submit a new reviewed round',()=>rollback(async()=>{
    await flow({status:'Rejected'});await flow({status:'Draft'},ids.submittal,[]);
    const result=await flow(submit);assert.equal(result.round.round_number,2);assert.notEqual(result.round.id,submitted.round.id);
    assert.deepEqual(result.evidence.map(e=>e.drawing_revision_id).sort(),reviewed);
  }));
  await check('direct BIC, round status, roster and evidence source writes are rejected',async()=>{
    await assert.rejects(db.query("update public.submittals set ball_in_court='GC' where id=$1",[ids.submittal]),/ROUND_WORKFLOW_REQUIRED/);
    await assert.rejects(db.query("update public.submittal_rounds set status='Approved' where id=$1",[submitted.round.id]),/ROUND_WORKFLOW_REQUIRED/);
    await assert.rejects(db.query("update public.submittals set drawing_set_ids='{}' where id=$1",[ids.submittal]),/ROUND_EVIDENCE_IMMUTABLE/);
    await assert.rejects(db.query('update public.submittal_round_revision_evidence set pdf_page=9'),/permission denied/);
    await assert.rejects(db.query("update public.drawing_revisions set file_url='other.pdf' where id=$1",[ids.revision]),/ROUND_EVIDENCE_IMMUTABLE/);
  });
  await check('service-role direct lifecycle writes still require RPC context',async()=>{
    await db.exec('reset role;set role service_role');await assert.rejects(db.query("update public.submittals set status='Approved' where id=$1",[ids.submittal]),/ROUND_WORKFLOW_REQUIRED/);await db.exec('reset role;set role authenticated');
  });
  await check('existing OFS checklist failure rolls back parent and round together',async()=>{
    const before=await parent(db);await assert.rejects(flow({status:'Approved',ball_in_court:'GC'}),/SUBMITTAL_GATE_BLOCKED/);
    assert.deepEqual(await parent(db),before);assert.equal((await db.query<{status:string}>('select status from public.submittal_rounds where id=$1',[submitted.round.id])).rows[0].status,'Under Review');
  });
  await check('required returned-comment guard remains in the atomic transaction',()=>rollback(async()=>{
    await db.query("insert into public.submittal_comment_dispositions(submittal_id,project_id,status) values($1,$2,'Open')",[ids.submittal,ids.project]);
    await assert.rejects(flow({status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}}),/required comment/);
  }));
  await check('valid approval reuses captured round rather than inventing a return round',async()=>{
    const result=await flow({status:'Approved',ball_in_court:'GC',returned_date:'2026-10-09',metadata:{ofs_checklist:checklist}});
    assert.equal(result.round.id,submitted.round.id);assert.equal((await coverage(db)).ok,true);
  });
  await check('missing PDF permits corrective R and R but still blocks resubmission',()=>rollback(async()=>{
    const original=(await coverage(db)).evidence;await db.exec('reset role');
    await db.query("update storage.objects set name='missing-original.pdf' where name=$1",[sourcePath]);await db.exec('set role authenticated');
    const result=await flow({status:'Revise and Resubmit'},ids.submittal,[]);assert.equal(result.submittal.status,'Revise and Resubmit');
    assert.deepEqual(result.evidence,original);await db.exec('savepoint rejected_resubmission');
    await assert.rejects(flow(submit),/ROUND_SOURCE_INCOMPLETE/);await db.exec('rollback to savepoint rejected_resubmission');
    assert.equal((await parent(db)).status,'Revise and Resubmit');
  }));
  await check('legacy approval fails closed until explicit exact-source PM attestation',async()=>{
    assert.equal((await coverage(db,ids.legacy)).reason,'missing_manifest');
    const s=await parent(db,ids.legacy);
    const args=[s.id,randomUUID(),s.updated_at,s.status,s.current_round_id,reviewed,'I inspected the actual original transmittal and confirm these exact revisions.'];
    const result=(await db.query<{result:Result}>('select public.reconcile_submittal_round_evidence($1,$2,$3,$4,$5,$6,$7) result',args)).rows[0].result;
    assert.equal(result.submittal.status,'Released for Fabrication');assert.ok(result.evidence.every(e=>e.capture_kind==='legacy_attestation'));
    assert.equal((await coverage(db,ids.legacy)).ok,true);
  });
  await check('set gate accepts exact approved round with all previous blockers clear',async()=>{
    const result=(await db.query<{result:{ok:boolean;blockers:unknown[]}}>('select public.evaluate_fab_release_set($1,$2) result',[ids.project,ids.set])).rows[0].result;
    assert.equal(result.ok,true,JSON.stringify(result.blockers));
  });
  async function newRevision(path=sourcePath):Promise<string[]> {
    await db.query('update public.drawing_revisions set is_current=false where id=$1',[ids.revision2]);
    await db.query("insert into public.drawing_revisions(project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,is_current,file_url,pdf_page,release_status) values($1,$2,'B','S2','Stairs',2,true,$3,2,'released_for_shop')",[ids.project,ids.drawing2,path]);
    return (await coverage(db)).current_revision_ids;
  }
  await check('new current revision invalidates old approval on every linked set',()=>rollback(async()=>{
    const current=await newRevision();assert.equal((await coverage(db)).reason,'stale_manifest');
    for(const set of [ids.set,ids.set2]) {
      const gate=(await db.query<{result:{ok:boolean;blockers:{kind:string}[]}}>('select public.evaluate_fab_release_set($1,$2) result',[ids.project,set])).rows[0].result;
      assert.equal(gate.ok,false);assert.ok(gate.blockers.some(b=>b.kind==='revision_manifest_mismatch'));
    }
    await assert.rejects(flow({status:'Released for Fabrication'},ids.submittal,current),/ROUND_LEGACY_RECONCILIATION_REQUIRED/);
  }));
  for(const [name,mutation] of [
    ['replacement at the same PDF path',"update storage.objects set id=gen_random_uuid(),version='replacement'"],
    ['missing PDF object','delete from storage.objects'],
    ['modified PDF metadata',"update storage.objects set metadata=metadata||'{\"contentType\":\"application/octet-stream\"}'::jsonb"],
  ]) await check(`${name} invalidates coverage without rewriting captured evidence`,()=>rollback(async()=>{
    const before=(await coverage(db)).evidence;await db.exec('reset role');await db.exec(mutation);await db.exec('set role authenticated');
    assert.equal((await coverage(db)).reason,'stale_manifest');assert.deepEqual((await coverage(db)).evidence,before);
  }));
  await check('R&R resubmission creates new round and captures new current revision',()=>rollback(async()=>{
    await flow({status:'Revise and Resubmit',returned_date:'2026-10-09'});const current=await newRevision();
    const next=await flow(submit,ids.submittal,current);assert.equal(next.round.round_number,2);assert.notEqual(next.round.id,submitted.round.id);
    assert.deepEqual(next.evidence.map(e=>e.drawing_revision_id).sort(),current.sort());
  }));
  await check('missing Storage source prevents a new round and every dependent write',()=>rollback(async()=>{
    await flow({status:'Revise and Resubmit',returned_date:'2026-10-09'});const current=await newRevision(`${ids.org}/uploads/missing.pdf`);
    const before=await parent(db);const roundCount=(await db.query('select id from public.submittal_rounds')).rows.length;
    await db.exec('savepoint failed_submission');
    await assert.rejects(flow(submit,ids.submittal,current),/ROUND_SOURCE_INCOMPLETE/);
    await db.exec('rollback to savepoint failed_submission');
    assert.deepEqual(await parent(db),before);assert.equal((await db.query('select id from public.submittal_rounds')).rows.length,roundCount);
    await db.exec('reset role');assert.equal((await db.query('select * from steelbuild_workflow.round_context')).rows.length,0);
  }));
  await check('soft-deleted sheet invalidates coverage while historical evidence survives',()=>rollback(async()=>{
    await db.query('update public.drawings set is_deleted=true where id=$1',[ids.drawing2]);assert.equal((await coverage(db)).ok,false);assert.equal((await coverage(db)).evidence.length,2);
  }));
  await check('archived history cannot be republished',()=>rollback(async()=>{
    await db.query('update public.drawing_revisions set is_current=false,archived_at=now() where id=$1',[ids.revision]);
    await assert.rejects(db.query("select public.publish_drawing_revision($1,'released_for_shop')",[ids.revision]),/ARCHIVED_REVISION/);
  }));
  await check('tenant RLS and MFA apply to evidence and batched coverage reads',async()=>{
    await actor(db,ids.foreign);assert.equal((await db.query('select id from public.submittal_round_revision_evidence')).rows.length,0);
    await assert.rejects(coverage(db),/Not authorized/);await actor(db,ids.viewer);assert.equal((await coverage(db)).ok,true);
    const summaries=(await db.query<{result:Coverage[]}>('select public.get_submittal_revision_coverages($1) result',[[ids.submittal,ids.legacy]])).rows[0].result;
    assert.equal(summaries.length,2);assert.ok(summaries.every(summary=>summary.evidence.length===0));assert.equal((await coverage(db)).evidence.length,2);
    await actor(db,ids.pm,'aal1');assert.equal((await db.query('select id from public.submittal_round_revision_evidence')).rows.length,0);await actor(db);
  });
  await check('Auth authorship cleanup clears only actor while preserving immutable evidence',()=>rollback(async()=>{
    const before=(await coverage(db)).evidence;await db.exec('reset role');await db.query('delete from auth.users where id=$1',[ids.pm]);
    const after=(await db.query<{e:Evidence}>('select to_jsonb(e) e from public.submittal_round_revision_evidence e where round_id=$1 order by drawing_set_id,drawing_id',[submitted.round.id])).rows.map(row=>row.e);
    assert.equal(after.length,before.length);assert.ok(after.every(e=>e.captured_by===null));
    assert.deepEqual(after.map(({captured_by,...e})=>e),before.map(({captured_by,...e})=>e));
  }));
  await check('installed authorized project-erasure functions clear evidence and private replay receipts',()=>rollback(async()=>{
    await db.query('select public.soft_delete_project($1)',[ids.project]);
    await db.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic manifest erasure acceptance']);
    assert.equal((await db.query('select id from public.submittal_round_revision_evidence')).rows.length,0);
    await db.exec('reset role');assert.equal((await db.query('select request_id from steelbuild_workflow.round_requests where project_id=$1',[ids.project])).rows.length,0);
    assert.equal((await db.query('select * from public.data_erasure_log where project_id=$1',[ids.project])).rows.length,1);
  }));
  return count;
}
