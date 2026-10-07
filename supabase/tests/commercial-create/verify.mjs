import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createCommercialFixture } from './fixture.mjs';

const { db, asUser, admin, ids } = await createCommercialFixture();
const migration = await readFile(new URL('../../migrations/20261007112918_transactional_numbered_record_creates.sql',import.meta.url),'utf8');
let passed = 0;
async function test(name, verify) { await verify(); passed++; console.log(`PASS ${name}`); }
const create = async (kind, payload, op=randomUUID(), project=ids.project) =>
  (await db.query('select public.create_numbered_record($1,$2,$3,$4::jsonb) as record',[project,kind,op,JSON.stringify(payload)])).rows[0].record;
const count = async table => { await admin(); return Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n); };
const payloads = {
  change_orders: { title:'Extra embeds',co_amount:4200,attachments:'project/review.pdf, project/approved-sketch.pdf' },
  change_requests: { title:'Field connection change',estimated_cost_impact:500 },
  deliveries: { delivery_title:'Sequence 2 steel',items:[{assembly_mark:'B1',qty:2,weight_lbs:4000}],actual_date:'2026-10-02',is_long_lead:true,lead_time_weeks:4,order_placed_date:'2026-09-01',procurement_category:'Anchor rods' },
  sov_items: { description:'Erection',scheduled_value:120000,application_number:3,period_from:'2026-09-01',period_to:'2026-09-30',submitted_date:'2026-10-01',payment_received_date:'2026-10-03',status:'Paid' },
  backcharges: { title:'Crane standby',amount:1800,notice_date:'2026-10-03',attachments:[{name:'notice.pdf',path:'project/notice.pdf'}] },
};
const saved = {};
try {
  await test('legacy backcharge notice patch reproduces partial-create defect',async()=>{
    await asUser();
    const row=(await db.query('select to_jsonb(r) row from public.create_backcharge($1,$2::jsonb) r',[ids.project,JSON.stringify({title:'Legacy partial',amount:100})])).rows[0].row;
    await assert.rejects(db.query('update backcharges set notice_date=current_date where id=$1',[row.id]),/only through the RPCs/);
    assert.equal(await count('backcharges'),1);
    await asUser();
    await assert.rejects(db.query("insert into backcharge_events(backcharge_id,project_id,event_type) values($1,$2,'notice_sent')",[row.id,ids.project]),/written by the backcharge RPCs/);
  });
  await test('new API is absent before applying candidate',async()=>{
    await asUser(); await assert.rejects(create('change_orders',payloads.change_orders),/does not exist/);
  });
  await admin();
  const originals=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_backcharge','create_change_order','create_change_request','create_delivery','create_sov_item') order by proname")).rows;
  await db.exec(migration);
  await test('additive migration preserves all five sibling RPC definitions',async()=>{
    assert.deepEqual((await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('create_backcharge','create_change_order','create_change_request','create_delivery','create_sov_item') order by proname")).rows,originals);
  });
  for(const [kind,payload] of Object.entries(payloads)) {
    await test(`${kind}: complete create and identical replay allocate one record`,async()=>{
      const before=await count(kind); await asUser(); const op=randomUUID(); const row=await create(kind,payload,op); const replay=await create(kind,payload,op);
      assert.equal(replay.id,row.id); assert.equal(await count(kind),before+1); saved[kind]={row,op};
      for(const [key,value] of Object.entries(payload)) if(key!=='items') assert.deepEqual(row[key],value,`${kind}.${key}`);
      if(kind==='deliveries') { assert.equal(row.pieces,2); assert.equal(Number(row.weight_tons),2); assert.equal(await count('delivery_items'),1); }
    });
  }
  await test('backcharge creates and notice events are each recorded exactly once',async()=>{
    await admin(); const events=(await db.query('select event_type,detail,actor from backcharge_events where backcharge_id=$1 order by event_type',[saved.backcharges.row.id])).rows;
    assert.equal(events.length,2); assert.deepEqual(events.map(e=>e.event_type),['created','notice_sent']);
    assert.equal(events[1].detail,'Notice dated 2026-10-03'); assert.equal(events[1].actor,ids.pm);
  });
  await test('authorized colleague replays the shared import receipt without another number',async()=>{
    const before=await count('change_orders'); await asUser(ids.colleague);
    assert.equal((await create('change_orders',payloads.change_orders,saved.change_orders.op)).id,saved.change_orders.row.id);
    assert.equal(await count('change_orders'),before);
  });
  await test('same-operation changed payload is rejected without mutation',async()=>{
    await asUser(); await assert.rejects(create('change_orders',{...payloads.change_orders,co_amount:9999},saved.change_orders.op),/NUMBERED_CREATE_PAYLOAD_MISMATCH/);
    await admin(); assert.equal(Number((await db.query('select co_amount from change_orders where id=$1',[saved.change_orders.row.id])).rows[0].co_amount),4200);
  });
  await test('UUIDv8 import identity preserves source metadata and deduplicates across actors',async()=>{
    const op='b8513aaf-1294-8a38-b3b1-b25c6a97f713';
    const metadata={csv_import:{source_key:'GC-17',fingerprint:'fixture-source-content-hash'}};
    const payload={title:'Imported field fit-up',co_amount:900,metadata};
    await asUser(); const row=await create('change_orders',payload,op);
    assert.deepEqual(row.metadata,metadata);
    await asUser(ids.colleague); assert.equal((await create('change_orders',payload,op)).id,row.id);
  });
  await test('reordered JSON keys use the same canonical payload hash',async()=>{
    await asUser(); const reordered=Object.fromEntries(Object.entries(payloads.change_orders).reverse());
    assert.equal((await create('change_orders',reordered,saved.change_orders.op)).id,saved.change_orders.row.id);
  });
  await test('replay returns the current record after a later authorized edit',async()=>{
    await asUser(); await db.query('update change_orders set notes=$1 where id=$2',['Later review note',saved.change_orders.row.id]);
    assert.equal((await create('change_orders',payloads.change_orders,saved.change_orders.op)).notes,'Later review note');
  });
  await test('repeated queued calls with one UUID preserve a single sequence allocation',async()=>{
    const before=await count('change_requests'); await asUser(); const op=randomUUID();
    const rows=await Promise.all(Array.from({length:8},()=>create('change_requests',{title:'One retryable field request'},op)));
    assert.equal(new Set(rows.map(r=>r.id)).size,1); assert.equal(await count('change_requests'),before+1);
    // PGlite serializes statements: this verifies queued replay, not multi-session lock contention.
  });
  for(const kind of Object.keys(payloads)) {
    await test(`${kind}: viewer and foreign workspace cannot create or replay`,async()=>{
      for(const user of [ids.viewer,ids.outsider]) { await asUser(user); await assert.rejects(create(kind,payloads[kind],saved[kind].op),/Not authorized/); }
    });
  }
  await test('field role retains CR/delivery access and cannot create PM financial records',async()=>{
    await asUser(ids.field); await create('change_requests',{title:'Field-authorized request'}); await create('deliveries',{delivery_title:'Field-authorized load'});
    for(const kind of ['change_orders','sov_items','backcharges']) await assert.rejects(create(kind,payloads[kind]),/Not authorized/);
  });
  await test('removed workspace membership denies replay despite stale explicit PM role',async()=>{
    await admin(); await db.query('delete from organization_members where user_id=$1 and org_id=$2',[ids.colleague,ids.org]);
    await asUser(ids.colleague); await assert.rejects(create('change_orders',payloads.change_orders,saved.change_orders.op),/Not authorized/);
    await admin(); await db.query("insert into organization_members values($1,$2,'member')",[ids.org,ids.colleague]);
  });
  await test('role demotion denies financial replay',async()=>{
    await admin(); await db.query("update user_projects set role='viewer' where user_id=$1",[ids.colleague]);
    await asUser(ids.colleague); await assert.rejects(create('sov_items',payloads.sov_items,saved.sov_items.op),/Not authorized/);
    await admin(); await db.query("update user_projects set role='pm' where user_id=$1",[ids.colleague]);
  });
  await test('MFA applies to first calls and replays inside the new definer boundary',async()=>{
    await asUser(ids.pm,'aal1'); await assert.rejects(create('change_orders',payloads.change_orders),/MFA_REQUIRED/);
    await assert.rejects(create('change_orders',payloads.change_orders,saved.change_orders.op),/MFA_REQUIRED/);
  });
  await test('archive blocks access and never recreates a soft-deleted result',async()=>{
    await admin(); await db.query('update projects set is_deleted=true where id=$1',[ids.project]); await asUser();
    await assert.rejects(create('change_orders',payloads.change_orders,saved.change_orders.op),/Not authorized/);
    await admin(); await db.query('update projects set is_deleted=false where id=$1',[ids.project]);
    await asUser(); await db.query('update change_requests set is_deleted=true where id=$1',[saved.change_requests.row.id]);
    await assert.rejects(create('change_requests',payloads.change_requests,saved.change_requests.op),/NUMBERED_CREATE_RESULT_UNAVAILABLE/);
  });
  for(const [kind,patch] of [
    ['change_orders',{status:'Approved'}],['change_requests',{status:'Approved'}],['deliveries',{status:'Delivered'}],['deliveries',{status:'Received'}],['backcharges',{status:'approved'}],['sov_items',{status:'Approved'}],
    ['change_orders',{approved_by:'Injected'}],['backcharges',{approved_at:'2026-10-01'}],['deliveries',{received_by:'Injected'}],['sov_items',{line_item_number:999}],
  ]) await test(`${kind}: server-owned authority/number/status input ${JSON.stringify(patch)} is rejected`,async()=>{
    await asUser(); await assert.rejects(create(kind,{...payloads[kind],...patch}),/starts|Receive deliveries|Unsupported/);
  });
  for(const [kind,patch] of [['deliveries',{actual_date:'invalid-date'}],['sov_items',{application_number:'invalid-number'}],['backcharges',{notice_date:'invalid-date'}]]) {
    await test(`${kind}: failed extra-column write rolls back record, events and number`,async()=>{
      const before=await count(kind); const events=await count('backcharge_events'); await admin();
      const sequences=(await db.query('select * from number_sequences order by record_type')).rows;
      const receipts=await count('numbered_create_receipts'); const op=randomUUID(); await asUser();
      await assert.rejects(create(kind,{...payloads[kind],...patch},op),/Invalid number, date or identifier/);
      assert.equal(await count(kind),before); assert.equal(await count('backcharge_events'),events); assert.equal(await count('numbered_create_receipts'),receipts);
      await admin(); assert.deepEqual((await db.query('select * from number_sequences order by record_type')).rows,sequences);
      await asUser(); assert.ok((await create(kind,payloads[kind],op)).id,'known rollback permits corrected payload with same operation');
    });
  }
  await test('notice event failure rolls back the entire create transaction',async()=>{
    await admin(); await db.exec(`create function fail_notice() returns trigger language plpgsql as $$begin if new.event_type='notice_sent' then raise exception 'fixture notice audit unavailable'; end if; return new; end$$;
      create trigger notice_failure before insert on backcharge_events for each row execute function fail_notice();`);
    const before=await count('backcharges'); const events=await count('backcharge_events'); await asUser();
    await assert.rejects(create('backcharges',payloads.backcharges),/fixture notice audit unavailable/);
    assert.equal(await count('backcharges'),before); assert.equal(await count('backcharge_events'),events);
    await admin(); await db.exec('drop trigger notice_failure on backcharge_events');
  });
  await test('receipt persistence failure rolls back the numbered row, extras and allocation',async()=>{
    await admin();
    await db.exec(`create function fail_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture receipt unavailable'; end$$;
      create trigger receipt_failure before insert on numbered_create_receipts for each row execute function fail_receipt();`);
    const before=await count('change_orders');
    const sequences=(await db.query('select * from number_sequences order by record_type')).rows;
    const op=randomUUID(); await asUser();
    await assert.rejects(create('change_orders',payloads.change_orders,op),/fixture receipt unavailable/);
    assert.equal(await count('change_orders'),before);
    assert.deepEqual((await db.query('select * from number_sequences order by record_type')).rows,sequences);
    await db.exec('drop trigger receipt_failure on numbered_create_receipts');
    await asUser(); assert.equal((await create('change_orders',payloads.change_orders,op)).attachments,payloads.change_orders.attachments);
  });
  await test('invalid cast messages never echo supplied project content',async()=>{
    await asUser();
    await assert.rejects(create('deliveries',{delivery_title:'Private job',actual_date:'confidential-contract-reference'}),error=>{
      assert.equal(error.code,'22023'); assert.equal(error.message,'Invalid number, date or identifier in numbered create payload');
      assert.ok(!error.message.includes('confidential')); return true;
    });
  });
  await test('finite numeric boundaries reject NaN/Infinity and invalid load quantities without changing valid deducts',async()=>{
    await asUser();
    for(const co_amount of ['NaN','Infinity','-Infinity']) await assert.rejects(create('change_orders',{title:'Invalid amount',co_amount}),/must be finite/);
    for(const item of [{qty:0},{qty:-1},{qty:1,weight_lbs:'NaN'},{qty:1,weight_lbs:-10},{qty:1,length_inches:'Infinity'}]) {
      await assert.rejects(create('deliveries',{delivery_title:'Invalid quantity',items:[item]}),/must be positive/);
    }
    assert.equal(Number((await create('change_orders',{title:'Reviewed deduct',co_amount:-500})).co_amount),-500);
    await assert.rejects(create('sov_items',{description:'Invalid application',scheduled_value:1,application_number:0}),/must be positive/);
  });
  await test('foreign SOV CO link and delivery piece link are rejected',async()=>{
    await asUser(ids.outsider); const foreign=await create('change_orders',{title:'Other workspace CO',co_amount:1},randomUUID(),ids.otherProject);
    await asUser(); await assert.rejects(create('sov_items',{...payloads.sov_items,change_order_id:foreign.id}),/must belong to this project/);
    await assert.rejects(create('deliveries',{delivery_title:'Invalid lot',items:[{piece_id:randomUUID(),qty:1}]}),/must belong to this project/);
  });
  for (const kind of Object.keys(payloads)) await test(`${kind}: nullable metadata and attachment DTOs remain valid and replayable`,async()=>{
    await asUser();
    const op = randomUUID();
    const payload = { ...payloads[kind], metadata: null, ...(['change_orders','backcharges'].includes(kind) ? { attachments: null } : {}) };
    const row = await create(kind,payload,op);
    assert.deepEqual(row.metadata,{});
    if (kind==='change_orders') assert.equal(row.attachments,null);
    if (kind==='backcharges') assert.deepEqual(row.attachments,[]);
    assert.equal((await create(kind,payload,op)).id,row.id);
    await assert.rejects(create(kind,{...payload,metadata:[]}),/metadata must be an object/);
    if (kind==='backcharges') await assert.rejects(create(kind,{...payload,attachments:'not an array'}),/attachments must be an array/);
  });
  await test('receipt rows and helper are inaccessible through direct public grants',async()=>{
    await asUser(); await assert.rejects(db.query('select * from numbered_create_receipts'),/permission denied/);
    await assert.rejects(db.query("insert into numbered_create_receipts(project_id,kind,client_op_id,payload_hash,record_id) values($1,'change_orders',$2,sha256(''::bytea),$3)",[ids.project,randomUUID(),randomUUID()]),/permission denied/);
    await admin(); await db.exec('set role anon'); await assert.rejects(create('change_orders',payloads.change_orders),/permission denied/);
    await admin(); const columns=(await db.query("select column_name from information_schema.columns where table_name='numbered_create_receipts' order by ordinal_position")).rows.map(r=>r.column_name);
    assert.deepEqual(columns,['project_id','kind','client_op_id','payload_hash','record_id','actor_user_id','created_at']);
  });
  await test('RPC restores pre-existing guard flags instead of leaking elevated writes',async()=>{
    await asUser(); await db.exec('begin');
    try {
      for(const flag of ['co','cost','delivery','bc']) await db.query("select set_config($1,'off',true)",[`steelbuild.${flag}_rpc`]);
      await create('deliveries',{delivery_title:'Flags restored'});
      for(const flag of ['co','cost','delivery','bc']) assert.equal((await db.query('select current_setting($1,true) value',[`steelbuild.${flag}_rpc`])).rows[0].value,'off');
      await db.exec('commit');
    } catch(error) { await db.exec('rollback'); throw error; }
  });
  await test('receipt actor deletion anonymizes attribution and project erasure removes receipts',async()=>{
    await admin();
    await db.query('delete from auth.users where id=$1',[ids.pm]);
    assert.equal(Number((await db.query('select count(*) n from numbered_create_receipts where actor_user_id=$1',[ids.pm])).rows[0].n),0);
    assert.ok(Number((await db.query('select count(*) n from numbered_create_receipts where actor_user_id is null')).rows[0].n)>0);
    await db.query('delete from user_projects where project_id=$1',[ids.project]);
    await db.query('delete from number_sequences where project_id=$1',[ids.project]);
    await db.query('delete from projects where id=$1',[ids.project]);
    assert.equal(Number((await db.query('select count(*) n from numbered_create_receipts where project_id=$1',[ids.project])).rows[0].n),0);
  });
  console.log(`Commercial create verification: ${passed} cases passed. No hosted data was written.`);
} finally { await db.close(); }
