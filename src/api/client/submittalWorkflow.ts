import { supabase } from '@/lib/supabase';
import { getActiveOrgGeneration, getActiveOrgId } from '@/lib/activeOrg';
import type { Json } from '@/types/supabase';
import type { RevisionCoverageSummary } from '@/lib/submittalRevisionEvidence';

export interface SubmittalReview {
  id: string;
  updated_at?: string | null;
  status?: string | null;
  current_round_id?: string | null;
  submittal_type?: string | null;
  submitted_date?: string | null;
  revision_coverage?: RevisionCoverageSummary | null;
}
export interface RevisionEvidence {
  id: string; project_id: string; submittal_id: string; round_id: string;
  drawing_set_id: string; drawing_id: string; drawing_revision_id: string;
  file_url: string; pdf_page: number | null; revision_code: string | null;
  storage_path: string;
  captured_by: string; captured_at: string; capture_kind: 'submitted' | 'legacy_attestation'; attestation: string | null;
}
export interface SubmittalRevisionCoverage {
  project_id: string; submittal_id: string; round_id: string | null;
  ok: boolean; reason: string | null;
  current_revision_ids: string[]; captured_revision_ids: string[];
  missing_revision_ids: string[]; stale_revision_ids: string[];
  missing_current_drawing_ids: string[]; foreign_drawing_set_ids: string[];
  empty_drawing_set_ids: string[];
  submittal_status: string; submittal_updated_at: string;
  evidence: RevisionEvidence[];
}
export interface WorkflowResult {
  submittal: Record<string, unknown> & { id: string };
  round: (Record<string, unknown> & { id: string }) | null;
  evidence: RevisionEvidence[];
}
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
export interface WorkflowInput {
  review: SubmittalReview; revisionIds: readonly string[]; patch: Record<string, unknown>;
  newRound?: boolean; requestId?: string; client?: RpcClient;
}
export const SUBMITTAL_WORKFLOW_FIELDS = new Set(['status', 'ball_in_court', 'submitted_date', 'returned_date', 'approved_date', 'current_round_id', 'total_rounds', 'round_number', 'revision', 'fab_release_override_reason', 'gate_override_reason']);
export function isSubmittalWorkflowPatch(patch: Record<string, unknown>): boolean {
  if (Object.keys(patch).some(key => SUBMITTAL_WORKFLOW_FIELDS.has(key))) return true;
  const metadata = patch.metadata;
  return !!metadata && typeof metadata === 'object' && ['ofs_checklist', 'ofs_override_reason', 'comment_override_reason', 'workflow_substatus'].some(key => key in metadata);
}
export function validateSubmittalCreate(record: Record<string, unknown>): void {
  if (record.submittal_type === 'Shop Drawing' && (record.status ?? 'Draft') !== 'Draft') {
    throw new Error('Create this Shop Drawing submittal as Draft, review the linked PDFs and revisions, then submit it through the status workflow. Imported approval or submission is not evidence.');
  }
}
export class SubmittalWorkflowError extends Error {
  constructor(message: string, readonly requestId: string, readonly outcomeUnknown: boolean, options?: ErrorOptions) {
    super(message + (outcomeUnknown ? ' The result is uncertain. Retry the same reviewed action to recover its original receipt, or refresh the register before starting another action.' : ''), options);
    this.name = 'SubmittalWorkflowError';
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
async function requestIdentity(payload: Record<string, unknown>): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(['submittal-workflow-v1', getActiveOrgId(), payload]))))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function reviewArgs(review: SubmittalReview, revisionIds: readonly string[], requireEvidence = true) {
  if (!review.id || !review.updated_at || !review.status) throw new Error('Refresh this submittal and review its current status before saving.');
  const shopDrawing = review.submittal_type === 'Shop Drawing';
  if (requireEvidence && shopDrawing && revisionIds.length === 0) throw new Error('Review the current drawing revisions before submitting or returning this Shop Drawing package.');
  return { p_submittal_id: review.id, p_expected_updated_at: review.updated_at, p_expected_status: review.status, p_expected_current_round_id: review.current_round_id ?? null, p_expected_revision_ids: shopDrawing ? [...new Set(revisionIds)].sort() : [] };
}
async function executeWorkflow(name: string, args: Record<string, unknown>, input: Pick<WorkflowInput, 'requestId' | 'client'>): Promise<WorkflowResult> {
  const generation = getActiveOrgGeneration();
  const requestId = input.requestId ?? await requestIdentity({ name, ...args });
  if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reopen this submittal before saving.');
  try {
    const { data, error } = await ((input.client ?? supabase) as unknown as RpcClient).rpc(name, { ...args, p_request_id: requestId });
    if (error) throw new SubmittalWorkflowError(error.message, requestId, !(/^[0-9A-Z]{5}$/.test(error.code ?? '') || /^PGRST/.test(error.code ?? '')), { cause: error });
    if (!data || typeof data !== 'object' || !('submittal' in data) || !data.submittal || typeof data.submittal !== 'object' || !('id' in data.submittal) || typeof data.submittal.id !== 'string') throw new SubmittalWorkflowError('The workflow result could not be confirmed.', requestId, true);
    if (generation !== getActiveOrgGeneration()) throw new SubmittalWorkflowError('Workspace changed while the save completed. Return to the original workspace and refresh the register.', requestId, true);
    return data as WorkflowResult;
  } catch (cause) {
    if (cause instanceof SubmittalWorkflowError) throw cause;
    throw new SubmittalWorkflowError(cause instanceof Error ? cause.message : String(cause), requestId, true, { cause });
  }
}
export async function applySubmittalWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const requireEvidence = !['Draft', 'Void', 'Revise and Resubmit', 'Rejected'].includes(String(input.patch.status ?? input.review.status));
  return executeWorkflow('apply_submittal_round_workflow', { ...reviewArgs(input.review, input.revisionIds, requireEvidence), p_patch: input.patch as Json, p_new_round: input.newRound ?? false }, input);
}
export async function reconcileSubmittalEvidence(input: Omit<WorkflowInput, 'patch' | 'newRound'> & { attestation: string }): Promise<WorkflowResult> {
  if (input.attestation.trim().length < 20) throw new Error('Describe the PDFs and transmittal you personally reviewed before attesting to legacy evidence.');
  return executeWorkflow('reconcile_submittal_round_evidence', { ...reviewArgs(input.review, input.revisionIds), p_attestation: input.attestation.trim() }, input);
}
export async function getSubmittalRevisionCoverage(submittalId: string): Promise<SubmittalRevisionCoverage> {
  const generation = getActiveOrgGeneration();
  const { data, error } = await (supabase as unknown as RpcClient).rpc('get_submittal_revision_coverage', { p_submittal_id: submittalId });
  if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reload revision evidence.');
  if (error) throw new Error(error.message);
  if (!isRevisionCoverage(data) || data.submittal_id !== submittalId) throw new Error('Revision evidence is unavailable. Refresh before making a workflow decision.');
  return data;
}

