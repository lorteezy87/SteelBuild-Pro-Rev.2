import assert from 'node:assert/strict';
import { actor, ids, createRequest, createSet, execute, receipt, request, type Database } from './fixture.ts';
import { denied, snapshot } from './cases.ts';

export async function runCommandCases(db:Database){
  let checks=0;
  async function check(name:string,run:()=>Promise<void>){
    await db.exec('begin');await actor(db);
    try{await run();checks++;console.log(`PASS ${name}`);}finally{await db.exec('rollback;reset role');}
  }
  async function authenticated<T>(run:()=>Promise<T>){
    await db.exec('set local role authenticated');const result=await run();await db.exec('reset role');return result;
  }
  await check('lostResponseReturnsSameReceipt',async()=>{
    const p=await createRequest(db),before=await snapshot(db);
    assert.deepEqual(await authenticated(()=>receipt(db,p)),{state:'not_committed'});
    assert.deepEqual(await snapshot(db),before);
    const result=await authenticated(()=>createSet(db,p)),after=await snapshot(db);
    assert.equal(result.contract_version,1);assert.equal(result.operation,'create_set');assert.match(String(result.payload_sha256),/^[0-9a-f]{64}$/);
    assert.deepEqual(await authenticated(()=>receipt(db,p)),{state:'committed',result});
    assert.deepEqual(await authenticated(()=>createSet(db,p)),result);assert.deepEqual(await snapshot(db),after);
    assert.equal((await db.query('select count(*)::int n from public.drawing_sets where id=$1',[result.set_id])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where d.drawing_set_id=$1',[result.set_id])).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
    assert.deepEqual((await db.query('select issued_date,discipline from public.drawing_sets where id=$1',[result.set_id])).rows[0],{issued_date:null,discipline:null});
    assert.deepEqual((await db.query('select metadata,revision_history from public.drawing_sets where id=$1',[result.set_id])).rows[0],{metadata:{},revision_history:'[]'});
    assert.deepEqual((await db.query('select r.issued_at,r.release_status,d.extracted_text,d.callouts,d.hyperlinks from public.drawings d join public.drawing_revisions r on r.drawing_id=d.id where d.drawing_set_id=$1',[result.set_id])).rows[0],
      {issued_at:null,release_status:'received',extracted_text:null,callouts:null,hyperlinks:null});
  });
  for(const [table,event] of [['drawing_sets','insert'],['drawings','insert'],['drawing_revisions','insert'],['drawing_activity','insert'],['requests','insert'],['drawing_sets','update'],['drawings','update']])
    await check(`newSetLateFailureRollsBackEverything ${table} ${event}`,async()=>{
      const schema=table==='requests'?'steelbuild_drawing_revision':'public';
      await db.exec(`create function public.fail_new_set() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_NEW_SET_FAILURE';end $$;
        create trigger zzz_fail_new_set before ${event} on ${schema}.${table} for each row execute function public.fail_new_set()`);
      const p=await createRequest(db),before=await snapshot(db);
      await denied(db,()=>createSet(db,p),/INJECTED_NEW_SET_FAILURE/);assert.deepEqual(await snapshot(db),before);
      await db.exec(`drop trigger zzz_fail_new_set on ${schema}.${table}`);
      const result=await authenticated(()=>createSet(db,p));assert.equal(result.added,1);
      assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
    });
  await check('crossOperationKeyReuseRejects',async()=>{
    const p=await createRequest(db);await authenticated(()=>createSet(db,p));
    const revision=await request(db);
    await denied(db,()=>execute(db,revision),/REQUEST_CONFLICT/);
    await denied(db,()=>receipt(db,revision,'revise_set'),/REQUEST_CONFLICT/);
    await denied(db,()=>receipt(db,{...p,notes:'different'}),/REQUEST_CONFLICT/);
  });
  await check('revision key cannot create a second operation receipt',async()=>{
    await authenticated(async()=>execute(db,await request(db)));
    const p=await createRequest(db);await denied(db,()=>createSet(db,p),/REQUEST_CONFLICT/);
  });
  await check('revision receipt remains readable after set edit lock without another write',async()=>{
    const p=await request(db),result=await authenticated(()=>execute(db,p));
    assert.equal(result.operation,'revise_set');assert.equal(result.contract_version,1);
    await db.query('update public.drawing_sets set is_locked=true where id=$1',[ids.set]);
    const before=await snapshot(db);
    assert.deepEqual(await authenticated(()=>receipt(db,p,'revise_set')),{state:'committed',result});
    assert.deepEqual(await snapshot(db),before);
  });
  await check('changedPageClearsDerivedEvidence',async()=>{
    await db.query('update public.drawings set hyperlinks=$1,extracted_text=$2,callouts=$3 where id=$4',[JSON.stringify([{uri:'old.pdf'}]),'OLD',JSON.stringify([]),ids.drawing]);
    await authenticated(async()=>execute(db,await request(db)));
    assert.deepEqual((await db.query('select extracted_text,callouts,hyperlinks from public.drawings where id=$1',[ids.drawing])).rows[0],{extracted_text:null,callouts:null,hyperlinks:null});
  });
  for(const field of ['is_member','is_pm','mfa_satisfied'])await check(`receipt and create require current ${field}`,async()=>{
    const p=await createRequest(db);await authenticated(()=>createSet(db,p));
    await db.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);
    await denied(db,()=>receipt(db,p),/NOT_AUTHORIZED/);await denied(db,()=>createSet(db,p),/NOT_AUTHORIZED/);
  });
  await check('other actors cannot read receipts and archived projects retain current access policy',async()=>{
    const p=await createRequest(db);await authenticated(()=>createSet(db,p));
    await db.query('update auth.test_access set is_pm=true where user_id=$1',[ids.viewer]);await actor(db,ids.viewer);
    assert.deepEqual(await authenticated(()=>receipt(db,p)),{state:'not_committed'});
    await actor(db);await db.query('update public.projects set is_deleted=true,deleted_at=now() where id=$1',[ids.project]);
    await denied(db,()=>receipt(db,p),/NOT_AUTHORIZED/);
  });
  await check('user metadata cannot authorize new intake or disclose receipts',async()=>{
    const p=await createRequest(db);await authenticated(()=>createSet(db,p));
    await db.query('update auth.test_access set is_pm=false where user_id=$1',[ids.pm]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids.pm,role:'authenticated',aal:'aal2',user_metadata:{role:'admin',is_pm:true,mfa_satisfied:true}})]);
    await denied(db,()=>createSet(db,p),/NOT_AUTHORIZED/);await denied(db,()=>receipt(db,p),/NOT_AUTHORIZED/);
  });
  await check('250 reviewed sheets create one set and one received revision per sheet',async()=>{
    const p=await createRequest(db),s=(p.sheets as Record<string,unknown>[])[0];
    p.sheets=Array.from({length:250},(_,n)=>({...s,sheet_number:`N-${n+1}`,pdf_page:n+1}));
    const result=await authenticated(()=>createSet(db,p));assert.equal(result.sheet_count,250);assert.equal(result.added,250);
    assert.deepEqual((await db.query("select count(*)::int revisions,count(distinct r.drawing_id)::int sheets from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where d.drawing_set_id=$1 and r.release_status='received' and r.is_current and r.version_number=1",[result.set_id])).rows[0],{revisions:250,sheets:250});
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  await check('Unicode and quoted reviewed labels remain literal',async()=>{
    const p=await createRequest(db);p.set_name="梁 O'Brien; --";p.revision_label='Δ “B”';p.set_number="  Σ 'N-1'  ";
    const sheet=(p.sheets as Record<string,unknown>[])[0];sheet.sheet_number='梁-1';sheet.sheet_title="Étage O'Brien";sheet.revision_code='Δ “B”';
    const result=await authenticated(()=>createSet(db,p));
    assert.equal((await db.query('select set_name from public.drawing_sets where id=$1',[result.set_id])).rows[0].set_name,p.set_name);
    assert.deepEqual((await db.query('select metadata from public.drawing_sets where id=$1',[result.set_id])).rows[0].metadata,{drawing_set_number:"Σ 'N-1'"});
    assert.deepEqual((await db.query('select sheet_number,title,revision_number from public.drawings where drawing_set_id=$1',[result.set_id])).rows[0],{sheet_number:'梁-1',title:"Étage O'Brien",revision_number:'Δ “B”'});
  });
  for(const deleted of [false,true])await check(`existing ${deleted?'deleted':'live'} name cannot be adopted`,async()=>{
    const p=await createRequest(db);p.set_name=(await db.query('select set_name from public.drawing_sets where id=$1',[ids.set])).rows[0].set_name;
    if(deleted)await db.query('update public.drawing_sets set is_deleted=true,deleted_at=now() where id=$1',[ids.set]);
    await denied(db,()=>createSet(db,p),/DUPLICATE/);
  });
  for(const [name,mutate,pattern] of [
    ['251 sheets',(p:Record<string,unknown>)=>{p.sheets=Array.from({length:251},(_,n)=>({...((p.sheets as object[])[0]),sheet_number:`S${n}`}));},/INVALID/],
    ['1 MiB overflow',(p:Record<string,unknown>)=>{p.notes='x'.repeat(1048576);},/INVALID/],
    ['duplicate normalized marks',(p:Record<string,unknown>)=>{const s=(p.sheets as Record<string,unknown>[])[0];p.sheets=[s,{...s,sheet_number:' s1 '}];},/STALE|DUPLICATE/],
    ['non-added roster',(p:Record<string,unknown>)=>{(p.sheets as Record<string,unknown>[])[0].action='same';},/INVALID/],
    ['missing reviewed header',(p:Record<string,unknown>)=>{delete p.issued_date;},/INVALID/],
    ['251 source objects',(p:Record<string,unknown>)=>{p.source_objects=Array.from({length:251},()=>((p.source_objects as object[])[0]));},/INVALID/],
    ['invented date from an empty string',(p:Record<string,unknown>)=>{p.issued_date='';},/INVALID/],
    ['foreign project',(p:Record<string,unknown>)=>{p.project_id=ids.foreignProject;},/NOT_AUTHORIZED/],
    ['source metadata changed',(p:Record<string,unknown>)=>{(p.source_objects as Record<string,unknown>[])[0].token='f'.repeat(64);},/SOURCE_CHANGED/],
    ['foreign source path',(p:Record<string,unknown>)=>{(p.sheets as Record<string,unknown>[])[0].file_path='foreign.pdf';},/SOURCE_SCOPE/],
  ] as const)await check(`new set rejects ${name} atomically`,async()=>{const p=await createRequest(db);mutate(p);await denied(db,()=>createSet(db,p),pattern);});
  for(const field of ['text','callouts']){
    await check(`new set preserves independent harvested ${field}`,async()=>{
      const p=await createRequest(db),s=(p.sheets as Record<string,unknown>[])[0];
      s.extraction={text:{state:'unavailable'},callouts:{state:'unavailable'},[field]:{state:'harvested',value:field==='text'?'NOTE':[]}};
      const result=await authenticated(()=>createSet(db,p));
      assert.deepEqual((await db.query('select extracted_text,callouts,hyperlinks from public.drawings where drawing_set_id=$1',[result.set_id])).rows[0],{extracted_text:field==='text'?'NOTE':null,callouts:field==='callouts'?[]:null,hyperlinks:null});
    });
    await check(`new set rejects malformed ${field} extraction`,async()=>{
      const p=await createRequest(db),s=(p.sheets as Record<string,unknown>[])[0];
      s.extraction={text:{state:'unavailable'},callouts:{state:'unavailable'},[field]:{state:'harvested',value:42}};
      await denied(db,()=>createSet(db,p),/EXTRACTION/);
    });
  }
  await check('new public commands and private shared implementation have explicit privileges',async()=>{
    for(const role of ['anon','authenticated','service_role'])for(const signature of ['public.create_drawing_set_from_review(uuid,jsonb)','public.get_drawing_command_receipt(uuid,text,jsonb)','steelbuild_drawing_revision.apply_command(uuid,text,jsonb)']){
      assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,signature])).rows[0].ok,role==='authenticated'&&!signature.startsWith('steelbuild'));
    }
  });
  return checks;
}
