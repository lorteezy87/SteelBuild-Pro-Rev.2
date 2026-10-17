import type { SupabaseClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { assertDisposableMutationEnvironment } from '../environment.js';
import { PROJECT, ORG, STAGING, fixtureFor, syntheticPdf, hash, setRecord, sheetRecord,
  submittalRecord, revisionRecord, workflowPatch } from '../synthetic-pdf/fixture.js';

type Environment = Record<string, string | undefined>;
type Row = Record<string, unknown>;
const TEMPLATE_SHEET = 'e0f7baec-b586-4b64-8c7b-296117c667c1';
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
function requireTrue(condition: unknown): asserts condition { if (!condition) throw new Error('Synthetic fab fixture validation failed'); }
function checked<T>(reply: { data: T; error: unknown }): T {
  if (reply.error) throw new Error('Synthetic fab fixture operation failed');
  return reply.data;
}

export function assertStagingFabPackageEnvironment(env: Environment, projectId: string, templateSheetId: string): void {
  assertDisposableMutationEnvironment(env);
  requireTrue(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF === 'refs/heads/staging'
    && env.GITHUB_EVENT_NAME === 'push' && env.E2E_SUPABASE_URL === STAGING
    && env.E2E_BASE_URL === 'https://steelbuild-pro-staging.n-lortz1987.workers.dev'
    && env.E2E_USER === 'staging.pm@steelbuild-pro.invalid' && projectId === PROJECT && templateSheetId === TEMPLATE_SHEET);
  fixtureFor(env.GITHUB_RUN_ID || '', env.GITHUB_RUN_ATTEMPT || '');
}

/** Fresh, explicitly synthetic approval evidence, never a repair of historical
 * approvals. Retained with the append-only release audit and its source PDF.
 * All mutations use the test PM's normal Auth client/RLS and workflow RPCs.
 */
export async function createStagingFabPackage(client: SupabaseClient, projectId: string, templateSheetId: string,
  env: Environment = process.env): Promise<string> {
  assertStagingFabPackageEnvironment(env, projectId, templateSheetId);
  const identityReply = await client.auth.getUser();
  requireTrue(!identityReply.error);
  const identity = identityReply.data;
  requireTrue(identity.user?.email === 'staging.pm@steelbuild-pro.invalid');
  const project: unknown = checked(await client.from('projects').select('id,org_id,name,project_number,is_deleted,on_hold').eq('id', PROJECT).single());
  const org: unknown = checked(await client.from('organizations').select('id,name').eq('id', ORG).single());
  const template: unknown = checked(await client.from('drawings').select('id,project_id,sheet_number').eq('id', TEMPLATE_SHEET).single());
  requireTrue(record(project) && project.org_id === ORG && project.name === 'STAGING — Warehouse Expansion'
    && project.project_number === 'STG-0001' && project.is_deleted === false && project.on_hold === false
    && record(org) && org.name === 'Example Fabrication (staging)' && record(template)
    && template.project_id === PROJECT && template.sheet_number === 'STG-CLEAN');
  const role: unknown = checked(await client.rpc('get_my_project_role', { p_project_id: PROJECT }));
  requireTrue(['owner', 'admin', 'pm'].includes(String(role)));
  // Each worker/retry reserves a fresh namespace; no overwrite/upsert or history repair.
  const f = fixtureFor(`${Date.now()}${randomInt(100000, 1000000)}`, env.GITHUB_RUN_ATTEMPT!);
  const bytes = syntheticPdf('A', f.run);
  checked(await client.storage.from('app-files').upload(f.paths.A, bytes, { contentType: 'application/pdf', upsert: false }));
  const downloaded = checked(await client.storage.from('app-files').download(f.paths.A));
  requireTrue(downloaded && hash(new Uint8Array(await downloaded.arrayBuffer())) === hash(bytes));
  const records: Array<[string, Row]> = [['drawing_sets', setRecord(f)], ['drawings', sheetRecord(f)],
    ['submittals', submittalRecord(f)], ['drawing_revisions', revisionRecord(f, 'A')]];
  for (const [table, row] of records) {
    checked(await client.from(table).insert(row));
  }
  checked(await client.from('drawing_sets').update({ current_submittal_id: f.submittal }).eq('id', f.set).eq('project_id', PROJECT));
  checked(await client.rpc('publish_drawing_revision', { p_revision_id: f.revisions.A, p_release_status: 'reviewed' }));
  for (const action of ['submit', 'approve'] as const) {
    const parent: unknown = checked(await client.from('submittals').select('id,updated_at,status,current_round_id').eq('id', f.submittal).eq('project_id', PROJECT).single());
    const coverage: unknown = checked(await client.rpc('get_submittal_revision_coverage', { p_submittal_id: f.submittal }));
    requireTrue(record(parent) && record(coverage) && Array.isArray(coverage.current_revision_ids)
      && coverage.current_revision_ids.length === 1 && coverage.current_revision_ids[0] === f.revisions.A);
    checked(await client.rpc('apply_submittal_round_workflow', {
      p_submittal_id: f.submittal, p_request_id: f.requests[action], p_expected_updated_at: parent.updated_at,
      p_expected_status: parent.status, p_expected_current_round_id: parent.current_round_id ?? null,
      p_expected_revision_ids: coverage.current_revision_ids, p_patch: workflowPatch(f, action), p_new_round: false,
    }));
  }
  checked(await client.rpc('publish_drawing_revision', { p_revision_id: f.revisions.A, p_release_status: 'released_for_shop' }));
  const gate: unknown = checked(await client.rpc('evaluate_fab_release_set', { p_project_id: PROJECT, p_drawing_set_id: f.set }));
  requireTrue(record(gate) && gate.drawing_set_id === f.set && gate.submittal_id === f.submittal
    && gate.sheet_count === 1 && gate.ok === true && Array.isArray(gate.blockers) && gate.blockers.length === 0);
  return f.sheet;
}
