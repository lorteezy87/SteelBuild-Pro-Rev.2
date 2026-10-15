import assert from 'node:assert/strict';
import { actor, ids, createRequest, createSet, request, execute, path, type Database } from './fixture.ts';
import { denied, snapshot, tables } from './cases.ts';
import { sourcePath } from '../submittal-revision-evidence/fixture.ts';
import { command, parent, submit, execute as roundExecute } from '../submittal-revision-evidence/cases.ts';

const unused=`${ids.org}/uploads/${ids.project}/unused.pdf`;
async function authenticated<T>(db:Database,run:()=>Promise<T>){
  await db.exec('set local role authenticated');const result=await run();await db.exec('reset role');return result;
}
async function adopt(db:Database,create=true){
  const p=await (create?createRequest:request)(db);
  return authenticated(db,()=>create?createSet(db,p):execute(db,p));
}
async function unchangedMutation(db:Database,sql:string,args:unknown[]){
  const before=await snapshot(db);
  const result=await authenticated(db,()=>db.query(sql,args));
  assert.equal(result.rows.length,0,'Adopted source mutation must affect no rows');
  assert.deepEqual(await snapshot(db),before);
}

export async function runSourceCases(db:Database){
  let checks=0;
  async function check(name:string,run:()=>Promise<void>){
    await db.exec('begin');await actor(db);
    try{await run();checks++;console.log(`PASS ${name}`);}finally{await db.exec('rollback;reset role');}
  }
  await check('snapshot covers every application Storage and private fixture table',async()=>{
    const actual=(await db.query("select schemaname||'.'||tablename name from pg_tables where schemaname in ('public','storage','steelbuild_workflow','steelbuild_drawing_revision') order by 1")).rows.map(r=>r.name);
    assert.deepEqual([...tables].sort(),actual);
  });
  for(const create of [true,false])await check(`adoptedPdfCannotBeReplacedMovedOrDeleted ${create?'create':'revision'}`,async()=>{
    await adopt(db,create);
    const token=(await db.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,[path]])).rows[0].sources;
    for(const sql of ["update storage.objects set version='replaced' where name=$1 returning id",
      'update storage.objects set name=$2 where name=$1 returning id',
      "update storage.objects set bucket_id='elsewhere' where name=$1 returning id",
      'delete from storage.objects where name=$1 returning id'])
      await unchangedMutation(db,sql,sql.includes('$2')?[path,unused]:[path]);
    assert.deepEqual((await db.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,[path]])).rows[0].sources,token);
    const stored=(await db.query('select * from steelbuild_drawing_revision.adopted_sources')).rows;
    assert.equal(stored.length,1);assert.equal(stored[0].project_id,ids.project);assert.equal(stored[0].org_id,ids.org);
    const object=(await db.query('select id,steelbuild_drawing_revision.source_token(o) token from storage.objects o where name=$1',[path])).rows[0];
    assert.equal(stored[0].object_id,object.id);assert.equal(stored[0].source_token,object.token);
  });
  await check('archiveDoesNotReleasePath',async()=>{
    const result=await adopt(db);
    await db.query('update public.drawings set is_deleted=true,deleted_at=now() where drawing_set_id=$1',[result.set_id]);
    await db.query('update public.drawing_sets set is_deleted=true,deleted_at=now() where id=$1',[result.set_id]);
    await unchangedMutation(db,'delete from storage.objects where name=$1 returning id',[path]);
  });
  await check('receiptRetentionDoesNotReleasePath',async()=>{
    await adopt(db,false);await db.exec('delete from steelbuild_drawing_revision.requests');
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.source_observations')).rows[0].n,0);
    await unchangedMutation(db,"update storage.objects set version='reused' where name=$1 returning id",[path]);
  });
  await check('reusing an unchanged source keeps its original adoption while new paths remain independent',async()=>{
    await adopt(db);
    const original=(await snapshot(db))['steelbuild_drawing_revision.adopted_sources'];
    const p=await request(db);await authenticated(db,()=>execute(db,p,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'));
    assert.deepEqual((await snapshot(db))['steelbuild_drawing_revision.adopted_sources'],original);
    for(const paths of [[path,unused],[unused,path]])
      assert.equal((await authenticated(db,()=>db.query("select public.drawing_source_mutation_allowed('app-files',$1,$2) allowed",paths))).rows[0].allowed,false);
  });
  await check('trusted adoption helper rejects missing malformed duplicate foreign and over-bound paths',async()=>{
    for(const paths of [null,[],[null],[path,path],['../bad.pdf'],[sourcePath],[`${ids.org}/uploads/${ids.foreignProject}/foreign.pdf`],Array.from({length:251},(_,n)=>`${ids.org}/uploads/${ids.project}/${n}.pdf`)]){
      const before=await snapshot(db);await db.exec('savepoint invalid_adoption');
      try{await assert.rejects(()=>db.query('select steelbuild_drawing_revision.adopt_sources($1,$2)',[ids.project,paths]),/SOURCE_SCOPE/);}
      finally{await db.exec('rollback to savepoint invalid_adoption');}
      assert.deepEqual(await snapshot(db),before);
    }
    const before=await snapshot(db);await db.exec('savepoint missing_adoption');
    try{await assert.rejects(()=>db.query('select steelbuild_drawing_revision.adopt_sources($1,$2)',[ids.project,[unused]]),/SOURCE_CHANGED/);}
    finally{await db.exec('rollback to savepoint missing_adoption');}
    assert.deepEqual(await snapshot(db),before);
  });
  for(const create of [true,false])await check(`failedIntakeDoesNotAdopt ${create?'create':'revision'}`,async()=>{
    const p=await (create?createRequest:request)(db);
    await db.exec(`create function public.fail_adopted_intake() returns trigger language plpgsql as $$ begin raise exception 'LATE_SOURCE_FAILURE';end $$;
      create trigger fail_adopted_intake before insert on steelbuild_drawing_revision.requests for each row execute function public.fail_adopted_intake()`);
    const before=await snapshot(db);
    await denied(db,()=>create?createSet(db,p):execute(db,p),/LATE_SOURCE_FAILURE/);
    assert.deepEqual(await snapshot(db),before);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,0);
    assert.equal((await authenticated(db,()=>db.query("update storage.objects set version='unused-upload-retained' where name=$1 returning id",[path]))).rows.length,1);
  });
  await check('overlapping permissive policy cannot release adopted sources',async()=>{
    await adopt(db);
    await db.exec(`create policy sibling_permissive on storage.objects for all to authenticated using (owner=(select auth.uid())) with check (owner=(select auth.uid()))`);
    await unchangedMutation(db,"update storage.objects set version='overlap' where name=$1 returning id",[path]);
    await unchangedMutation(db,'delete from storage.objects where name=$1 returning id',[path]);
  });
  await check('move replacement and upload into retained destination are denied',async()=>{
    await adopt(db);
    await db.query("insert into storage.objects(bucket_id,name) values('app-files',$1)",[unused]);
    // A privileged deletion is allowed, but the adoption key survives it.
    await db.query('delete from storage.objects where name=$1',[path]);
    await denied(db,()=>db.query('update storage.objects set name=$1 where name=$2',[path,unused]),/row-level security/);
    await denied(db,()=>db.query("insert into storage.objects(bucket_id,name) values('app-files',$1)",[path]),/row-level security/);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,1);
  });
  await check('same-path upsert and cross-bucket destination move cannot replace adoption',async()=>{
    await adopt(db);
    await denied(db,()=>db.query("insert into storage.objects(bucket_id,name,version) values('app-files',$1,'upsert') on conflict(bucket_id,name) do update set version=excluded.version",[path]),/row-level security/);
    await db.exec("create policy other_bucket on storage.objects for all to authenticated using (bucket_id='other' and owner=(select auth.uid())) with check (owner=(select auth.uid()))");
    await db.query("insert into storage.objects(bucket_id,name) values('other',$1)",[path]);
    await db.query("delete from storage.objects where bucket_id='app-files' and name=$1",[path]);
    await denied(db,()=>db.query("update storage.objects set bucket_id='app-files' where bucket_id='other' and name=$1",[path]),/row-level security/);
  });
  await check('unused uploads legacy sibling objects unrelated buckets and downloads retain policy behavior',async()=>{
    await adopt(db);
    assert.equal((await authenticated(db,()=>db.query('select id from storage.objects where name=$1',[path]))).rows.length,1);
    await authenticated(db,()=>db.query("insert into storage.objects(bucket_id,name) values('app-files',$1)",[unused]));
    for(const target of [unused,sourcePath]){
      assert.equal((await authenticated(db,()=>db.query("update storage.objects set version='permitted' where name=$1 returning id",[target]))).rows.length,1);
      assert.equal((await authenticated(db,()=>db.query('delete from storage.objects where name=$1 returning id',[target]))).rows.length,1);
    }
    await db.exec("create policy sibling_bucket on storage.objects for all to authenticated using (bucket_id='sibling' and owner=(select auth.uid())) with check (bucket_id='sibling' and owner=(select auth.uid()))");
    await authenticated(db,()=>db.query("insert into storage.objects(bucket_id,name) values('sibling',$1)",[path]));
    assert.equal((await authenticated(db,()=>db.query("update storage.objects set version='permitted' where bucket_id='sibling' returning id"))).rows.length,1);
    assert.equal((await authenticated(db,()=>db.query("delete from storage.objects where bucket_id='sibling' returning id"))).rows.length,1);
  });
  await check('source helper fails closed for malformed structure and existing access MFA checks remain effective',async()=>{
    for(const args of [[null,path,path],['',path,path],['app-files',null,path],['app-files',path,null],['app-files','',path],
      ['app-files',path,''],['app-files','   ',path],['unrelated',null,path],
      ['app-files',`${ids.org}/uploads/${ids.foreignProject}/foreign.pdf`,path]])
      assert.equal((await authenticated(db,()=>db.query('select public.drawing_source_mutation_allowed($1,$2,$3) allowed',args))).rows[0].allowed,false);
    for(const field of ['is_member','mfa_satisfied']){
      await db.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);
      await unchangedMutation(db,"update storage.objects set version='denied' where name=$1 returning id",[path]);
      await db.query(`update auth.test_access set ${field}=true where user_id=$1`,[ids.pm]);
    }
    await actor(db,ids.foreign);
    assert.equal((await authenticated(db,()=>db.query('select public.drawing_source_mutation_allowed($1,$2,$3) allowed',['app-files',path,path]))).rows[0].allowed,false);
  });
  await check('legacy literal names are preserved even under project-like PDF prefixes',async()=>{
    await adopt(db);
    await db.exec("create policy unrelated_bucket on storage.objects for all to authenticated using (bucket_id='unrelated' and owner=(select auth.uid())) with check (bucket_id='unrelated' and owner=(select auth.uid()))");
    const prefix=`${ids.org}/uploads/${ids.project}/`;
    const storedPaths:[string,string][]=[
      ['app-files',`${ids.org}/uploads/${'x'.repeat(520)}.pdf`],
      ['app-files',`${prefix}${'x'.repeat(520)}.pdf`],
      ['app-files',`${prefix}legacy..signed.pdf`],
      ['app-files',`${prefix}legacy\\signed.pdf`],
      ['app-files',`${prefix}legacy signed.pdf`],
      ['app-files',`${prefix}drawing.xlsx`],
      ['unrelated','x'.repeat(600)],['unrelated','legacy..signed.pdf'],['unrelated','legacy\\signed.pdf'],
    ];
    for(const [bucket,name] of storedPaths){
      await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,name]);
      const changed=await authenticated(db,()=>db.query("update storage.objects set version='legacy-permitted' where bucket_id=$1 and name=$2 returning id",[bucket,name]));
      assert.equal(changed.rows.length,1,'Drawing protection must not reclassify an existing literal legacy key');
      const removed=await authenticated(db,()=>db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning id',[bucket,name]));
      assert.equal(removed.rows.length,1);
      await authenticated(db,()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,name]));
    }
    await unchangedMutation(db,"update storage.objects set version='still-protected' where name=$1 returning id",[path]);
  });
  await check('private adoption helpers and tables cannot be used by any API role',async()=>{
    for(const role of ['anon','authenticated','service_role'])for(const sql of [
      'select * from steelbuild_drawing_revision.adopted_sources',
      'delete from steelbuild_drawing_revision.adopted_sources',
      `select steelbuild_drawing_revision.adopt_sources('${ids.project}',array['${path}'])`]){
      await db.exec(`savepoint privilege_denied;set local role ${role}`);
      try{await assert.rejects(()=>db.query(sql),/permission denied/);}finally{await db.exec('rollback to savepoint privilege_denied;reset role');}
    }
    for(const role of ['anon','service_role']){
      assert.equal((await db.query("select has_function_privilege($1,'public.drawing_source_mutation_allowed(text,text,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
    }
  });
  await check('privileged Storage administrators remain outside ordinary-role promise but cannot silently readopt changed identity',async()=>{
    await adopt(db);await db.exec('set local role service_role');
    await db.query("update storage.objects set version='privileged-change' where name=$1",[path]);await db.exec('reset role');
    const p=await request(db);await denied(db,()=>execute(db,p,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),/SOURCE_CHANGED/);
  });
  await check('project erasure retains existing authorization archive reason and captured evidence contracts',async()=>{
    await roundExecute(db,command(await parent(db,ids.submittal),submit));
    await adopt(db,false);
    await denied(db,()=>db.query('delete from public.drawings where id=$1',[ids.drawing]),/IMMUTABLE|foreign key/);
    await denied(db,()=>db.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic erasure acceptance']),/ARCHIVE_FIRST/);
    await db.query('select public.soft_delete_project($1)',[ids.project]);
    await denied(db,()=>db.query('select public.hard_delete_project($1,$2)',[ids.project,'short']),/reason/);
    await actor(db,ids.viewer);
    await denied(db,()=>db.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic erasure acceptance']),/admin/);
    await actor(db);
    await authenticated(db,()=>db.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic erasure acceptance']));
    for(const table of ['steelbuild_drawing_revision.adopted_sources','steelbuild_drawing_revision.requests','steelbuild_drawing_revision.source_observations','public.submittal_round_revision_evidence'])
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.data_erasure_log where project_id=$1',[ids.project])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from storage.objects where name=$1',[path])).rows[0].n,1,'SQL erasure does not pretend to delete Storage bytes');
  });
  return checks;
}
