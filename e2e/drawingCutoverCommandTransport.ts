/** Proposed finite contracts only. No request is forwarded or admitted here. */
import { types } from 'node:util';
import { z } from 'zod';
import { validateDrawingIntakeBindings } from './drawingCutoverIntakeBindings.ts';
import { parseDrawingCommandReceipt, parseDrawingCommandResult } from '../src/lib/drawingCommands/responses.ts';
import type { FixtureManifest } from './drawing-cutover-setup.ts';
import type { GuardedRequest } from './drawingCutoverNetworkGuard.ts';
import type { DrawingCommandResult, ReviewedDrawingCommand } from '../src/lib/drawingCommands/types.ts';
import type { Database } from '../src/types/supabase.ts';

export type DrawingCommandSlot = 'newSet' | 'revision' | 'manualIntake';
export interface DrawingCommandEnvelopeBinding {
  readonly slot: DrawingCommandSlot;
  readonly kind: 'writer' | 'receipt';
  readonly review: ReviewedDrawingCommand;
}
export interface DrawingCommandReadbackPlan {
  readonly binding: DrawingCommandEnvelopeBinding;
  readonly result: DrawingCommandResult;
  readonly requests: readonly Readonly<Pick<GuardedRequest, 'path'> & { actor: 'pm'; method: 'GET' }>[];
}
type Tables = Database['public']['Tables'];
export type DrawingProjectObservation = Pick<Tables['projects']['Row'], 'id' | 'org_id'>;
export type DrawingSetObservation = Pick<Tables['drawing_sets']['Row'], 'id' | 'project_id' | 'is_deleted' | 'deleted_at'>;
export type DrawingSheetObservation = Pick<Tables['drawings']['Row'], 'id' | 'project_id' | 'drawing_set_id'
  | 'file_url' | 'pdf_page' | 'is_deleted' | 'deleted_at' | 'is_superseded'>;
export type DrawingRevisionObservation = Pick<Tables['drawing_revisions']['Row'], 'id' | 'project_id' | 'drawing_id'
  | 'file_url' | 'pdf_page' | 'is_current' | 'archived_at' | 'release_status'>;

function requireEnvelope(condition: unknown): asserts condition {
  if (!condition) throw new Error('COMMAND_ENVELOPE_REFUSED');
}
function requireReadback(condition: unknown): asserts condition {
  if (!condition) throw new Error('COMMAND_READBACK_REFUSED');
}

/** Take a lossless JSON snapshot before validators can read getters or drop keys.
 * Errors are fixed codes and never contain supplied payloads or credentials. */
function copyJson(value: unknown): unknown {
  const ancestors = new Set<object>();
  function copy(current: unknown): unknown {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      requireEnvelope(Number.isFinite(current) && !Object.is(current, -0));
      return current;
    }
    requireEnvelope(typeof current === 'object' && current !== null && !types.isProxy(current) && !ancestors.has(current));
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    requireEnvelope(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null);
    ancestors.add(current);
    const names = Reflect.ownKeys(current);
    requireEnvelope(names.every(key => typeof key === 'string' && key !== '__proto__'));
    const keys = names as string[];
    if (array) requireEnvelope(keys.length === current.length + 1 && keys.every(key => key === 'length'
      || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < current.length)));
    const entries = keys.filter(key => !(array && key === 'length')).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      requireEnvelope(descriptor.enumerable && 'value' in descriptor);
      return [key, copy(descriptor.value)] as const;
    });
    ancestors.delete(current);
    return array ? entries.map(([, entry]) => entry) : Object.fromEntries(entries);
  }
  const result = copy(value);
  requireEnvelope(new TextEncoder().encode(JSON.stringify(result)).byteLength <= 1_048_576);
  return result;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left); const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(right, key)
    && equalJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