function isRevisionCoverage(value: unknown): value is SubmittalRevisionCoverage {
  if (!value || typeof value !== 'object') return false;
  const coverage = value as Record<string, unknown>;
  const idLists = ['current_revision_ids', 'captured_revision_ids', 'missing_revision_ids', 'stale_revision_ids', 'missing_current_drawing_ids', 'foreign_drawing_set_ids', 'empty_drawing_set_ids'];
  return typeof coverage.submittal_id === 'string' && typeof coverage.submittal_status === 'string'
    && typeof coverage.submittal_updated_at === 'string' && typeof coverage.ok === 'boolean'
    && (coverage.round_id === null || typeof coverage.round_id === 'string')
    && idLists.every(key => Array.isArray(coverage[key]) && coverage[key].every(id => typeof id === 'string' && !!id))
    && Array.isArray(coverage.evidence) && coverage.evidence.every(row => row && typeof row === 'object'
      && typeof row.id === 'string' && typeof row.file_url === 'string'
      && (row.pdf_page === null || typeof row.pdf_page === 'number'));
}

function sameTimestamp(left: string | null | undefined, right: string | null | undefined): boolean {
  const canonicalTime = (value: string | null | undefined) => value?.replace(/(?:Z|\+00:00)$/, 'Z').replace(/(T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/, (_match, seconds: string, fraction: string | undefined) => `${seconds}.${(fraction || '').padEnd(6, '0')}Z`);
  return !!left && !!right && canonicalTime(left) === canonicalTime(right);
}
/** Every requested row must be present; missing pages never mean no blockers. */
export async function hydrateSubmittalRevisionCoverage<T extends SubmittalReview>(rows: readonly T[], client: RpcClient = supabase as unknown as RpcClient): Promise<Array<T & { revision_coverage?: RevisionCoverageSummary | null }>> {
  const generation = getActiveOrgGeneration();
  const shopRows = rows.filter(row => row.submittal_type === 'Shop Drawing');
  const byId = new Map<string, SubmittalRevisionCoverage>();
  const ids = [...new Set(shopRows.map(row => row.id))];
  for (let start = 0; start < ids.length; start += 200) {
    if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reload revision evidence.');
    const chunk = ids.slice(start, start + 200);
    const { data, error } = await client.rpc('get_submittal_revision_coverages', { p_submittal_ids: chunk });
    if (error) throw new Error(`Revision evidence could not be loaded: ${error.message}`);
    if (!Array.isArray(data) || data.length !== chunk.length) throw new Error('Revision evidence is incomplete. Reload the register before relying on release status.');
    for (const coverage of data) {
      if (!isRevisionCoverage(coverage) || !chunk.includes(coverage.submittal_id) || byId.has(coverage.submittal_id)) throw new Error('Revision evidence is invalid. Reload the register.');
      byId.set(coverage.submittal_id, coverage);
    }
  }
  if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reload revision evidence.');
  return rows.map(row => {
    if (row.submittal_type !== 'Shop Drawing') return row;
    const coverage = byId.get(row.id);
    if (!coverage || coverage.submittal_status !== row.status || !sameTimestamp(coverage.submittal_updated_at, row.updated_at) || (coverage.round_id ?? null) !== (row.current_round_id ?? null)) throw new Error('A submittal changed while revision evidence loaded. Reload the register.');
    return { ...row, revision_coverage: coverage };
  });
}
