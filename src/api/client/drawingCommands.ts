import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { buildCreateSetRequest, buildReviseSetRequest, validateDrawingSourcePath } from '@/lib/drawingCommands/requestBuilders';
import { classifyDrawingCommandError, DrawingCommandPreflightError, DrawingCommandResponseError } from '@/lib/drawingCommands/errors';
import type {
  DrawingCommandCapabilities, DrawingCommandOutcome, DrawingCommandReceipt, DrawingCommandResult,
  DrawingSourceObject, ReviewedDrawingCommand,
} from '@/lib/drawingCommands/types';
import type { Json } from '@/types/supabase';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const boundedCount = (max: number) => z.number().int().min(0).max(max);
const capabilitiesSchema = z.object({
  contract_version: z.literal(1), new_set: z.boolean(), revision: z.boolean(), write_boundary: z.boolean(),
  source_protection: z.boolean(), receipt_lookup: z.boolean(),
}).strict();
const sourceSchema = z.object({ path: z.string(), token: hash }).strict();
const resultSchema = z.object({
  applied: z.literal(true), contract_version: z.literal(1), operation: z.enum(['create_set', 'revise_set']), payload_sha256: hash,
  request_id: uuid, project_id: uuid, set_id: uuid,
  revised: boundedCount(250), added: boundedCount(250), removed: boundedCount(250), sheet_count: boundedCount(250),
  zones_cloned: boundedCount(1000), links_cloned: boundedCount(2000), dependencies_cloned: boundedCount(2000),
  source_pages: z.array(z.object({ drawing_id: uuid, revision_id: uuid, file_path: z.string(), pdf_page: z.number().int().min(1).max(999999) }).strict()).max(250),
}).strict();

/** Validate complete response identity and reconcile counts/source pages against the reviewed roster. */
export function parseDrawingCommandResult(value: unknown, draft: ReviewedDrawingCommand): DrawingCommandResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new DrawingCommandResponseError();
  const result = parsed.data;
  const roster = draft.payload.sheets;
  const changed = roster.filter((sheet) => sheet.action === 'added' || sheet.action === 'revised');
  const count = (action: string) => roster.filter((sheet) => sheet.action === action).length;
  const seenDrawings = new Set<string>();
  const seenRevisions = new Set<string>();
  const existingIds = new Set(roster.flatMap((sheet) => sheet.action === 'added' ? [] : [sheet.drawing_id]));
  const priorRevisions = new Set(roster.flatMap((sheet) => sheet.action === 'added' || !sheet.expected_revision_id ? [] : [sheet.expected_revision_id]));
  if (result.request_id !== draft.requestId || result.operation !== draft.operation || result.project_id !== draft.owner.projectId
    || result.project_id !== draft.payload.project_id
    || (draft.operation === 'revise_set' && result.set_id !== draft.payload.set_id)
    || result.added !== count('added') || result.revised !== count('revised') || result.removed !== count('removed')
    || result.sheet_count !== roster.length - count('removed') || result.source_pages.length !== changed.length
    || result.sheet_count === 0 || result.revised + result.added + result.removed === 0
    || (result.revised === 0 && (result.zones_cloned !== 0 || result.links_cloned !== 0 || result.dependencies_cloned !== 0))) {
    throw new DrawingCommandResponseError();
  }
  // SQL appends changed source pages in reviewed roster order, excluding same/removed.
  result.source_pages.forEach((page, index) => {
    const sheet = changed[index];
    if (sheet.action !== 'added' && sheet.action !== 'revised') throw new DrawingCommandResponseError();
    if (page.file_path !== sheet.file_path || page.pdf_page !== sheet.pdf_page
      || !validateDrawingSourcePath(page.file_path, draft.owner.projectId, draft.owner.orgId)
      || seenDrawings.has(page.drawing_id) || seenRevisions.has(page.revision_id) || priorRevisions.has(page.revision_id)
      || (sheet.action === 'revised' ? page.drawing_id !== sheet.drawing_id : existingIds.has(page.drawing_id))) {
      throw new DrawingCommandResponseError();
    }
    seenDrawings.add(page.drawing_id);
    seenRevisions.add(page.revision_id);
  });
  return result as DrawingCommandResult;
}

/** The capability endpoint is readiness only, never a client authorization decision. */
export async function getDrawingCommandCapabilities(projectId: string): Promise<DrawingCommandCapabilities> {
  if (!uuid.safeParse(projectId).success) throw new DrawingCommandPreflightError('invalid_review');
  try {
    const { data, error } = await supabase.rpc('get_drawing_command_capabilities', { p_project_id: projectId });
    const parsed = capabilitiesSchema.safeParse(data);
    if (error || !parsed.success) throw new DrawingCommandPreflightError('unavailable');
    return parsed.data as DrawingCommandCapabilities;
  } catch { throw new DrawingCommandPreflightError('unavailable'); }
}