const uuid = z.string().uuid();
function sameUuid(left: string, right: string): boolean {
  return uuid.safeParse(left).success && uuid.safeParse(right).success && left.toLowerCase() === right.toLowerCase();
}
const envelopeSchema = z.object({ actor: z.literal('pm'), method: z.literal('POST'),
  path: z.enum(['/rest/v1/rpc/create_drawing_set_from_review', '/rest/v1/rpc/apply_drawing_set_revision', '/rest/v1/rpc/get_drawing_command_receipt']),
  body: z.unknown(),
}).strict();
const writerSchema = z.object({ p_request_id: uuid, p_request: z.unknown() }).strict();
const receiptSchema = z.object({ p_request_id: uuid, p_operation: z.enum(['create_set', 'revise_set']), p_request: z.unknown() }).strict();

/** Exact review equality, not permission. Revalidate the entire three-slot book
 * each time; no public entry point accepts a caller's prebuilt binding as trust. */
export function bindDrawingCommandEnvelope(fixture: FixtureManifest, request: GuardedRequest): DrawingCommandEnvelopeBinding {
  try {
    const manifest = copyJson(fixture) as FixtureManifest;
    requireEnvelope(manifest.version === 1 && manifest.projectRef === 'ndyfjffsulfbwpmwdmic');
    const book = validateDrawingIntakeBindings(manifest.intakeBindings, manifest);
    const envelope = envelopeSchema.parse(copyJson(request));
    const receipt = envelope.path === '/rest/v1/rpc/get_drawing_command_receipt';
    const body = receipt ? receiptSchema.parse(envelope.body) : writerSchema.parse(envelope.body);
    const operation = receipt ? receiptSchema.parse(body).p_operation
      : envelope.path === '/rest/v1/rpc/create_drawing_set_from_review' ? 'create_set' : 'revise_set';
    const slot = (['newSet', 'revision', 'manualIntake'] as const).find(name => {
      const plan = book.commands[name];
      return plan.operation === operation && plan.requestId === body.p_request_id && equalJson(plan.payload, body.p_request);
    });
    requireEnvelope(slot);
    const project = manifest.projects.find(p => sameUuid(p.id, book.projects.A1.id));
    const pm = manifest.actors.find(a => a.alias === 'pm');
    requireEnvelope(project && pm && uuid.safeParse(pm.id).success && uuid.safeParse(pm.orgId).success
      && uuid.safeParse(project.id).success && uuid.safeParse(project.orgId).success);
    const plan = book.commands[slot];
    const review: ReviewedDrawingCommand = { version: 1, requestId: plan.requestId,
      owner: { actorId: pm.id, orgId: project.orgId, projectId: project.id },
      ...(plan.operation === 'create_set' ? { operation: plan.operation, payload: plan.payload } : { operation: plan.operation, payload: plan.payload }),
    };
    return freeze({ slot, kind: receipt ? 'receipt' : 'writer', review });
  } catch { throw new Error('COMMAND_ENVELOPE_REFUSED'); }
}

const projectSelection = 'id,org_id';
const setSelection = 'id,project_id,is_deleted,deleted_at';
const drawingSelection = 'id,project_id,drawing_set_id,file_url,pdf_page,is_deleted,deleted_at,is_superseded';
const revisionSelection = 'id,project_id,drawing_id,file_url,pdf_page,is_current,archived_at,release_status';

/** Describe bounded, exact READ ONLY requests. This does not admit them to the
 * live guard, establish ownership/authorization or grant any later write. */
export function proposeDrawingCommandReadback(fixture: FixtureManifest, request: GuardedRequest, value: unknown): DrawingCommandReadbackPlan {
  const binding = bindDrawingCommandEnvelope(fixture, request);
  try {
    const response = copyJson(value);
    const receipt = binding.kind === 'receipt' ? parseDrawingCommandReceipt(response, binding.review) : null;
    requireReadback(!receipt || receipt.state === 'committed');
    const result = receipt?.state === 'committed' ? receipt.result : parseDrawingCommandResult(response, binding.review);
    const projectId = binding.review.owner.projectId;
    const get = (path: string) => ({ actor: 'pm' as const, method: 'GET' as const, path });
    const requests = [
      get(`/rest/v1/projects?id=eq.${projectId}&select=${projectSelection}`),
      get(`/rest/v1/drawing_sets?id=eq.${result.set_id}&project_id=eq.${projectId}&select=${setSelection}`),
      ...result.source_pages.flatMap(page => [
        get(`/rest/v1/drawings?id=eq.${page.drawing_id}&project_id=eq.${projectId}&select=${drawingSelection}`),
        get(`/rest/v1/drawing_revisions?id=eq.${page.revision_id}&project_id=eq.${projectId}&select=${revisionSelection}`),
      ]),
    ];
    requireReadback(requests.length <= 502);
    return freeze({ binding, result, requests });
  } catch { throw new Error('COMMAND_READBACK_REFUSED'); }
}

