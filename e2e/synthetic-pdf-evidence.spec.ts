import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { observeReadOnlyPage, visitRegister } from './acceptance.js';
import { APP, PROJECT, ORG, STAGING, STATE, assertRuntime, fixtureFor, hash, syntheticPdf, setRecord, sheetRecord, submittalRecord, revisionRecord, workflowPatch, type Fixture } from './synthetic-pdf/fixture.js';
import { installBrowserGuard, ScopedTransport } from './synthetic-pdf/guard.js';

type Row = Record<string, unknown>;
type Phase = 'preflight' | 'created' | 'submitted' | 'approved' | 'stale' | 'cleanup';
const tables = ['drawing_sets', 'drawings', 'submittals', 'drawing_revisions', 'submittal_rounds', 'submittal_round_revision_evidence'] as const;

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Scoped staging operation failed (HTTP ${response.status})`);
  return response.status === 204 ? null : response.json();
}
async function storageMissing(response: Response): Promise<boolean> {
  return response.status === 404 || (response.status === 400 && String((await response.json()).statusCode) === '404');
}
async function rows(api: ScopedTransport, table: string): Promise<Row[]> {
  const where = table === 'projects' ? `id=eq.${PROJECT}` : table === 'organizations' ? `id=eq.${ORG}` : `project_id=eq.${PROJECT}`;
  const result = await json(await api.send(`/rest/v1/${table}?${where}&limit=100&select=*&order=id`));
  if (!Array.isArray(result) || result.length >= 100 || result.some(row => !row || typeof row.id !== 'string')) throw new Error('Incomplete synthetic fixture read');
  return result;
}
async function rpc(api: ScopedTransport, name: string, args: Row): Promise<Row> {
  return await json(await api.send(`/rest/v1/rpc/${name}`, 'POST', args)) as Row;
}
function ours(f: Fixture, row: Row): boolean {
  return [f.set, f.sheet, f.submittal, f.revisions.A, f.revisions.B].includes(String(row.id))
    || row.submittal_id === f.submittal || row.drawing_id === f.sheet;
}
async function existingFingerprint(api: ScopedTransport, f: Fixture): Promise<string> {
  const existing: Record<string, Row[]> = {};
  for (const table of [...tables, 'projects', 'organizations']) existing[table] = (await rows(api, table)).filter(row => !ours(f, row));
  return hash(JSON.stringify(existing));
}
async function submittal(api: ScopedTransport, f: Fixture) { return (await rows(api, 'submittals')).find(row => row.id === f.submittal); }
async function coverage(api: ScopedTransport, f: Fixture) { return rpc(api, 'get_submittal_revision_coverage', { p_submittal_id: f.submittal }); }
async function apply(api: ScopedTransport, f: Fixture, action: keyof Fixture['requests'], allowFailure = false) {
  const reviewed = await submittal(api, f); if (!reviewed) throw new Error('Missing synthetic submittal');
  const current = await coverage(api, f);
  const response = await api.send('/rest/v1/rpc/apply_submittal_round_workflow', 'POST', {
    p_submittal_id: f.submittal, p_request_id: f.requests[action],
    p_expected_updated_at: reviewed.updated_at, p_expected_status: reviewed.status,
    p_expected_current_round_id: reviewed.current_round_id ?? null,
    p_expected_revision_ids: current.current_revision_ids,
    p_patch: workflowPatch(f, action), p_new_round: false,
  });
  if (allowFailure) {
    // Check the controlled server refusal without retaining server payloads.
    expect(response.ok, 'Stale revision evidence must refuse another approval').toBe(false);
    const error = await response.json();
    expect(String(error.message).includes('ROUND_LEGACY_RECONCILIATION_REQUIRED')).toBe(true);
    return;
  }
  const result = await json(response) as Row;
  expect((result.submittal as Row)?.id).toBe(f.submittal);
}
async function patch(api: ScopedTransport, table: string, id: string, record: Row) {
  await json(await api.send(`/rest/v1/${table}?id=eq.${id}&project_id=eq.${PROJECT}`, 'PATCH', record));
}

async function renderEvidence(page: Page, f: Fixture, verified: boolean, info: TestInfo) {
  const probe = await observeReadOnlyPage(page, STAGING, PROJECT);
  for (const [name, width] of [['desktop', 1440], ['narrow', 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await visitRegister(page, 'submittals', { projectId: PROJECT, supabaseUrl: STAGING, fixtureText: f.title });
    const list = page.getByRole('region', { name: 'Submittal register list', exact: true });
    await list.getByRole('button', { name: /^Open submittal / }).filter({ has: page.getByText(f.title, { exact: true }) }).click();
    const panel = page.getByRole('region', { name: 'Exact revision evidence', exact: true });
    await expect(panel).toBeVisible();
    if (verified) await expect(panel.getByText('Exact revision evidence verified', { exact: true })).toBeVisible();
    else {
      await expect(panel.getByText('Exact revision evidence verified', { exact: true })).toHaveCount(0);
      await expect(panel.getByText('1 captured · 1 current · 1 missing · 1 superseded', { exact: true })).toBeVisible();
    }
    await panel.screenshot({ path: info.outputPath(`${verified ? 'approved' : 'stale'}-${name}.png`) });
    await page.goto('/DrawingSubmittalHub?hub_tab=matrix');
    const matrix = page.getByRole('table', { name: 'Approval matrix', exact: true });
    const row = matrix.getByRole('row').filter({ has: page.getByRole('button', { name: f.setName, exact: true }) });
    await expect(row.getByRole('link', { name: f.number, exact: true })).toBeVisible();
    await expect(row.getByText('Approved', { exact: true })).toBeVisible();
    await expect(row.getByText('Revision evidence required', { exact: true })).toHaveCount(verified ? 0 : 1);
    await row.screenshot({ path: info.outputPath(`${verified ? 'approved' : 'stale'}-matrix-${name}.png`) });
  }
  await probe.settle(); probe.assertHealthy();
}

test('real synthetic PDFs retain exact approval evidence and block a newer revision', async ({ context, page }, info) => {
  assertRuntime();
  const guard = await installBrowserGuard(context);
  const f = fixtureFor(process.env.GITHUB_RUN_ID!, process.env.GITHUB_RUN_ATTEMPT!);
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  const stored = state.origins.find((origin: { origin: string }) => origin.origin === APP)?.localStorage
    .find((value: { name: string }) => value.name === 'sb-ndyfjffsulfbwpmwdmic-auth-token')?.value;
  const session = JSON.parse(stored || 'null');
  if (!session?.access_token) throw new Error('Missing protected staging session');
  const api = new ScopedTransport(f, process.env.E2E_SUPABASE_ANON_KEY!, session.access_token);
  const before = await existingFingerprint(api, f);
  const journal: { phase: Phase; completed: string[]; cleanup: string; retained: Record<string, number>; pdfs: Array<{ revision: string; sha256: string; bytes: number }> } = {
    phase: 'preflight', completed: [], cleanup: 'not-started', retained: {}, pdfs: [],
  };
  let reserved = false;
  const confirmedUploads = new Set<'A' | 'B'>();
  const confirmedRevisions = new Set<'A' | 'B'>();
  let submittedEvidence = false;
  let submittedEvidenceHash: string | null = null;
  try {
    for (const table of tables) expect((await rows(api, table)).some(row => ours(f, row)), 'Reserved synthetic IDs must be unused').toBe(false);
    // Confirm paths are absent before any mutation. A retry never overwrites a source.
    for (const revision of ['A', 'B'] as const) {
      const prior = await api.send(`/storage/v1/object/authenticated/app-files/${f.paths[revision]}`);
      if (!await storageMissing(prior)) throw new Error('Reserved synthetic Storage path is occupied or inaccessible');
    }
    reserved = true;
    for (const revision of ['A', 'B'] as const) {
      const bytes = syntheticPdf(revision, f.run);
      await json(await api.send(`/storage/v1/object/app-files/${f.paths[revision]}`, 'POST', undefined, bytes));
      confirmedUploads.add(revision);
      const downloaded = await api.send(`/storage/v1/object/authenticated/app-files/${f.paths[revision]}`);
      if (!downloaded.ok) throw new Error('Synthetic PDF readback failed');
      expect(hash(new Uint8Array(await downloaded.arrayBuffer()))).toBe(hash(bytes));
      journal.pdfs.push({ revision, sha256: hash(bytes), bytes: bytes.byteLength });
    }
    for (const [table, record] of [['drawing_sets', setRecord(f)], ['drawings', sheetRecord(f)], ['submittals', submittalRecord(f)], ['drawing_revisions', revisionRecord(f, 'A')]] as const) {
      await json(await api.send(`/rest/v1/${table}`, 'POST', record));
      if (table === 'drawing_revisions') confirmedRevisions.add('A');
    }
    await patch(api, 'drawing_sets', f.set, { current_submittal_id: f.submittal });
    await rpc(api, 'publish_drawing_revision', { p_revision_id: f.revisions.A, p_release_status: 'reviewed' });
    journal.phase = 'created'; journal.completed.push('real-pdf-upload-and-sha-readback');
    await apply(api, f, 'submit');
    submittedEvidence = true;
    journal.phase = 'submitted';
    const submitted = await coverage(api, f);
    expect(submitted.ok).toBe(true); expect(submitted.captured_revision_ids).toEqual([f.revisions.A]);
    expect(submitted.current_revision_ids).toEqual([f.revisions.A]);
    submittedEvidenceHash = hash(JSON.stringify((await rows(api, 'submittal_round_revision_evidence')).filter(row => ours(f, row))));
    // This is a synthetic internal review of the known one-page fixture, with
    // no outstanding markups/comments and no external approval or transmission.
    await apply(api, f, 'approve');
    journal.phase = 'approved';
    const approved = await coverage(api, f);
    expect(approved.ok).toBe(true); expect(approved.submittal_status).toBe('Approved');
    const approvedGate = await rpc(api, 'evaluate_fab_release_set', { p_project_id: PROJECT, p_drawing_set_id: f.set });
    expect((approvedGate.blockers as Row[]).some(blocker => blocker.kind === 'revision_manifest_mismatch')).toBe(false);
    // Reviewed PDFs are intentionally not distributed to the shop. Approval
    // coverage is proved without inventing a fabrication release or shipment.
    expect(approvedGate.ok).toBe(false);
    await renderEvidence(page, f, true, info);
    journal.completed.push('submitted-approved-rendered-desktop-and-narrow');
    await json(await api.send('/rest/v1/drawing_revisions', 'POST', revisionRecord(f, 'B')));
    confirmedRevisions.add('B');
    await rpc(api, 'publish_drawing_revision', { p_revision_id: f.revisions.B, p_release_status: 'reviewed' });
    await patch(api, 'drawings', f.sheet, { file_url: f.paths.B, pdf_page: 1, revision_number: 'B' });
    journal.phase = 'stale';
    const stale = await coverage(api, f);
    expect(stale.ok).toBe(false); expect(stale.current_revision_ids).toEqual([f.revisions.B]);
    expect(stale.captured_revision_ids).toEqual([f.revisions.A]); expect(stale.stale_revision_ids).toEqual([f.revisions.A]);
    const gate = await rpc(api, 'evaluate_fab_release_set', { p_project_id: PROJECT, p_drawing_set_id: f.set });
    expect(gate.ok).toBe(false);
    expect((gate.blockers as Row[]).some(blocker => blocker.kind === 'revision_manifest_mismatch')).toBe(true);
    await apply(api, f, 'stale', true);
    await renderEvidence(page, f, false, info);
    journal.completed.push('new-revision-blocks-approval-and-canonical-release');
  } finally {
    info.setTimeout(420_000);
    if (reserved) {
      journal.phase = 'cleanup';
      try {
        const current = await submittal(api, f);
        if (current && (current.title !== f.title || current.submittal_type !== 'Shop Drawing'
          || JSON.stringify(current.drawing_set_ids) !== JSON.stringify([f.set]))) throw new Error('Synthetic cleanup identity changed');
        if (current && !current.is_deleted && current.status !== 'Void') await apply(api, f, 'void');
        const deletedAt = new Date().toISOString();
        for (const [table, id] of [['submittals', f.submittal], ['drawings', f.sheet], ['drawing_sets', f.set]] as const) {
          const record = (await rows(api, table)).find(row => row.id === id);
          if (!record) continue;
          if ((table === 'drawing_sets' && record.set_name !== f.setName)
            || (table === 'drawings' && (record.drawing_set_id !== f.set || record.sheet_number !== f.sheetNumber))) throw new Error('Synthetic cleanup identity changed');
          if (!record.is_deleted) await patch(api, table, id, { is_deleted: true, deleted_at: deletedAt });
          expect((await rows(api, table)).filter(row => row.id === id && !row.is_deleted)).toHaveLength(0);
        }
        for (const table of tables) journal.retained[table] = (await rows(api, table)).filter(row => ours(f, row)).length;
        const retainedRevisions = (await rows(api, 'drawing_revisions')).filter(row => ours(f, row));
        for (const revision of confirmedRevisions) expect(retainedRevisions.some(row => row.id === f.revisions[revision])).toBe(true);
        if (submittedEvidence) {
          expect(journal.retained.submittal_rounds).toBe(1);
          expect(journal.retained.submittal_round_revision_evidence).toBe(1);
          const evidence = (await rows(api, 'submittal_round_revision_evidence')).filter(row => ours(f, row));
          expect(evidence[0].drawing_revision_id).toBe(f.revisions.A);
          expect(evidence[0].file_url).toBe(f.paths.A);
          if (submittedEvidenceHash) expect(hash(JSON.stringify(evidence)), 'Captured revision evidence must remain byte-identical').toBe(submittedEvidenceHash);
        }
        // Preserve immutable evidence and original source bytes. Never delete or
        // rewrite source Storage or archive the shared project during cleanup.
        journal.pdfs = [];
        for (const revision of ['A', 'B'] as const) {
          const downloaded = await api.send(`/storage/v1/object/authenticated/app-files/${f.paths[revision]}`);
          if (await storageMissing(downloaded)) {
            expect(confirmedUploads.has(revision), 'A confirmed uploaded source must remain available').toBe(false);
            continue;
          }
          if (!downloaded.ok) throw new Error('Retained synthetic PDF is unavailable');
          const expected = syntheticPdf(revision, f.run);
          expect(hash(new Uint8Array(await downloaded.arrayBuffer()))).toBe(hash(expected));
          journal.pdfs.push({ revision, sha256: hash(expected), bytes: expected.byteLength });
        }
        journal.retained.storageObjects = journal.pdfs.length;
        journal.retained.storageBytes = journal.pdfs.reduce((total, pdf) => total + pdf.bytes, 0);
        if (journal.completed.includes('new-revision-blocks-approval-and-canonical-release')) {
          for (const table of ['drawing_sets', 'drawings', 'submittals', 'submittal_rounds', 'submittal_round_revision_evidence']) expect(journal.retained[table]).toBe(1);
          expect(journal.retained.drawing_revisions).toBe(2);
          expect(journal.retained.storageObjects).toBe(2);
        }
        expect(await existingFingerprint(api, f), 'Existing fixture rows must be unchanged').toBe(before);
        await guard.settle(); guard.assertHealthy();
        journal.retained.activeSets = 0; journal.retained.activeSheets = 0; journal.retained.activeSubmittals = 0;
        journal.cleanup = 'new-set-sheet-submittal-archived-sources-and-history-retained';
      } catch { journal.cleanup = 'incomplete-inspect-reserved-run'; throw new Error('Synthetic cleanup or existing-row preservation check failed'); }
      finally {
        mkdirSync('test-results/synthetic-pdf', { recursive: true });
        writeFileSync('test-results/synthetic-pdf/evidence.json', JSON.stringify({ run: f.run, ...journal }, null, 2));
      }
    }
  }
});
