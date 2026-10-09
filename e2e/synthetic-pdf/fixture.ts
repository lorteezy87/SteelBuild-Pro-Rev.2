import { createHash } from 'node:crypto';

export const STAGING = 'https://ndyfjffsulfbwpmwdmic.supabase.co';
export const APP = 'http://127.0.0.1:4173';
export const PROJECT = '6573ede6-e29d-4d15-8855-403029735231';
export const ORG = 'b0d853ce-2ad7-470e-bf23-c962cf72699f';
export const STATE = 'e2e/.auth/synthetic-pdf.json';
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const uuid = (seed: string) => { const h = hash(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

/** Valid, deterministic, one-page ASCII PDF; no external resources or JavaScript. */
export function syntheticPdf(revision: 'A' | 'B', run: string): Uint8Array {
  if (!/^\d{1,20}-\d{1,3}$/.test(run)) throw new Error('Invalid synthetic run identity');
  const content = `BT /F1 20 Tf 45 745 Td (SYNTHETIC - NOT FOR CONSTRUCTION) Tj 0 -40 Td (Revision ${revision} - automated evidence acceptance) Tj 0 -35 Td (Run ${run}) Tj ET\n40 100 530 525 re S\n${revision === 'B' ? '50 110 510 505 re S\n' : ''}`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}

export function fixtureFor(runId: string, attempt: string, now = new Date()) {
  const run = `${runId}-${attempt}`;
  if (!/^\d{1,20}-\d{1,3}$/.test(run) || !Number.isFinite(now.getTime())) throw new Error('Invalid synthetic run identity');
  return {
    run, date: now.toISOString().slice(0, 10),
    set: uuid(`${run}:set`), sheet: uuid(`${run}:sheet`), submittal: uuid(`${run}:submittal`),
    revisions: { A: uuid(`${run}:A`), B: uuid(`${run}:B`) },
    requests: { submit: uuid(`${run}:submit`), approve: uuid(`${run}:approve`), stale: uuid(`${run}:stale`), void: uuid(`${run}:void`) },
    paths: { A: `${ORG}/uploads/synthetic-pdf-${run}-A.pdf`, B: `${ORG}/uploads/synthetic-pdf-${run}-B.pdf` },
    setName: `SYNTHETIC PDF ${run}`, title: `SYNTHETIC PDF evidence ${run}`,
    number: `QA-PDF-${run}`, sheetNumber: `QA-PDF-${run}`,
  };
}
export type Fixture = ReturnType<typeof fixtureFor>;

export { assertStagingPublicKey as assertPublicKey } from '../drawingEvidenceTransport';

export function assertRuntime(env: Record<string, string | undefined> = process.env): void {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.SYNTHETIC_PDF_ACCEPTANCE !== 'reviewed-staging-only' || env.E2E_TARGET !== 'staging'
    || env.E2E_SUPABASE_URL !== STAGING || env.E2E_BASE_URL !== APP || env.E2E_EXPECTED_SUPABASE_REF !== 'ndyfjffsulfbwpmwdmic'
    || !/^[a-f0-9]{40}$/.test(env.ACCEPTANCE_CANDIDATE_SHA || '')) {
    throw new Error('Synthetic PDF acceptance requires the protected main-only staging workflow');
  }
  fixtureFor(env.GITHUB_RUN_ID || '', env.GITHUB_RUN_ATTEMPT || '');
}

export function setRecord(f: Fixture) { return { id: f.set, project_id: PROJECT, set_name: f.setName, category: 'shop', register: 'shop' }; }
export function sheetRecord(f: Fixture) { return { id: f.sheet, project_id: PROJECT, drawing_set_id: f.set, sheet_number: f.sheetNumber, title: f.title, stage: 'Not Started', file_url: f.paths.A, pdf_page: 1, revision_number: 'A' }; }
export function submittalRecord(f: Fixture) { return { id: f.submittal, project_id: PROJECT, submittal_number: f.number, title: f.title, submittal_type: 'Shop Drawing', status: 'Draft', drawing_set_ids: [f.set], total_rounds: 0 }; }
export function revisionRecord(f: Fixture, revision: 'A' | 'B') { return { id: f.revisions[revision], project_id: PROJECT, drawing_id: f.sheet, revision_code: revision, sheet_number: f.sheetNumber, sheet_title: f.title, version_number: revision === 'A' ? 1 : 2, is_current: false, file_url: f.paths[revision], pdf_page: 1, ...(revision === 'B' ? { supersedes_revision_id: f.revisions.A } : {}) }; }
export function workflowPatch(f: Fixture, action: keyof Fixture['requests']) {
  if (action === 'submit') return { status: 'Submitted', ball_in_court: 'EOR', submitted_date: f.date };
  if (action === 'void') return { status: 'Void', ball_in_court: null };
  return { status: 'Approved', ball_in_court: 'GC', approved_date: f.date, metadata: { ofs_checklist: { markups_incorporated: true, comments_addressed: true, sheets_ready: true, authorized_to_issue: true } } };
}