// Complete projections from generated Row types. Runtime literal checks below
// narrow nullable DB columns to the required live/current/received state.
const projectRow = z.object({ id: uuid, org_id: uuid }).strict();
const setRow = z.object({ id: uuid, project_id: uuid, is_deleted: z.literal(false), deleted_at: z.null() }).strict();
const drawingRow = z.object({ id: uuid, project_id: uuid, drawing_set_id: uuid, file_url: z.string(),
  pdf_page: z.number().int().positive(), is_deleted: z.literal(false), deleted_at: z.null(), is_superseded: z.union([z.literal(false), z.null()]),
}).strict();
const revisionRow = z.object({ id: uuid, project_id: uuid, drawing_id: uuid, file_url: z.string(), pdf_page: z.number().int().positive(),
  is_current: z.literal(true), archived_at: z.null(), release_status: z.literal('received'),
}).strict();
const observationsSchema = z.array(z.object({ path: z.string(), rows: z.array(z.unknown()).length(1) }).strict()).max(502);

/** Content checks on supplied observations only. Cannot prove authentic fetch,
 * creator provenance, PDF bytes, SQL source tokens/JSONB hashes, same/removed
 * sheet effects, topology or authorization. Returns no retry/write authority. */
export function validateDrawingCommandReadback(fixture: FixtureManifest, request: GuardedRequest, value: unknown, observations: unknown): DrawingCommandReadbackPlan {
  const plan = proposeDrawingCommandReadback(fixture, request, value);
  try {
    const supplied = observationsSchema.parse(copyJson(observations));
    requireReadback(supplied.length === plan.requests.length && new Set(supplied.map(row => row.path)).size === supplied.length);
    const byPath = new Map(supplied.map(row => [row.path, row.rows[0]]));
    requireReadback(plan.requests.every(expected => byPath.has(expected.path)));
    const rowAt = (index: number) => byPath.get(plan.requests[index].path);
    const owner = plan.binding.review.owner;
    const project: DrawingProjectObservation = projectRow.parse(rowAt(0)) as DrawingProjectObservation;
    const set: DrawingSetObservation = setRow.parse(rowAt(1)) as DrawingSetObservation;
    requireReadback(sameUuid(project.id, owner.projectId) && sameUuid(project.org_id, owner.orgId)
      && sameUuid(set.id, plan.result.set_id) && sameUuid(set.project_id, owner.projectId));
    plan.result.source_pages.forEach((page, index) => {
      const drawing: DrawingSheetObservation = drawingRow.parse(rowAt(2 + index * 2)) as DrawingSheetObservation;
      const revision: DrawingRevisionObservation = revisionRow.parse(rowAt(3 + index * 2)) as DrawingRevisionObservation;
      requireReadback(sameUuid(drawing.id, page.drawing_id) && sameUuid(drawing.project_id, owner.projectId)
        && sameUuid(drawing.drawing_set_id!, plan.result.set_id) && drawing.file_url === page.file_path && drawing.pdf_page === page.pdf_page
        && sameUuid(revision.id, page.revision_id) && sameUuid(revision.project_id, owner.projectId)
        && sameUuid(revision.drawing_id, page.drawing_id) && revision.file_url === page.file_path && revision.pdf_page === page.pdf_page);
    });
    return plan;
  } catch { throw new Error('COMMAND_READBACK_REFUSED'); }
}
