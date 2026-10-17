import { z } from 'zod';
import { DrawingCommandResponseError } from './errors.ts';
import { validateDrawingSourcePath } from './requestBuilders.ts';
import type { DrawingCommandReceipt, DrawingCommandResult, ReviewedDrawingCommand } from './types.ts';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const boundedCount = (max: number) => z.number().int().min(0).max(max);
const resultSchema = z.object({
  applied: z.literal(true), contract_version: z.literal(1), operation: z.enum(['create_set', 'revise_set']), payload_sha256: hash,
  request_id: uuid, project_id: uuid, set_id: uuid,
  revised: boundedCount(250), added: boundedCount(250), removed: boundedCount(250), sheet_count: boundedCount(250),
  zones_cloned: boundedCount(1000), links_cloned: boundedCount(2000), dependencies_cloned: boundedCount(2000),
  source_pages: z.array(z.object({ drawing_id: uuid, revision_id: uuid, file_path: z.string(), pdf_page: z.number().int().min(1).max(999999) }).strict()).max(250),
}).strict();

// PostgreSQL normalizes UUID output. Comparison keys apply only to validated
// UUID identities; reviewed paths, tokens, notes and output spellings stay exact.
function uuidKey(value: string): string {
  if (!uuid.safeParse(value).success) throw new DrawingCommandResponseError();
  return value.toLowerCase();
}
const sameUuid = (left: string, right: string) => uuidKey(left) === uuidKey(right);

/** Reconcile complete response identity/counts against the reviewed roster.
 * The hash is format checked only: this does not reproduce PostgreSQL JSONB hashing. */
export function parseDrawingCommandResult(value: unknown, draft: ReviewedDrawingCommand): DrawingCommandResult {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new DrawingCommandResponseError();
  const result = parsed.data;
  const roster = draft.payload.sheets;
  const changed = roster.filter((sheet) => sheet.action === 'added' || sheet.action === 'revised');
  const count = (action: string) => roster.filter((sheet) => sheet.action === action).length;
  const seenDrawings = new Set<string>();
  const seenRevisions = new Set<string>();
  const existingIds = new Set(roster.flatMap((sheet) => sheet.action === 'added' ? [] : [uuidKey(sheet.drawing_id)]));
  const priorRevisions = new Set(roster.flatMap((sheet) => sheet.action === 'added' || !sheet.expected_revision_id ? [] : [uuidKey(sheet.expected_revision_id)]));
  if (!sameUuid(result.request_id, draft.requestId) || result.operation !== draft.operation || !sameUuid(result.project_id, draft.owner.projectId)
    || !sameUuid(result.project_id, draft.payload.project_id)
    || (draft.operation === 'revise_set' && !sameUuid(result.set_id, draft.payload.set_id))
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
    const drawingKey = uuidKey(page.drawing_id);
    const revisionKey = uuidKey(page.revision_id);
    if (page.file_path !== sheet.file_path || page.pdf_page !== sheet.pdf_page
      || !validateDrawingSourcePath(page.file_path, draft.owner.projectId, draft.owner.orgId)
      || seenDrawings.has(drawingKey) || seenRevisions.has(revisionKey) || priorRevisions.has(revisionKey)
      || (sheet.action === 'revised' ? !sameUuid(page.drawing_id, sheet.drawing_id) : existingIds.has(drawingKey))) {
      throw new DrawingCommandResponseError();
    }
    seenDrawings.add(drawingKey);
    seenRevisions.add(revisionKey);
  });
  return result as DrawingCommandResult;
}

const receiptSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('committed'), result: z.unknown() }).strict(),
  z.object({ state: z.literal('pending') }).strict(), z.object({ state: z.literal('not_committed') }).strict(),
]);

/** Pending/absence is not a committed result, rollback proof or retry authority. */
export function parseDrawingCommandReceipt(value: unknown, draft: ReviewedDrawingCommand): DrawingCommandReceipt {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) throw new DrawingCommandResponseError();
  if (parsed.data.state === 'committed') return { state: 'committed', result: parseDrawingCommandResult(parsed.data.result, draft) };
  return { state: parsed.data.state };
}