export async function getDrawingRevisionSources(projectId: string, paths: readonly string[]): Promise<readonly DrawingSourceObject[]> {
  if (!uuid.safeParse(projectId).success || paths.length < 1 || paths.length > 250 || new Set(paths).size !== paths.length
    || paths.some((path) => !validateDrawingSourcePath(path, projectId))) throw new DrawingCommandPreflightError('invalid_review');
  const { data, error } = await supabase.rpc('get_drawing_revision_sources', { p_project_id: projectId, p_paths: [...paths] });
  const parsed = z.array(sourceSchema).min(1).max(250).safeParse(data);
  if (error || !parsed.success || parsed.data.length !== paths.length
    || new Set(parsed.data.map(({ path }) => path)).size !== paths.length
    || parsed.data.some(({ path }) => !paths.includes(path))) throw new DrawingCommandResponseError();
  return parsed.data as DrawingSourceObject[];
}

async function prepareDraft(draft: ReviewedDrawingCommand): Promise<ReviewedDrawingCommand> {
  const identity = z.object({ version: z.literal(1), requestId: uuid, operation: z.enum(['create_set', 'revise_set']),
    owner: z.object({ actorId: uuid, orgId: uuid, projectId: uuid }).strict(), payload: z.unknown(),
  }).strict().safeParse(draft);
  if (!identity.success || draft.owner.projectId !== draft.payload?.project_id) throw new DrawingCommandPreflightError('invalid_review');
  const payload = draft.operation === 'create_set' ? buildCreateSetRequest(draft.payload) : buildReviseSetRequest(draft.payload);
  if (!payload.source_objects.every(({ path }) => validateDrawingSourcePath(path, draft.owner.projectId, draft.owner.orgId))) {
    throw new DrawingCommandPreflightError('invalid_review');
  }
  // Snapshot before awaiting Auth/network so caller mutation cannot change a reviewed dispatch.
  const snapshot = Object.freeze({ ...draft, owner: Object.freeze({ ...draft.owner }), payload }) as ReviewedDrawingCommand;
  await assertCurrentActor(snapshot.owner.actorId);
  return snapshot;
}

async function assertCurrentActor(actorId: string): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== actorId) throw new DrawingCommandPreflightError('identity_changed');
  } catch { throw new DrawingCommandPreflightError('identity_changed'); }
}

/** Local cancellation only; never authority for SQL and never a claim of server rollback. */
export interface DrawingCommandFence { readonly assertCurrent?: () => void }

/** Preflight throws explicitly; only an attempted command RPC returns a write outcome. Never retries or falls back. */
export async function applyDrawingCommand(draft: ReviewedDrawingCommand, fence: DrawingCommandFence = {}): Promise<DrawingCommandOutcome> {
  fence.assertCurrent?.();
  const snapshot = await prepareDraft(draft);
  fence.assertCurrent?.();
  const capabilities = await getDrawingCommandCapabilities(snapshot.owner.projectId);
  fence.assertCurrent?.();
  if (!capabilities.new_set || !capabilities.revision || !capabilities.write_boundary || !capabilities.source_protection || !capabilities.receipt_lookup) {
    throw new DrawingCommandPreflightError('unavailable');
  }
  await assertCurrentActor(snapshot.owner.actorId);
  fence.assertCurrent?.();
  try {
    const { data, error } = await supabase.rpc(snapshot.operation === 'create_set' ? 'create_drawing_set_from_review' : 'apply_drawing_set_revision', {
      p_request_id: snapshot.requestId, p_request: snapshot.payload as unknown as Json,
    });
    if (error) return classifyDrawingCommandError(error);
    return { kind: 'committed', result: parseDrawingCommandResult(data, snapshot) };
  } catch (error: unknown) { return classifyDrawingCommandError(error); }
}

/** Lookup uses the same complete reviewed JSON; server hash and actor namespace are authoritative. */
export async function getDrawingCommandReceipt(draft: ReviewedDrawingCommand, fence: DrawingCommandFence = {}): Promise<DrawingCommandReceipt> {
  fence.assertCurrent?.();
  const snapshot = await prepareDraft(draft);
  fence.assertCurrent?.();
  const { data, error } = await supabase.rpc('get_drawing_command_receipt', {
    p_request_id: snapshot.requestId, p_operation: snapshot.operation, p_request: snapshot.payload as unknown as Json,
  });
  if (error) throw new DrawingCommandResponseError();
  const parsed = z.discriminatedUnion('state', [
    z.object({ state: z.literal('committed'), result: z.unknown() }).strict(),
    z.object({ state: z.literal('pending') }).strict(), z.object({ state: z.literal('not_committed') }).strict(),
  ]).safeParse(data);
  if (!parsed.success) throw new DrawingCommandResponseError();
  if (parsed.data.state === 'committed') return { state: 'committed', result: parseDrawingCommandResult(parsed.data.result, snapshot) };
  return { state: parsed.data.state };
}
