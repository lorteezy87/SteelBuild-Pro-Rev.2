import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const baseline = await readFile(new URL('./authorship-live-fixture.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../migrations/20261007084117_permit_authorship_cleanup_through_immutable_guards.sql', import.meta.url), 'utf8');
const hostedRegression = await readFile(new URL('../account_deletion_erasure.sql', import.meta.url), 'utf8');
const hostedSnapshot = hostedRegression.match(/create temp table retained_authorship_snapshot[\s\S]*?;/)?.[0];
const hostedSnapshotAssertion = hostedRegression.match(/assert not exists \(\s*\(select \* from retained_authorship_snapshot\)[\s\S]*?'FAIL 6: immutable report or frozen ticket\/backcharge content changed during authorship cleanup';/)?.[0];
assert.ok(hostedSnapshot && hostedSnapshotAssertion, 'Hosted retained-record assertion must exist');
const author = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammate = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = '0b000000-0000-4000-8000-000000000002';
const report = '0c000000-0000-4000-8000-000000000001';
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql VOLATILE AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION public.backcharge_transition_allowed(text,text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
    CREATE TABLE public.authorship_test_events(backcharge_id uuid, kind text);
    CREATE FUNCTION public.log_backcharge_event(uuid,text,text,text,text) RETURNS void LANGUAGE sql AS $$
      INSERT INTO public.authorship_test_events VALUES($1,$2)
    $$;
  `);
  await db.exec(baseline);
  await db.exec(`
    ALTER TABLE public.drawing_revision_summaries ADD CONSTRAINT authorship_report_fk FOREIGN KEY(generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.backcharges ADD CONSTRAINT authorship_backcharge_fk FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.backcharge_tm_tickets ADD CONSTRAINT authorship_ticket_fk FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    INSERT INTO auth.users VALUES('${author}'),('${teammate}');
    INSERT INTO public.drawing_revision_summaries(id,project_id,generated_by) VALUES('${report}','${project}','${author}');
  `);
  // Seed immutable historical financial rows before attaching the live guards.
  // All deletion and mutation assertions below run with every normal trigger.
  const statuses = ['draft','pending','approved','collected','void','rejected'];
  for (const [index, status] of statuses.entries()) {
    const id = `0d000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await db.query(`INSERT INTO public.backcharges(id,project_id,title,backcharge_number,status,amount,ticket_total,created_by)
      VALUES($1,$2,$3,$4,$5,123.45,123.45,$6)`, [id, project, status, `BC-${index}`, status, author]);
    await db.query(`INSERT INTO public.backcharge_tm_tickets(backcharge_id,project_id,ticket_number,labor_hours,labor_rate,amount,created_by)
      VALUES($1,$2,$3,2,100,123.45,$4)`, [id, project, `TM-${index}`, author]);
  }
  await db.exec(`
    CREATE TRIGGER trg_a_enforce_revision_summary_guards BEFORE INSERT OR DELETE OR UPDATE ON public.drawing_revision_summaries FOR EACH ROW EXECUTE FUNCTION public.enforce_revision_summary_guards();
    CREATE TRIGGER trg_backcharges_updated_at BEFORE UPDATE ON public.backcharges FOR EACH ROW EXECUTE FUNCTION public.backcharge_touch_updated_at();
    CREATE TRIGGER trg_enforce_backcharge_guards BEFORE INSERT OR DELETE OR UPDATE ON public.backcharges FOR EACH ROW EXECUTE FUNCTION public.enforce_backcharge_guards();
    CREATE TRIGGER trg_a_enforce_tm_ticket_guards BEFORE INSERT OR DELETE OR UPDATE ON public.backcharge_tm_tickets FOR EACH ROW EXECUTE FUNCTION public.enforce_tm_ticket_guards();
    CREATE TRIGGER trg_bc_tm_updated_at BEFORE UPDATE ON public.backcharge_tm_tickets FOR EACH ROW EXECUTE FUNCTION public.backcharge_touch_updated_at();
    CREATE TRIGGER trg_compute_tm_ticket_amount BEFORE INSERT OR UPDATE ON public.backcharge_tm_tickets FOR EACH ROW EXECUTE FUNCTION public.compute_tm_ticket_amount();
    CREATE TRIGGER trg_roll_tm_tickets AFTER INSERT OR UPDATE ON public.backcharge_tm_tickets FOR EACH ROW EXECUTE FUNCTION public.roll_tm_tickets_into_backcharge();
  `);
  // Baseline sensitivity: the actual FK-driven delete fails before the fix.
  await assert.rejects(db.query('DELETE FROM auth.users WHERE id=$1', [author]), /generated report is immutable|tickets are frozen/);
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1', [author])).rows[0].n, 1);
  const replacedFunctions = ['enforce_revision_summary_guards','enforce_tm_ticket_guards','compute_tm_ticket_amount','roll_tm_tickets_into_backcharge'];
  for (const name of replacedFunctions) {
    await db.exec(`REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.${name}() TO authenticated,service_role;`);
  }
  const attributesQuery = `SELECT proname,proowner::regrole::text,prosecdef,provolatile,proparallel,proisstrict,proleakproof,procost,proconfig,proacl::text,proargtypes::text,prorettype::regtype::text
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1) ORDER BY proname`;
  const attributesBefore = (await db.query(attributesQuery, [replacedFunctions])).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query(attributesQuery, [replacedFunctions])).rows, attributesBefore, 'four replacements must preserve ownership, ACLs, security attributes, signatures and configuration');

  for (const sql of [
    `UPDATE public.drawing_revision_summaries SET generated_by=NULL WHERE id='${report}'`,
    `UPDATE public.drawing_revision_summaries SET generated_by='${teammate}' WHERE id='${report}'`,
    `UPDATE public.drawing_revision_summaries SET generated_by=NULL, impact_level='high' WHERE id='${report}'`,
    `UPDATE public.drawing_revision_summaries SET impact_level='high' WHERE id='${report}'`,
  ]) await assert.rejects(db.exec(sql), /generated report is immutable/, 'live-author clearing/reassignment/content mutation must retain immutable rejection');
  for (const status of ['approved','collected','void','rejected']) {
    for (const update of ['created_by=NULL', `created_by='${teammate}'`, 'created_by=NULL, amount=999', 'labor_hours=999']) {
      await assert.rejects(db.query(`UPDATE public.backcharge_tm_tickets SET ${update} WHERE backcharge_id=(SELECT id FROM public.backcharges WHERE status=$1)`, [status]), /tickets are frozen/);
    }
  }
  await assert.rejects(db.exec('DELETE FROM public.drawing_revision_summaries'), /never hard-deleted/);
  await assert.rejects(db.exec('DELETE FROM public.backcharge_tm_tickets'), /never hard-deleted/);

  // Even inside a genuine Auth cascade (parent absent and nested trigger), a
  // second trigger cannot smuggle content/financial changes through cleanup.
  for (const [table, column, mutation, message] of [
    ['drawing_revision_summaries', 'generated_by', "new.impact_level := 'high'", /generated report is immutable/],
    ['backcharge_tm_tickets', 'created_by', 'new.amount := 999', /tickets are frozen/],
  ]) {
    await db.exec(`CREATE FUNCTION public.authorship_test_mixed_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF old.${column} IS NOT NULL AND new.${column} IS NULL THEN ${mutation}; END IF; RETURN new;
    END $$;
    CREATE TRIGGER aaa_authorship_test_mixed_write BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.authorship_test_mixed_write();`);
    await assert.rejects(db.query('DELETE FROM auth.users WHERE id=$1', [author]), message);
    assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1', [author])).rows[0].n, 1, 'rejected mixed cleanup rolls back Auth deletion');
    await db.exec(`DROP TRIGGER aaa_authorship_test_mixed_write ON public.${table}; DROP FUNCTION public.authorship_test_mixed_write();`);
  }

  const reportsBefore = (await db.query("SELECT to_jsonb(r)-'generated_by' AS row FROM public.drawing_revision_summaries r ORDER BY id")).rows;
  const ticketsBefore = (await db.query("SELECT to_jsonb(t)-'created_by'-'updated_at' AS row FROM public.backcharge_tm_tickets t ORDER BY id")).rows;
  const chargesBefore = (await db.query("SELECT to_jsonb(b)-'created_by'-'updated_at' AS row FROM public.backcharges b ORDER BY id")).rows;
  // Execute the actual hosted assertion in its PL/pgSQL scope, including its
  // existing r record variable, to catch alias/variable ambiguities locally.
  await db.exec(hostedSnapshot.replaceAll(':PY', `'${project}'`).replace(' on commit drop', ''));
  await db.query('DELETE FROM auth.users WHERE id=$1', [author]);
  await db.exec(`DO $$ DECLARE a constant uuid := '${author}'; r record; v_count bigint; BEGIN ${hostedSnapshotAssertion} END $$;`);
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1', [author])).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1', [teammate])).rows[0].n, 1);
  assert.deepEqual((await db.query("SELECT to_jsonb(r)-'generated_by' AS row FROM public.drawing_revision_summaries r ORDER BY id")).rows, reportsBefore);
  assert.deepEqual((await db.query("SELECT to_jsonb(t)-'created_by'-'updated_at' AS row FROM public.backcharge_tm_tickets t ORDER BY id")).rows, ticketsBefore);
  assert.deepEqual((await db.query("SELECT to_jsonb(b)-'created_by'-'updated_at' AS row FROM public.backcharges b ORDER BY id")).rows, chargesBefore);
  for (const [table, column, expected] of [['drawing_revision_summaries','generated_by',1],['backcharge_tm_tickets','created_by',6],['backcharges','created_by',6]]) {
    assert.equal((await db.query(`SELECT count(*)::int n FROM public.${table} WHERE ${column} IS NULL`)).rows[0].n, expected);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM public.authorship_test_events')).rows[0].n, 0, 'attribution cleanup must not log false financial edits');
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'O'")).rows[0].n, 0);
  await assert.rejects(db.query('UPDATE public.drawing_revision_summaries SET generated_by=$1 WHERE id=$2', [teammate, report]), /generated report is immutable/);
  await assert.rejects(db.exec("UPDATE public.backcharge_tm_tickets SET amount=999 WHERE backcharge_id=(SELECT id FROM public.backcharges WHERE status='approved')"), /tickets are frozen/);
  // Ordinary editable-ticket changes retain their recomputation and event path.
  await db.exec("UPDATE public.backcharge_tm_tickets SET labor_hours=3 WHERE backcharge_id=(SELECT id FROM public.backcharges WHERE status='draft')");
  assert.equal(Number((await db.query("SELECT amount FROM public.backcharges WHERE status='draft'")).rows[0].amount), 300);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.authorship_test_events')).rows[0].n, 1);
  console.log('PASS: real Auth FK cleanup through immutable report and six ticket states; direct and nested mixed-write bypasses rejected atomically; full retained records and financial history unchanged; normal ticket edits still compute and log.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
