import assert from 'node:assert/strict';
import { actor, args, ids, projectScope, reserve, reserveSql, reset, type Database } from './fixture.ts';
export async function cases(db: Database) {
  let passed=0;
  const check = async(name:string,run:()=>Promise<void>) => { await reset(db); await run(); passed++; console.log(`PASS ${name}`); };
  await check('authorized PM receives an actor-bound stable project path on an exact retry',async()=> {
    await actor(db);
    let first; try { first=await reserve(db); } catch(error) { assert.fail(`Authorized reservation must succeed: ${String(error)}`); }
    assert.equal(first.bucket,'app-files'); assert.equal(first.request_id,ids.request);
    assert.match(first.path,new RegExp(`^${ids.org}/uploads/${ids.project}/[0-9a-f-]{36}\\.pdf$`));
    assert.deepEqual(await reserve(db),first);
    await db.exec('RESET ROLE');
    assert.equal(Number((await db.query('SELECT count(*) n FROM steelbuild_storage.object_bindings')).rows[0].n),1);
  });
  for(const user of [ids.viewer,ids.outsider]) await check(`caller ${user} without project write authority is denied`,async()=> {
    await actor(db,user); await assert.rejects(reserve(db),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('field can reserve a document but cannot reserve a drawing or model',async()=> {
    await actor(db,ids.field); await reserve(db,args(ids.request,projectScope,'documents','pdf'));
    for(const [workflow,extension] of [['drawings','pdf'],['model3d','ifc']]) await assert.rejects(reserve(db,args(ids.request2,projectScope,workflow,extension)),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('missing request and missing authenticated identity fail without receipts',async()=> {
    await actor(db); await assert.rejects(db.query(reserveSql,[null,JSON.stringify(projectScope),'drawings','pdf']),/FILE_RESERVATION_INVALID/);
    await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',aal:'aal2'})]);
    await assert.rejects(reserve(db),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('org member without assignment cannot reserve until its default role permits writes',async()=> {
    await db.exec(`DELETE FROM user_projects WHERE user_id='${ids.field}'`);
    await actor(db,ids.field); await assert.rejects(reserve(db,args(ids.request,projectScope,'documents','pdf')),/FILE_RESERVATION_NOT_AUTHORIZED/);
    await db.exec(`RESET ROLE; UPDATE organizations SET member_default_project_role='field' WHERE id='${ids.org}'`);
    await actor(db,ids.field); await reserve(db,args(ids.request,projectScope,'documents','pdf'));
  });
  await check('explicit viewer overrides a writable default while org admin retains authority',async()=> {
    await db.exec(`UPDATE organizations SET member_default_project_role='pm' WHERE id='${ids.org}'`);
    await actor(db,ids.viewer); await assert.rejects(reserve(db),/FILE_RESERVATION_NOT_AUTHORIZED/);
    await db.exec(`RESET ROLE; UPDATE organization_members SET role='admin' WHERE user_id='${ids.viewer}'`);
    await actor(db,ids.viewer); await reserve(db);
  });
  for(const scope of [null,[],{}, {...projectScope,orgId:ids.otherOrg}, {...projectScope,projectId:ids.otherProject},
    {kind:'organization_brand',orgId:ids.org},{kind:'user_avatar',orgId:ids.org,userId:ids.pm},
    {...projectScope,path:`${ids.org}/uploads/existing.pdf`},{...projectScope,projectId:'bad'}]) await check('malformed, unsupported, forged or mismatched scope fails closed '+JSON.stringify(scope),async()=> {
    await actor(db); await assert.rejects(reserve(db,args(ids.request,scope)),/FILE_RESERVATION_(INVALID|NOT_AUTHORIZED)/);
  });
  for(const [workflow,extension] of [['unknown','pdf'],['default','pdf'],['drawings','ifc'],['photo','pdf'],['model3d','pdf'],['import','exe'],['documents','../pdf'],['documents','PDF'],['documents','exe']]) await check(`invalid workflow/extension ${workflow}/${extension} rejected`,async()=> {
    await actor(db); await assert.rejects(reserve(db,args(ids.request,projectScope,workflow,extension)),/FILE_RESERVATION_INVALID/);
  });
  await check('changing a retry payload fails without replacing its receipt',async()=> {
    await actor(db); const first=await reserve(db);
    await assert.rejects(reserve(db,args(ids.request,projectScope,'documents','pdf')),/FILE_RESERVATION_CONFLICT/);
    assert.deepEqual(await reserve(db),first);
  });
  await check('different actors using the same request ID cannot reuse each other receipt',async()=> {
    await actor(db); const first=await reserve(db,args(ids.request,projectScope,'documents','pdf'));
    await actor(db,ids.field); const second=await reserve(db,args(ids.request,projectScope,'documents','pdf'));
    assert.notEqual(first.path,second.path);
  });
  for(const change of ["DELETE FROM organization_members", "DELETE FROM user_projects", "UPDATE projects SET is_deleted=true", "UPDATE user_projects SET role='viewer'"]) await check(`exact retry reauthorizes after ${change}`,async()=> {
    await actor(db); await reserve(db); await db.exec('RESET ROLE'); await db.exec(change);
    await actor(db); await assert.rejects(reserve(db),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('unenrolled AAL1 may reserve, enrolled AAL1 including receipt retries cannot',async()=> {
    await actor(db,ids.pm,'authenticated','aal1'); await reserve(db);
    await db.exec(`RESET ROLE; INSERT INTO auth.mfa_factors(user_id,status) VALUES('${ids.pm}','verified')`);
    await actor(db,ids.pm,'authenticated','aal1'); await assert.rejects(reserve(db),/FILE_RESERVATION_MFA_REQUIRED/);
    await actor(db); await reserve(db);
  });
  for(const role of ['anon','service_role']) await check(`${role} has no public RPC or private-table privileges despite default grants`,async()=> {
    await actor(db,ids.pm,role); await assert.rejects(reserve(db),{code:'42501'});
    await assert.rejects(db.query('SELECT * FROM steelbuild_storage.object_bindings'),{code:'42501'});
    await assert.rejects(db.query('DELETE FROM steelbuild_storage.object_bindings'),{code:'42501'});
  });
  await check('authenticated users cannot read, forge or edit bindings or trigger helpers',async()=> {
    await actor(db); const result=await reserve(db);
    for(const sql of ['SELECT * FROM steelbuild_storage.object_bindings','DELETE FROM steelbuild_storage.object_bindings',
      "UPDATE steelbuild_storage.object_bindings SET write_role_floor='field'",
      `INSERT INTO steelbuild_storage.object_bindings(bucket_id,object_path) VALUES('app-files','${result.path}')`,
      'SELECT steelbuild_storage.guard_object_binding()']) await assert.rejects(db.query(sql),{code:'42501'});
  });
  await check('operator floor promotion is monotone and cannot rewrite scope or reservation identity',async()=> {
    await actor(db,ids.field); await reserve(db,args(ids.request,projectScope,'documents','pdf')); await db.exec('RESET ROLE');
    await db.exec("UPDATE steelbuild_storage.object_bindings SET write_role_floor='pm'");
    await assert.rejects(db.exec("UPDATE steelbuild_storage.object_bindings SET write_role_floor='field'"),/FILE_BINDING_IMMUTABLE/);
    await assert.rejects(db.exec(`UPDATE steelbuild_storage.object_bindings SET project_id='${ids.otherProject}'`),/FILE_BINDING_IMMUTABLE/);
    await actor(db,ids.field); await assert.rejects(reserve(db,args(ids.request,projectScope,'documents','pdf')),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('project reassignment cannot detach an existing binding from its workspace',async()=> {
    await actor(db); await reserve(db); await db.exec('RESET ROLE');
    await assert.rejects(db.query('UPDATE projects SET org_id=$1 WHERE id=$2',[ids.otherOrg,ids.project]),{code:'23503'});
    await db.query('DELETE FROM projects WHERE id=$1',[ids.project]);
    assert.equal(Number((await db.query('SELECT count(*) n FROM steelbuild_storage.object_bindings')).rows[0].n),0);
    assert.equal(Number((await db.query('SELECT count(*) n FROM storage.objects')).rows[0].n),1);
  });
  await check('user deletion anonymizes bindings while retaining object metadata and disables stale JWT reservation',async()=> {
    await actor(db); await reserve(db); await db.exec(`RESET ROLE; DELETE FROM auth.users WHERE id='${ids.pm}'`);
    assert.equal((await db.query('SELECT actor_id FROM steelbuild_storage.object_bindings')).rows[0].actor_id,null);
    assert.equal(Number((await db.query('SELECT count(*) n FROM storage.objects')).rows[0].n),1);
    await actor(db); await assert.rejects(reserve(db),/FILE_RESERVATION_NOT_AUTHORIZED/);
  });
  await check('reservations and forged file references do not map or mutate existing objects or policies',async()=> {
    const before=(await db.query('SELECT * FROM storage.objects ORDER BY id')).rows;
    const policies=(await db.query("SELECT * FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows;
    await db.exec(`INSERT INTO documents(project_id,file_url) VALUES('${ids.otherProject}','${ids.org}/uploads/existing.pdf')`);
    await actor(db); await reserve(db); await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT * FROM storage.objects ORDER BY id')).rows,before);
    assert.deepEqual((await db.query("SELECT * FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows,policies);
    assert.equal(Number((await db.query("SELECT count(*) n FROM steelbuild_storage.object_bindings WHERE object_path LIKE '%existing.pdf'")).rows[0].n),0);
  });
  console.log(`${passed} file reservation behavioral checks passed`);
}
